'use server';

import { prisma } from '@/lib/prisma';
import { getSheetData } from '@/lib/googleSheets';
import { EmailStatus, Role } from '@prisma/client';
import { sendEmail } from '@/lib/resend';
import { CreateEmailResponse } from 'resend';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
// Import necessary modules for MJML rendering
import mjml from 'mjml';
import fs from 'fs/promises';
import path from 'path';

// Define the expected structure for a row from the Google Sheet
// Adjust indices based on your actual column order
const COLUMN_INDICES = {
  NAME: 0,
  EMAIL: 1,
  ACTIVITY_COUNT: 2,
  ROLE: 3,           // Role is now index 3 (Column D)
};

interface ClubMemberData {
  name: string;
  email: string;
  activityCount: number;
  role?: string; // Role is now mandatory based on new structure, but keep optional for safety
  rowIndex: number; // Original row index for reference/debugging
}

// Define the global activity threshold
const ACTIVITY_THRESHOLD = 5;
// Define the range to read from the sheet via environment variable
const sheetMemberDataRange = process.env.GOOGLE_SHEET_MEMBER_DATA_RANGE;
// *** IMPORTANT: Update this range based on your actual sheet name and data columns ***
// const SHEET_RANGE = 'Sheet1!A2:F'; // <-- Removed hardcoded value

// --- Helper Function: Get Template Info based on Role --- 
function getTemplateInfo(role?: string): { filename: string; identifier: string } {
  const normalizedRole = (role || '').trim().toLowerCase();

  // Case-insensitive matching for roles
  switch (normalizedRole) {
    case 'co-directors':
    case 'co director': // Handle variations
    case 'co-director':
      return { filename: 'low_activity_co_director.mjml', identifier: 'low_activity_co_director' };
    case 'senior executives':
    case 'senior executive':
      return { filename: 'low_activity_senior_executive.mjml', identifier: 'low_activity_senior_executive' };
    case 'executives':
    case 'executive':
      return { filename: 'low_activity_executive.mjml', identifier: 'low_activity_executive' };
    case 'junior executives':
    case 'junior executive':
      return { filename: 'low_activity_junior_executive.mjml', identifier: 'low_activity_junior_executive' };
    case 'new recruits':
    case 'new recruit':
      return { filename: 'low_activity_new_recruit.mjml', identifier: 'low_activity_new_recruit' };
    case 'general members':
    case 'general member':
    case 'member': // Common variation
       return { filename: 'low_activity_general_member.mjml', identifier: 'low_activity_general_member' };
    // TODO: Add cases for Personality Tags if needed, maybe with precedence logic
    // case 'introvert': etc...
    default:
      // Fallback to general member template if role is missing, empty, or doesn't match
      console.log(`Role '${role}' not matched or empty, defaulting to general member template.`);
      return { filename: 'low_activity_general_member.mjml', identifier: 'low_activity_general_member' };
  }
}
// --- End Helper Function ---

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

      // Validate email
      if (typeof emailValue !== 'string' || !emailValue) {
        console.warn(`Skipping row ${index + 2}: Invalid or missing email.`);
        errorCount++;
        return; 
      }
      const email = emailValue; 

      // Validate activity count
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
      
      // Process name
      const name = typeof nameValue === 'string' ? nameValue : '';

      // Process role: Now expected in column D (index 3)
      const role = typeof roleValue === 'string' ? roleValue : undefined; 
      // Log if role is missing, as it's now more critical
      if (!role) {
         console.warn(`Row ${index + 2}: Missing role value (used for template selection).`);
         // Decide if you want to error out or let getTemplateInfo handle the default
      }

      // Add validated data to the list (without personalityTag)
      membersToProcess.push({
        name: name,
        email: email,
        activityCount: activityCount,
        role: role,
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
        console.log(`Flagging member: ${member.email} (Activity: ${member.activityCount}) using template: ${getTemplateInfo(member.role).identifier}`);

        // --- Determine and Load Specific Template --- 
        const { filename: templateFilename, identifier: templateIdentifier } = getTemplateInfo(member.role);
        let mjmlTemplateContent = '';
        let renderedHtml = '';
        
        try {
          const templatePath = path.join(process.cwd(), 'src', 'emails', templateFilename);
          mjmlTemplateContent = await fs.readFile(templatePath, 'utf-8');
          console.log(`Loaded template '${templateFilename}' for ${member.email} (Role: ${member.role})`);
        } catch (templateError) {
          console.error(`Failed to load template '${templateFilename}' for ${member.email}:`, templateError);
          errorCount++;
          // Try falling back to the default template if specific one fails?
          // For now, just skip this member if their specific template is missing.
          continue; 
        }
        // --- End Load --- 

        // Only proceed if template content was loaded
        if (!mjmlTemplateContent) {
          console.warn(`Skipping DB entry for ${member.email} due to missing template content for '${templateFilename}'.`);
          continue;
        }

        const emailSubject = `Club Activity Alert for ${member.name || 'Member'}`;
        
        try {
            // Personalize the loaded MJML template
            const personalizedMjml = mjmlTemplateContent
                .replace(/{{name}}/g, member.name || 'Member')
                .replace(/{{activityCount}}/g, member.activityCount.toString())
                .replace(/{{threshold}}/g, ACTIVITY_THRESHOLD.toString());

            // Render MJML to HTML
            const { html, errors: mjmlErrors } = mjml(personalizedMjml, {});

            if (mjmlErrors.length > 0) {
                console.warn(`MJML rendering errors for ${member.email} using template ${templateIdentifier}:`, mjmlErrors);
                errorCount++;
                continue; 
            }
            renderedHtml = html;

        } catch (renderError) {
            console.error(`Error rendering template '${templateIdentifier}' for ${member.email}:`, renderError);
            errorCount++;
            continue; 
        }
        
        if (!renderedHtml) { 
            console.warn(`Skipping DB entry for ${member.email} due to empty rendered HTML from template '${templateIdentifier}'.`);
            continue;
        }

        try {
          // Use Prisma transaction 
          await prisma.$transaction([
            prisma.emailQueue.create({
              data: {
                recipientEmail: member.email,
                recipientName: member.name,
                subject: emailSubject,
                bodyHtml: renderedHtml, 
                template: templateIdentifier, // <-- Use the specific identifier
                status: EmailStatus.QUEUED,
              },
            }),
            prisma.warningLog.create({
              data: {
                recipientEmail: member.email,
                recipientName: member.name,
                activityCount: member.activityCount,
                threshold: ACTIVITY_THRESHOLD,
                templateUsed: templateIdentifier, // <-- Use the specific identifier
                status: EmailStatus.QUEUED, 
              },
            }),
          ]);
           console.log(`Successfully queued email (${templateIdentifier}) and logged warning for ${member.email}`);
        } catch (dbError) {
            console.error(`Failed to process member ${member.email} (Row ${member.rowIndex}) using template ${templateIdentifier}:`, dbError);
            errorCount++;
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

// Define an interface for the selected email fields
interface QueuedEmailSummary {
  id: string;
  recipientEmail: string;
  recipientName: string | null; // Prisma schema likely has this as optional
  subject: string;
  template: string | null; // Prisma schema likely has this as optional
  createdAt: Date;
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
export async function getEmailQueue(): Promise<{ success: boolean; message: string; emails?: QueuedEmailSummary[] }> {
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
        createdAt: 'asc', 
      },
      select: { 
        id: true,
        recipientEmail: true,
        recipientName: true,
        subject: true,
        template: true,
        createdAt: true,
      }
    });

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
    const emailToUpdate = await prisma.emailQueue.findUnique({
        where: { id: emailId },
        select: { recipientEmail: true, template: true, status: true } 
    });

    if (!emailToUpdate) {
        return { success: false, message: `Email with ID ${emailId} not found.` };
    }
    
    if (emailToUpdate.status !== EmailStatus.QUEUED) {
        return { success: false, message: `Email ${emailId} is not in QUEUED status (current: ${emailToUpdate.status}). Cannot update.` };
    }

    await prisma.$transaction([
      prisma.emailQueue.update({
        where: { id: emailId },
        data: { status: newStatus },
      }),
      prisma.warningLog.updateMany({
        where: {
          recipientEmail: emailToUpdate.recipientEmail,
          templateUsed: emailToUpdate.template,
          status: EmailStatus.QUEUED, 
        },
        data: { status: newStatus }, 
      }),
    ]);

    console.log(`Successfully updated email ${emailId} and related warning log(s) to ${newStatus}.`);
    
    // TODO: Consider adding an AdminLog entry here for audit trail

    revalidatePath('/'); 

    return { success: true, message: `Email status updated to ${newStatus}.` };

  } catch (error) {
    console.error(`Error updating status for email ${emailId} to ${newStatus}:`, error);
    return { success: false, message: `An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}` };
  }
} 