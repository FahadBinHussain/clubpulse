import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

// Define the expected structure of the credentials JSON
interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
}

// Function to get authenticated Google Sheets API client
async function getSheetsClient() {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;
  if (!credentialsJson) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_CREDENTIALS environment variable not set.');
  }

  let credentials: ServiceAccountCredentials;
  try {
    // Parse the JSON string from the environment variable
    credentials = JSON.parse(credentialsJson);
  } catch (error) {
    console.error("Failed to parse GOOGLE_SERVICE_ACCOUNT_CREDENTIALS:", error);
    throw new Error('Invalid format for GOOGLE_SERVICE_ACCOUNT_CREDENTIALS.');
  }

  const scopes = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

  const auth = new JWT({
    email: credentials.client_email,
    key: credentials.private_key.replace(/\\n/g, '\n'), // Replace escaped newlines
    scopes,
  });

  await auth.authorize(); // Ensure the client is authorized

  const sheets = google.sheets({ version: 'v4', auth });
  return sheets;
}

/**
 * Fetches data from a specified range in a Google Sheet.
 * @param range - The A1 notation of the range to retrieve (e.g., 'Sheet1!A1:E').
 * @returns A promise that resolves to the sheet data as an array of arrays, or null if an error occurs.
 */
export async function getSheetData(range: string): Promise<(string | number | boolean | null)[][] | null> {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) {
    throw new Error('GOOGLE_SHEET_ID environment variable not set.');
  }

  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    return response.data.values || []; // Return values or empty array if none found
  } catch (error) {
    console.error('Error fetching sheet data:', error);
    // Handle specific errors (e.g., permissions, invalid range) if needed
    return null; // Indicate failure
  }
} 