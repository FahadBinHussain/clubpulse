'use server';

import { prisma } from '@/lib/prisma';
import { getSheetData } from '@/lib/googleSheets';
import { EmailStatus } from '@prisma/client';

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
// Define the range to read from the sheet (e.g., 'Sheet1!A2:F' to read columns A-F starting from row 2)
// *** IMPORTANT: Update this range based on your actual sheet name and data columns ***
const SHEET_RANGE = 'members!A2:F';

export async function checkMemberActivity(): Promise<{ success: boolean; message: string; checked?: number; flagged?: number; errors?: number }> {
  console.log("Starting member activity check...");

  let checkedCount = 0;
  let flaggedCount = 0;
  let errorCount = 0;

  try {
    const rawData = await getSheetData(SHEET_RANGE);

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
      const email = row[COLUMN_INDICES.EMAIL];
      const activityCountStr = row[COLUMN_INDICES.ACTIVITY_COUNT];
      const name = row[COLUMN_INDICES.NAME] || ''; // Default to empty string if name is missing

      // Basic validation: Ensure email and activity count exist
      if (!email || typeof email !== 'string' || activityCountStr === undefined || activityCountStr === null) {
        console.warn(`Skipping row ${index + 2}: Missing email or activity count.`);
        errorCount++;
        return; // Skip this row
      }

      const activityCount = parseInt(activityCountStr, 10);
      if (isNaN(activityCount)) {
        console.warn(`Skipping row ${index + 2}: Invalid activity count value '${activityCountStr}'.`);
         errorCount++;
        return; // Skip this row
      }

      membersToProcess.push({
        name: name,
        email: email,
        activityCount: activityCount,
        role: row[COLUMN_INDICES.ROLE], // Optional
        personalityTag: row[COLUMN_INDICES.PERSONALITY_TAG], // Optional
        rowIndex: index + 2 // +2 because SHEET_RANGE starts at A2 and index is 0-based
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