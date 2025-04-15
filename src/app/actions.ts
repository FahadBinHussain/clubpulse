'use server';

import { prisma } from '@/lib/prisma';
import { getSheetData } from '@/lib/googleSheets';
import { EmailStatus } from '@prisma/client';
import { sendEmail } from '@/lib/resend';
import { CreateEmailResponse } from 'resend';

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

  // Check if the range is configured
  if (!sheetMemberDataRange) {
    console.error("GOOGLE_SHEET_MEMBER_DATA_RANGE environment variable is not set.");
    return { success: false, message: "Member data sheet range is not configured." };
  }

  let checkedCount = 0;
  let flaggedCount = 0;
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

    const message = `Activity check complete. Checked: ${checkedCount}, Flagged: ${flaggedCount}, Errors: ${errorCount}.`;
    console.log(message);
    return { success: true, message, checked: checkedCount, flagged: flaggedCount, errors: errorCount };

  } catch (error) {
    console.error("Error during member activity check:", error);
    return { success: false, message: `An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// --- New Server Action: Process Email Queue ---
export async function processEmailQueue(): Promise<{ success: boolean; message: string; processed?: number; sent?: number; failed?: number }> {
    console.log("Starting email queue processing...");
    let processedCount = 0;
    let sentCount = 0;
    let failedCount = 0;

    try {
        // 1. Fetch queued emails
        const emailsToProcess = await prisma.emailQueue.findMany({
            where: {
                status: EmailStatus.QUEUED,
            },
        });

        processedCount = emailsToProcess.length;

        if (processedCount === 0) {
            const message = "Email queue processing complete. No emails were pending.";
            console.log(message);
            return { success: true, message, processed: 0, sent: 0, failed: 0 };
        }

        console.log(`Found ${processedCount} emails in the queue to process.`);

        // 2. Process each email
        for (const email of emailsToProcess) {
            let finalStatus: EmailStatus;
            let sendResult: CreateEmailResponse | null = null; // Initialize sendResult
            try {
                console.log(`Attempting to send email ID ${email.id} to ${email.recipientEmail}`);
                // 3. Attempt to send email (Corrected parameters and result handling)
                sendResult = await sendEmail({
                    to: email.recipientEmail,
                    subject: email.subject,
                    html: email.bodyHtml, // Pass content as 'html'
                });

                // Check Resend response structure: { data: { id: ... }, error: null } on success
                // or { data: null, error: { message: ..., name: ... } } on failure
                if (sendResult && !sendResult.error) { // Success if result exists and has no error
                    finalStatus = EmailStatus.SENT;
                    sentCount++;
                    console.log(`Successfully sent email ID ${email.id} to ${email.recipientEmail}. Resend ID: ${sendResult.data?.id}`);
                } else {
                    finalStatus = EmailStatus.FAILED;
                    failedCount++;
                    // Log the specific Resend error if available
                    const errorMessage = sendResult?.error?.message || 'Unknown Resend error';
                    console.error(`Failed to send email ID ${email.id} to ${email.recipientEmail}: ${errorMessage}`);
                }
            } catch (sendError) {
                // Catch errors during the await sendEmail call itself (e.g., network issues)
                finalStatus = EmailStatus.FAILED;
                failedCount++;
                console.error(`Error processing email ID ${email.id} for ${email.recipientEmail} (exception during send):`, sendError);
            }

            // 4. Update status in DB (EmailQueue and WarningLog)
            try {
                await prisma.$transaction([
                    prisma.emailQueue.update({
                        where: { id: email.id },
                        data: { status: finalStatus },
                    }),
                    // Find the related WarningLog entry (assuming one exists)
                    // This might need refinement if the relationship isn't guaranteed or unique
                    prisma.warningLog.updateMany({
                         where: {
                             recipientEmail: email.recipientEmail,
                             templateUsed: email.template, // Match based on email and template
                             status: EmailStatus.QUEUED // Only update logs that were queued
                         },
                         data: { status: finalStatus },
                    }),
                ]);
                 console.log(`Updated status to ${finalStatus} for email ID ${email.id} and related warning log(s).`);
            } catch (dbError) {
                // If DB update fails, log the error but potentially continue processing other emails
                console.error(`Failed to update status for email ID ${email.id} in database:`, dbError);
                // You might want to increment a separate 'dbErrorCount' here
                // For now, we'll count it towards 'failed' as the overall process for this email didn't complete successfully.
                if (finalStatus !== EmailStatus.FAILED) { // Avoid double-counting if send already failed
                    failedCount++;
                    if (finalStatus === EmailStatus.SENT) sentCount--; // Decrement sent count if DB update failed after successful send
                }
                finalStatus = EmailStatus.FAILED; // Mark as failed due to DB error
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