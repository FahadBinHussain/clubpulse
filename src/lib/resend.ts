import { Resend, CreateEmailResponse } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;

if (!resendApiKey) {
  console.warn("RESEND_API_KEY environment variable not set. Email sending will be disabled.");
}

// Initialize Resend client only if API key is available
const resend = resendApiKey ? new Resend(resendApiKey) : null;

// Define the structure for email parameters
interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string; // For now, we'll pass pre-rendered HTML
  // react?: React.ReactElement; // We can add this later for MJML integration
  from?: string; // Optional: Defaults to onboarding@resend.dev if not provided
  reply_to?: string;
}

/**
 * Sends an email using the Resend SDK.
 * @param params - Email parameters (to, subject, html, etc.).
 * @returns A promise that resolves with the SendResponse or null if sending is disabled or fails.
 */
export async function sendEmail(params: SendEmailParams): Promise<CreateEmailResponse | null> {
  if (!resend) {
    console.error("Resend client not initialized. Cannot send email.");
    return null; // Indicate failure or disabled state
  }

  const { to, subject, html, from, reply_to } = params;

  // Default 'from' address if not specified
  const fromAddress = from || 'onboarding@resend.dev';

  try {
    const response = await resend.emails.send({
      from: fromAddress,
      to: to,
      subject: subject,
      html: html, // Use pre-rendered HTML for now
      replyTo: reply_to,
      // react: params.react // Add this later for React components/MJML
    });
    console.log(`Email sent successfully via Resend: ID ${response.data?.id}`);
    return response; // Return the full response object from Resend
  } catch (error) {
    console.error("Error sending email via Resend:", error);
    return null; // Indicate failure
  }
} 