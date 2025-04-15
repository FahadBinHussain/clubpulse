'use server';

import { prisma } from '@/lib/prisma';
import { getSheetData } from '@/lib/googleSheets';
import { EmailStatus, Role } from '@prisma/client';
import { sendEmail } from '@/lib/resend';
import { CreateEmailResponse } from 'resend';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { revalidatePath } from 'next/cache';

// Define the expected structure for a row from the Google Sheet
// Adjust indices based on your actual column order
const COLUMN_INDICES = {
  NAME: 0,
  EMAIL: 1,
  ACTIVITY_COUNT: 2,
  LAST_UPDATED: 3, // Assuming this exists, might not be needed for this action
  ROLE: 4,           // Assuming this exists
  PERSONALITY_TAG: 5 // Assuming this exists
};

interface ClubMemberData {
  name: string;
  email: string;
  activityCount: number;
  role?: string; // Optional based on your sheet
  personalityTag?: string; // Optional based on your sheet
  rowIndex: number; // Original row index for reference/debugging
}

// Define the global activity threshold
const ACTIVITY_THRESHOLD = 5;
// Define the range to read from the sheet via environment variable
const sheetMemberDataRange = process.env.GOOGLE_SHEET_MEMBER_DATA_RANGE;
// *** IMPORTANT: Update this range based on your actual sheet name and data columns ***
// const SHEET_RANGE = 'Sheet1!A2:F'; // <-- Removed hardcoded value

export async function checkMemberActivity(): Promise<{ success: boolean; message: string; checked?: number; flagged?: number; errors?: number }> {
  console.log("Starting member activity check...");

  // --- Authorization Check --- 
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== Role.PANEL) {
      console.warn('Unauthorized attempt to run checkMemberActivity. User:', session?.user?.email);
      return { success: false, message: "Unauthorized: You do not have permission to perform this action." };
  }
  console.log(`Authorized user ${session.user.email} is performing activity check.`);
  // --- End Authorization Check ---

  // Check if the range is configured
  if (!sheetMemberDataRange) {
    console.error("GOOGLE_SHEET_MEMBER_DATA_RANGE environment variable is not set.");
    return { success: false, message: "Member data sheet range is not configured." };
  }

  let checkedCount = 0;
  let flaggedCount = 0;
  let belowThresholdCount = 0;
  let errorCount = 0;

  try {
    const rawData = await getSheetData(sheetMemberDataRange);

    if (rawData === null) {
      return { success: false, message: "Failed to fetch data from Google Sheet." };
    }

    if (rawData.length === 0) {
        return { success: true, message: "No member data found in the specified range.", checked: 0, flagged: 0 };
    }

    console.log(`Fetched ${rawData.length} rows from sheet.`);
    checkedCount = rawData.length;

    const membersToProcess: ClubMemberData[] = [];

    // --- Data Parsing and Validation ---
    rawData.forEach((row, index) => {
      const emailValue = row[COLUMN_INDICES.EMAIL];
      const activityCountValue = row[COLUMN_INDICES.ACTIVITY_COUNT];
      const nameValue = row[COLUMN_INDICES.NAME];
      const roleValue = row[COLUMN_INDICES.ROLE];
      const personalityTagValue = row[COLUMN_INDICES.PERSONALITY_TAG];

      // Validate and process email
      if (typeof emailValue !== 'string' || !emailValue) {
        console.warn(`Skipping row ${index + 2}: Invalid or missing email.`);
        errorCount++;
        return; // Skip this row
      }
      const email = emailValue; // Guaranteed non-empty string

      // Validate and process activity count
      if (activityCountValue === undefined || activityCountValue === null) {
         console.warn(`Skipping row ${index + 2}: Missing activity count.`);
         errorCount++;
         return; // Skip this row
      }

      let countStr: string;
      if (typeof activityCountValue === 'number') {
        countStr = String(activityCountValue);
      } else if (typeof activityCountValue === 'string') {
        countStr = activityCountValue;
      } else {
          console.warn(`Skipping row ${index + 2}: Invalid activity count type '${typeof activityCountValue}' value '${activityCountValue}'.`);
          errorCount++;
          return; // Skip this row
      }

      const activityCount = parseInt(countStr, 10);
      if (isNaN(activityCount)) {
        console.warn(`Skipping row ${index + 2}: Invalid activity count value (parsed from '${countStr}').`);
        errorCount++;
        return; // Skip this row
      }

      // Process name: Ensure it's a string, default to empty string otherwise
      const name = typeof nameValue === 'string' ? nameValue : '';

      // Process role: Ensure it's a string, default to undefined otherwise
      const role = typeof roleValue === 'string' ? roleValue : undefined;

      // Process personalityTag: Ensure it's a string, default to undefined otherwise
      const personalityTag = typeof personalityTagValue === 'string' ? personalityTagValue : undefined;

      // Add validated data to the list
      membersToProcess.push({
        name: name,
        email: email,
        activityCount: activityCount,
        role: role,
        personalityTag: personalityTag,
        rowIndex: index + 2
      });
    });

    console.log(`Parsed ${membersToProcess.length} valid members.`);

    // --- Threshold Check and DB Operations ---
    for (const member of membersToProcess) {
      if (member.activityCount < ACTIVITY_THRESHOLD) {
        belowThresholdCount++;

        // ---> Check for existing QUEUED, APPROVED, CANCELED, or SENT email for this recipient <--- 
        const existingNonFailedEmail = await prisma.emailQueue.findFirst({
          where: {
            recipientEmail: member.email,
            status: {
              // Include CANCELED and SENT in the statuses to check
              in: [
                EmailStatus.QUEUED,
                EmailStatus.APPROVED,
                EmailStatus.CANCELED,
                EmailStatus.SENT 
              ] 
            }
          },
          select: { id: true, status: true } // Get status for logging
        });

        if (existingNonFailedEmail) {
          console.log(`Skipping email for ${member.email}. An email is already pending, was canceled, or was sent (ID: ${existingNonFailedEmail.id}, Status: ${existingNonFailedEmail.status}).`);
          continue; // Skip to the next member
        }
        // ---> End Check <--- 

        // Only proceed if no QUEUED, APPROVED, CANCELED, or SENT email was found
        flaggedCount++;
        console.log(`Flagging member: ${member.email} (Activity: ${member.activityCount})`);

        // TODO: Determine template and content based on role/tag later
        const emailSubject = `Club Activity Alert for ${member.name}`;
        const emailBody = `Hi ${member.name},\n\nYour current activity count is ${member.activityCount}, which is below the threshold of ${ACTIVITY_THRESHOLD}. Please increase your participation.\n\nRegards,\nClubPulse`;
        const templateIdentifier = 'low_activity_generic'; // Placeholder

        try {
          // Use Prisma transaction to ensure both operations succeed or fail together
          await prisma.$transaction([
            // 1. Create EmailQueue entry
            prisma.emailQueue.create({
              data: {
                recipientEmail: member.email,
                recipientName: member.name,
                subject: emailSubject,
                bodyHtml: emailBody, // Store plain text for now, replace with HTML/MJML later
                template: templateIdentifier,
                status: EmailStatus.QUEUED,
              },
            }),
            // 2. Create WarningLog entry
            prisma.warningLog.create({
              data: {
                recipientEmail: member.email,
                recipientName: member.name,
                activityCount: member.activityCount,
                threshold: ACTIVITY_THRESHOLD,
                templateUsed: templateIdentifier,
                status: EmailStatus.QUEUED, // Matches EmailQueue initial status
              },
            }),
          ]);
           console.log(`Successfully queued email and logged warning for ${member.email}`);
        } catch (dbError) {
            console.error(`Failed to process member ${member.email} (Row ${member.rowIndex}):`, dbError);
            errorCount++;
             // Decide if you want to stop the whole process on a single DB error or just log and continue
            // For now, we log and continue
        }
      }
    }

    const message = `Activity check complete. Checked: ${checkedCount}, Below Threshold: ${belowThresholdCount}, Newly Flagged: ${flaggedCount}, Errors: ${errorCount}.`;
    console.log(message);
    return { success: true, message, checked: checkedCount, flagged: flaggedCount, errors: errorCount };

  } catch (error) {
    console.error("Error during member activity check:", error);
    return { success: false, message: `An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// --- Server Action: Process Email Queue (Sends APPROVED emails) ---
export async function processEmailQueue(): Promise<{ success: boolean; message: string; processed?: number; sent?: number; failed?: number }> {
    console.log("Starting approved email queue processing..."); // Updated log
    let processedCount = 0;
    let sentCount = 0;
    let failedCount = 0;

    try {
        // 1. Fetch APPROVED emails
        const emailsToProcess = await prisma.emailQueue.findMany({
            where: {
                status: EmailStatus.APPROVED, // <-- Changed from QUEUED to APPROVED
            },
        });

        processedCount = emailsToProcess.length;

        if (processedCount === 0) {
            const message = "Email queue processing complete. No emails were approved for sending."; // Updated log
            console.log(message);
            return { success: true, message, processed: 0, sent: 0, failed: 0 };
        }

        console.log(`Found ${processedCount} emails approved for sending.`); // Updated log

        // 2. Process each email
        for (const email of emailsToProcess) {
            let finalStatus: EmailStatus;
            let sendResult: CreateEmailResponse | null = null; // Initialize sendResult
            try {
                console.log(`Attempting to send APPROVED email ID ${email.id} to ${email.recipientEmail}`); // Updated log
                // 3. Attempt to send email
                sendResult = await sendEmail({
                    to: email.recipientEmail,
                    subject: email.subject,
                    html: email.bodyHtml,
                });

                if (sendResult && !sendResult.error) {
                    finalStatus = EmailStatus.SENT;
                    sentCount++;
                    console.log(`Successfully sent email ID ${email.id} to ${email.recipientEmail}. Resend ID: ${sendResult.data?.id}`);
                } else {
                    finalStatus = EmailStatus.FAILED;
                    failedCount++;
                    const errorMessage = sendResult?.error?.message || 'Unknown Resend error';
                    console.error(`Failed to send email ID ${email.id} to ${email.recipientEmail}: ${errorMessage}`);
                }
            } catch (sendError) {
                finalStatus = EmailStatus.FAILED;
                failedCount++;
                console.error(`Error processing email ID ${email.id} for ${email.recipientEmail} (exception during send):`, sendError);
            }

            // 4. Update status in DB (EmailQueue and WarningLog)
            try {
                await prisma.$transaction([
                    prisma.emailQueue.update({
                        where: { id: email.id },
                        data: { status: finalStatus }, // Update EmailQueue to SENT or FAILED
                    }),
                    // Update related WarningLog entry
                    prisma.warningLog.updateMany({
                         where: {
                             recipientEmail: email.recipientEmail,
                             templateUsed: email.template, 
                             status: EmailStatus.APPROVED // Only update logs whose status was APPROVED
                         },
                         data: { 
                            status: finalStatus, // Update WarningLog to SENT or FAILED
                            emailSentAt: finalStatus === EmailStatus.SENT ? new Date() : null // Add timestamp if sent
                         },
                    }),
                ]);
                 console.log(`Updated status to ${finalStatus} for email ID ${email.id} and related warning log(s).`);
            } catch (dbError) {
                console.error(`Failed to update status for email ID ${email.id} in database:`, dbError);
                if (finalStatus !== EmailStatus.FAILED) {
                    failedCount++;
                    if (finalStatus === EmailStatus.SENT) sentCount--;
                }
                finalStatus = EmailStatus.FAILED;
            }
        }

        const message = `Email queue processing finished. Processed: ${processedCount}, Sent: ${sentCount}, Failed: ${failedCount}.`;
        console.log(message);
        return { success: true, message, processed: processedCount, sent: sentCount, failed: failedCount };

    } catch (error) {
        console.error("Error during email queue processing:", error);
        return { success: false, message: `An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}` };
    }
}

// --- Server Action: Get Queued Emails (for Admin Panel) ---
export async function getEmailQueue(): Promise<{ success: boolean; message: string; emails?: any[] }> {
  console.log("Attempting to fetch queued emails for admin panel...");

  // --- Authorization Check --- 
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== Role.PANEL) {
      console.warn('Unauthorized attempt to fetch email queue. User:', session?.user?.email);
      return { success: false, message: "Unauthorized: You do not have permission to view the email queue." };
  }
  console.log(`Authorized user ${session.user.email} is fetching the email queue.`);
  // --- End Authorization Check ---

  try {
    const queuedEmails = await prisma.emailQueue.findMany({
      where: {
        status: EmailStatus.QUEUED,
      },
      orderBy: {
        createdAt: 'asc', // Show oldest queued first
      },
      select: { // Select only needed fields for the UI
        id: true,
        recipientEmail: true,
        recipientName: true,
        subject: true,
        template: true,
        createdAt: true,
        // Exclude bodyHtml for brevity in the list view
      }
    });

    // Log the emails being returned
    console.log("Emails being returned by getEmailQueue:", JSON.stringify(queuedEmails, null, 2));

    return { success: true, message: "Fetched queued emails.", emails: queuedEmails };

  } catch (error) {
    console.error("Error fetching email queue:", error);
    return { success: false, message: `An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// --- Server Action: Update Email Status (Approve/Cancel) ---
export async function updateEmailStatus(
  emailId: string, 
  newStatus: EmailStatus
): Promise<{ success: boolean; message: string }> {
  console.log(`Attempting to update email ${emailId} to status ${newStatus}...`);

  // --- Authorization Check --- 
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== Role.PANEL) {
      console.warn(`Unauthorized attempt to update email status for ${emailId}. User:`, session?.user?.email);
      return { success: false, message: "Unauthorized: You do not have permission to update email status." };
  }
  console.log(`Authorized user ${session.user.email} is updating email ${emailId} to ${newStatus}.`);
  // --- End Authorization Check ---

  if (newStatus !== EmailStatus.APPROVED && newStatus !== EmailStatus.CANCELED) {
     return { success: false, message: "Invalid target status specified." };
  }

  try {
    // Find the email to get details needed for updating the WarningLog
    const emailToUpdate = await prisma.emailQueue.findUnique({
        where: { id: emailId },
        select: { recipientEmail: true, template: true, status: true } // Get current status too
    });

    if (!emailToUpdate) {
        return { success: false, message: `Email with ID ${emailId} not found.` };
    }
    
    // Ensure we are only updating emails that are currently QUEUED
    if (emailToUpdate.status !== EmailStatus.QUEUED) {
        return { success: false, message: `Email ${emailId} is not in QUEUED status (current: ${emailToUpdate.status}). Cannot update.` };
    }

    // Use a transaction to update both EmailQueue and WarningLog
    await prisma.$transaction([
      prisma.emailQueue.update({
        where: { id: emailId },
        data: { status: newStatus },
      }),
      prisma.warningLog.updateMany({
        where: {
          recipientEmail: emailToUpdate.recipientEmail,
          templateUsed: emailToUpdate.template,
          status: EmailStatus.QUEUED, // Important: Only update logs linked to the QUEUED email
        },
        data: { status: newStatus }, // Update WarningLog status to match
      }),
    ]);

    console.log(`Successfully updated email ${emailId} and related warning log(s) to ${newStatus}.`);
    
    // TODO: Consider adding an AdminLog entry here for audit trail
    // Example: await createAdminLog(session.user.id, session.user.email, `updated_email_status`, { emailId, newStatus });

    // Revalidate the path where the queue is displayed (assuming it's the home page for now)
    revalidatePath('/'); 

    return { success: true, message: `Email status updated to ${newStatus}.` };

  } catch (error) {
    console.error(`Error updating status for email ${emailId} to ${newStatus}:`, error);
    return { success: false, message: `An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}` };
  }
} 