'use server';

import { prisma } from '@/lib/prisma';
import { getSheetData } from '@/lib/googleSheets';
import { EmailStatus, Role, RoleThreshold } from '@prisma/client';
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

// Define structure for sheet errors
interface SheetError {
    rowIndex: number;
    reason: string;
    rowData: (string | number | boolean | null)[]; // Store the raw row data
}

// Define the default global activity threshold (can be overridden by role)
const DEFAULT_ACTIVITY_THRESHOLD = 5;
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

export async function checkMemberActivity(): Promise<{
    success: boolean;
    message: string;
    checked?: number;
    flagged?: number;
    errors?: number;
    errorsList?: SheetError[]; // <-- Added errorsList
}> {
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
  const errorsList: SheetError[] = [];
  const roleThresholds: Map<string, number> = new Map();

  try {
    // --- Fetch Role Thresholds from DB --- 
    console.log("Fetching role-specific thresholds from database...");
    const thresholdsFromDb = await prisma.roleThreshold.findMany();
    thresholdsFromDb.forEach(rt => {
      roleThresholds.set(rt.roleName.toLowerCase(), rt.threshold);
    });
    console.log("Fetched role-specific thresholds:", Object.fromEntries(roleThresholds));
    // --- End Fetch Thresholds ---

    const rawData = await getSheetData(sheetMemberDataRange);

    if (rawData === null) {
      return { success: false, message: "Failed to fetch data from Google Sheet." };
    }

    if (rawData.length === 0) {
        return { success: true, message: "No member data found in the specified range.", checked: 0, flagged: 0, errors: 0, errorsList: [] };
    }

    console.log(`Fetched ${rawData.length} rows from sheet.`);
    checkedCount = rawData.length;

    const membersToProcess: ClubMemberData[] = [];

    // --- Data Parsing and Validation ---
    rawData.forEach((row, index) => {
      const rowIndex = index + 2; // Sheet rows are 1-based, data starts at row 2
      const emailValue = row[COLUMN_INDICES.EMAIL];
      const activityCountValue = row[COLUMN_INDICES.ACTIVITY_COUNT];
      const nameValue = row[COLUMN_INDICES.NAME];
      const roleValue = row[COLUMN_INDICES.ROLE];

      // Validate email
      if (typeof emailValue !== 'string' || !emailValue) {
        const reason = "Invalid or missing email (Column B).";
        console.warn(`Skipping row ${rowIndex}: ${reason}`);
        errorsList.push({ rowIndex, reason, rowData: row }); // <-- Add error to list
        errorCount++;
        return; // Skip this row
      }
      const email = emailValue;

      // Validate activity count
      if (activityCountValue === undefined || activityCountValue === null) {
         const reason = "Missing activity count (Column C).";
         console.warn(`Skipping row ${rowIndex}: ${reason}`);
         errorsList.push({ rowIndex, reason, rowData: row }); // <-- Add error to list
         errorCount++;
         return; // Skip this row
      }
      let countStr: string;
      if (typeof activityCountValue === 'number') {
        countStr = String(activityCountValue);
      } else if (typeof activityCountValue === 'string') {
        countStr = activityCountValue;
      } else {
          const reason = `Invalid activity count type '${typeof activityCountValue}' value '${activityCountValue}' (Column C).`;
          console.warn(`Skipping row ${rowIndex}: ${reason}`);
          errorsList.push({ rowIndex, reason, rowData: row }); // <-- Add error to list
          errorCount++;
          return; // Skip this row
      }
      const activityCount = parseInt(countStr, 10);
      if (isNaN(activityCount)) {
        const reason = `Invalid activity count value (parsed from '${countStr}') (Column C).`;
        console.warn(`Skipping row ${rowIndex}: ${reason}`);
        errorsList.push({ rowIndex, reason, rowData: row }); // <-- Add error to list
        errorCount++;
        return; // Skip this row
      }

      // Process name
      const name = typeof nameValue === 'string' ? nameValue : '';

      // Process role: Now expected in column D (index 3)
      const role = typeof roleValue === 'string' ? roleValue : undefined;
      // Log if role is missing, as it's now more critical
      if (!role) {
         // This is a warning, not necessarily an error preventing processing, unless a role is strictly required later
         console.warn(`Row ${rowIndex}: Missing role value (Column D) (used for template selection).`);
         // Decide if you want to add this to errorsList or just log
         // errorsList.push({ rowIndex, reason: "Missing role (Column D).", rowData: row });
         // errorCount++; // Optionally count this as an error
      }

      // Add validated data to the list
      membersToProcess.push({
        name: name,
        email: email,
        activityCount: activityCount,
        role: role, // Keep original role casing for display/template lookup if needed
        rowIndex: rowIndex
      });
    });

    console.log(`Parsed ${membersToProcess.length} valid members out of ${checkedCount} rows checked. Found ${errorCount} errors.`);

    // --- Threshold Check and DB Operations ---
    for (const member of membersToProcess) {
      // --- Determine Threshold --- 
      const memberRoleLower = (member.role || '').trim().toLowerCase();
      const specificThreshold = roleThresholds.get(memberRoleLower);
      const effectiveThreshold = specificThreshold !== undefined ? specificThreshold : DEFAULT_ACTIVITY_THRESHOLD;
      // Log which threshold is being applied
      // console.log(`Checking ${member.email} (Role: ${member.role}, Activity: ${member.activityCount}) against threshold: ${effectiveThreshold} ${specificThreshold !== undefined ? '(Role Specific)' : '(Default)'}`);
      // --- End Determine Threshold --- 

      if (member.activityCount < effectiveThreshold) { // <-- Use effectiveThreshold
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
          const reason = `Failed to load template '${templateFilename}' for role '${member.role}'.`;
          console.error(`${reason} (Row ${member.rowIndex}):`, templateError);
          errorsList.push({ rowIndex: member.rowIndex, reason, rowData: [member.name, member.email, member.activityCount, member.role ?? null] });
          errorCount++;
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
                .replace(/{{threshold}}/g, effectiveThreshold.toString());

            // Render MJML to HTML
            const { html, errors: mjmlErrors } = mjml(personalizedMjml, {});

            if (mjmlErrors.length > 0) {
                const reason = `MJML rendering errors for template ${templateIdentifier}.`;
                console.warn(`${reason} (Row ${member.rowIndex}):`, mjmlErrors);
                errorsList.push({ rowIndex: member.rowIndex, reason: `${reason} First error: ${mjmlErrors[0].formattedMessage}`, rowData: [member.name, member.email, member.activityCount, member.role ?? null] });
                errorCount++;
                continue;
            }
            renderedHtml = html;

        } catch (renderError) {
            const reason = `Error rendering template '${templateIdentifier}'.`;
            console.error(`${reason} (Row ${member.rowIndex}):`, renderError);
            errorsList.push({ rowIndex: member.rowIndex, reason, rowData: [member.name, member.email, member.activityCount, member.role ?? null] });
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
                template: templateIdentifier,
                status: EmailStatus.QUEUED,
              },
            }),
            prisma.warningLog.create({
              data: {
                recipientEmail: member.email,
                recipientName: member.name,
                activityCount: member.activityCount,
                threshold: effectiveThreshold, // <-- Store the ACTUAL threshold used
                templateUsed: templateIdentifier,
                status: EmailStatus.QUEUED, 
              },
            }),
          ]);
           console.log(`Successfully queued email (${templateIdentifier}) and logged warning for ${member.email} using threshold ${effectiveThreshold}`);
        } catch (dbError) {
            const reason = `Failed to save to DB using template ${templateIdentifier}.`;
            console.error(`${reason} (Row ${member.rowIndex}):`, dbError);
            // Decide if you want to add DB errors to the user-facing list
            // errorsList.push({ rowIndex: member.rowIndex, reason, rowData: [...] }); 
            errorCount++; // Still count as an error internally
        }
      }
    }

    const message = `Activity check complete. Checked: ${checkedCount}, Below Threshold: ${belowThresholdCount}, Newly Flagged: ${flaggedCount}, Errors: ${errorCount}.`;
    console.log(message);
    // Return the errorsList along with other counts
    return { success: true, message, checked: checkedCount, flagged: flaggedCount, errors: errorCount, errorsList };

  } catch (error) {
    console.error("Error during member activity check:", error);
    // Include the partially collected errors list even if a later exception occurs
    return { success: false, message: `An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}`, errors: errorCount, errorsList };
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
                // Determine the message ID to store (null if not sent successfully)
                const messageIdToStore = (finalStatus === EmailStatus.SENT && sendResult?.data?.id) ? sendResult.data.id : null;
                
                await prisma.$transaction([
                    prisma.emailQueue.update({
                        where: { id: email.id },
                        data: { 
                            status: finalStatus, 
                            resendMessageId: messageIdToStore // Use the variable here
                        }, 
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
                 console.log(`Updated status to ${finalStatus} for email ID ${email.id} and related warning log(s). Resend ID: ${messageIdToStore}`); // Improved log
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
  // Ensure we have session, user, ID, and email for logging
  if (!session?.user?.id || !session.user.email || session.user.role !== Role.PANEL) {
      console.warn(`Unauthorized or incomplete session for attempt to update email status for ${emailId}. User:`, session?.user?.email);
      return { success: false, message: "Unauthorized or missing user data for logging." };
  }
  const adminUserId = session.user.id;
  const adminUserEmail = session.user.email;
  console.log(`Authorized user ${adminUserEmail} (ID: ${adminUserId}) is updating email ${emailId} to ${newStatus}.`);
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

    // Determine action string for logging
    const actionString = newStatus === EmailStatus.APPROVED ? 'approved_email' : 'canceled_email';

    await prisma.$transaction([
      // 1. Update EmailQueue status
      prisma.emailQueue.update({
        where: { id: emailId },
        data: { status: newStatus },
      }),
      // 2. Update corresponding WarningLog status
      prisma.warningLog.updateMany({
        where: {
          recipientEmail: emailToUpdate.recipientEmail,
          templateUsed: emailToUpdate.template,
          status: EmailStatus.QUEUED, // Only update logs that were queued
        },
        data: { status: newStatus }, 
      }),
      // 3. Create AdminLog entry
      prisma.adminLog.create({
          data: {
              adminUserId: adminUserId,
              adminUserEmail: adminUserEmail,
              action: actionString,
              details: { 
                  emailId: emailId, 
                  updatedStatus: newStatus,
                  recipient: emailToUpdate.recipientEmail // Include recipient for context
              } 
          }
      })
    ]);

    console.log(`Successfully updated email ${emailId} and related warning log(s) to ${newStatus}, and created admin log.`);
    
    revalidatePath('/'); // Revalidate the cache for the home page

    return { success: true, message: `Email status updated to ${newStatus}.` };

  } catch (error) {
    console.error(`Error updating status for email ${emailId} to ${newStatus}:`, error);
    return { success: false, message: `An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// --- Server Action: Get Email Body HTML (for Preview) ---
export async function getEmailBodyHtml(
  emailId: string
): Promise<{ success: boolean; message: string; htmlContent?: string }> {
  console.log(`Attempting to fetch HTML content for email ${emailId}...`);

  // --- Authorization Check ---
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== Role.PANEL) {
      console.warn("Unauthorized attempt to fetch email HTML content. User:", session?.user?.email);
      return { success: false, message: "Unauthorized: You do not have permission to preview emails." };
  }
  console.log(`Authorized user ${session.user.email} is previewing email ${emailId}.`);
  // --- End Authorization Check ---

  try {
    const email = await prisma.emailQueue.findUnique({
      where: { 
        id: emailId,
        // Optional: Ensure it's still in a state where preview makes sense (e.g., QUEUED)
        // status: EmailStatus.QUEUED 
      },
      select: { bodyHtml: true, status: true }, 
    });

    if (!email) {
      return { success: false, message: `Email with ID ${emailId} not found.` };
    }
    
    // Optional: Check status before returning HTML. You might allow previewing APPROVED emails too.
    // if (email.status !== EmailStatus.QUEUED) {
    //   return { success: false, message: `Email ${emailId} is not in QUEUED status (current: ${email.status}). Cannot preview.` };
    // }

    return { success: true, message: "Fetched email HTML content.", htmlContent: email.bodyHtml };

  } catch (error) {
    console.error(`Error fetching HTML content for email ${emailId}:`, error);
    return { success: false, message: `An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// --- Server Action: Get Role Thresholds --- 
export async function getRoleThresholds(): Promise<{
  success: boolean;
  message: string;
  thresholds?: RoleThreshold[]; 
}> {
  console.log("Attempting to fetch role thresholds...");

  // --- Authorization Check --- 
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== Role.PANEL) {
      console.warn("Unauthorized attempt to fetch role thresholds. User:", session?.user?.email);
      return { success: false, message: "Unauthorized: You do not have permission to view thresholds." };
  }
  // --- End Authorization Check ---

  try {
    const thresholds = await prisma.roleThreshold.findMany({
      orderBy: { roleName: 'asc' },
    });
    return { success: true, message: "Fetched thresholds.", thresholds };
  } catch (error) {
    console.error("Error fetching role thresholds:", error);
    return { success: false, message: `An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// --- Server Action: Upsert Role Threshold --- 
export async function upsertRoleThreshold(
  roleName: string, 
  threshold: number
): Promise<{ success: boolean; message: string; threshold?: RoleThreshold }> {
  console.log(`Attempting to upsert threshold for role '${roleName}' to ${threshold}...`);

  // --- Authorization Check --- 
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.email || session.user.role !== Role.PANEL) {
      console.warn("Unauthorized attempt to upsert role threshold. User:", session?.user?.email);
      return { success: false, message: "Unauthorized or missing user data for logging." };
  }
  const adminUserId = session.user.id;
  const adminUserEmail = session.user.email;
  // --- End Authorization Check ---

  // --- Validation --- 
  const normalizedRoleName = roleName.trim().toLowerCase();
  if (!normalizedRoleName) {
      return { success: false, message: "Role name cannot be empty." };
  }
  if (isNaN(threshold) || threshold < 0) {
      return { success: false, message: "Threshold must be a non-negative number." };
  }
  // --- End Validation ---

  try {
    const upsertResult = await prisma.$transaction(async (tx) => {
      // Find existing for logging details
      const existing = await tx.roleThreshold.findUnique({
        where: { roleName: normalizedRoleName },
        select: { threshold: true }
      });
      
      const newThreshold = await tx.roleThreshold.upsert({
        where: { roleName: normalizedRoleName },
        update: { threshold: threshold },
        create: { roleName: normalizedRoleName, threshold: threshold },
      });

      // Create AdminLog entry
      await tx.adminLog.create({
          data: {
              adminUserId: adminUserId,
              adminUserEmail: adminUserEmail,
              action: 'upsert_role_threshold',
              details: { 
                  roleName: normalizedRoleName, 
                  newThreshold: threshold,
                  previousThreshold: existing?.threshold // Log previous value if it existed
              } 
          }
      });
      
      return newThreshold;
    });

    console.log(`Successfully upserted threshold for role ${normalizedRoleName}. New value: ${threshold}.`);
    revalidatePath('/'); // Revalidate home page where thresholds might be displayed/used
    return { success: true, message: `Threshold for role '${normalizedRoleName}' set to ${threshold}.`, threshold: upsertResult };

  } catch (error) {
    console.error(`Error upserting threshold for role ${normalizedRoleName}:`, error);
    return { success: false, message: `An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// --- Server Action: Get Unique Roles from Sheet --- 
export async function getUniqueRolesFromSheet(): Promise<{ success: boolean; message: string; roles?: string[] }> {
    console.log("Attempting to fetch unique roles from sheet...");

    // --- Authorization Check --- 
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== Role.PANEL) {
        console.warn("Unauthorized attempt to fetch unique roles. User:", session?.user?.email);
        return { success: false, message: "Unauthorized: You do not have permission." };
    }
    // --- End Authorization Check ---

    // Check if the range is configured (it should be the same as checkMemberActivity)
    if (!sheetMemberDataRange) {
        console.error("GOOGLE_SHEET_MEMBER_DATA_RANGE environment variable is not set.");
        return { success: false, message: "Member data sheet range is not configured." };
    }

    try {
        const rawData = await getSheetData(sheetMemberDataRange);
        if (rawData === null) {
            return { success: false, message: "Failed to fetch data from Google Sheet." };
        }

        const uniqueRoles = new Set<string>();
        rawData.forEach(row => {
            const roleValue = row[COLUMN_INDICES.ROLE]; // Get role from Column D (index 3)
            if (typeof roleValue === 'string' && roleValue.trim()) {
                uniqueRoles.add(roleValue.trim()); // Keep original casing for display?
                                                    // Or normalize here: uniqueRoles.add(roleValue.trim().toLowerCase());
            }
        });

        const sortedRoles = Array.from(uniqueRoles).sort((a, b) => a.localeCompare(b));
        
        console.log("Found unique roles:", sortedRoles);
        return { success: true, message: "Fetched unique roles.", roles: sortedRoles };

    } catch (error) {
        console.error("Error fetching unique roles from sheet:", error);
        return { success: false, message: `An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}` };
    }
} 