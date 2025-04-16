import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Resend Webhook Handler
 * 
 * Handles incoming webhook events from Resend, specifically 'email.opened'.
 * Updates the database to mark emails as opened.
 */
export async function POST(request: Request) {
  console.log("Resend webhook received...");

  let payload: any;
  try {
    payload = await request.json();
    // console.log("Webhook payload:", JSON.stringify(payload, null, 2)); // Log the full payload for debugging if needed
  } catch (error) {
    console.error("Error parsing webhook payload:", error);
    return new NextResponse('Invalid request body', { status: 400 });
  }

  // Check the event type
  const eventType = payload?.type;
  const data = payload?.data;

  if (eventType === 'email.opened' && data) {
    const resendMessageId = data.email_id;
    const openedTimestamp = data.created_at ? new Date(data.created_at) : new Date();

    if (!resendMessageId) {
      console.warn("Webhook 'email.opened' event missing email_id.");
      return new NextResponse('Missing email_id in payload', { status: 400 });
    }

    console.log(`Processing 'email.opened' event for Resend ID: ${resendMessageId}`);

    try {
      // Find the EmailQueue entry using the Resend message ID
      // Use findFirst instead of findUnique as resendMessageId is indexed but not strictly unique in the schema
      const emailEntry = await prisma.emailQueue.findFirst({
        where: { resendMessageId: resendMessageId },
        select: { id: true, recipientEmail: true, template: true, openedAt: true }, // Select necessary fields
      });

      if (!emailEntry) {
        console.warn(`No EmailQueue entry found for Resend ID: ${resendMessageId}`);
        // Still return 200 OK to Resend, as we can't process this specific ID
        return new NextResponse('Email entry not found, but acknowledged', { status: 200 });
      }

      // Avoid updating if already marked as opened (optional, but good practice)
      if (emailEntry.openedAt) {
        console.log(`Email ${emailEntry.id} (Resend ID: ${resendMessageId}) already marked as opened at ${emailEntry.openedAt}. Skipping update.`);
        return new NextResponse('Event acknowledged, email already marked opened.', { status: 200 });
      }

      // Update the EmailQueue and WarningLog in a transaction
      await prisma.$transaction([
        prisma.emailQueue.update({
          where: { id: emailEntry.id },
          data: { openedAt: openedTimestamp },
        }),
        prisma.warningLog.updateMany({
          where: {
            recipientEmail: emailEntry.recipientEmail,
            templateUsed: emailEntry.template,
            // Optionally, only update logs associated with SENT emails
            // status: EmailStatus.SENT 
          },
          data: { emailOpened: true },
        }),
      ]);

      console.log(`Successfully marked email ${emailEntry.id} (Resend ID: ${resendMessageId}) and associated warning log(s) as opened.`);
      return new NextResponse('Webhook processed successfully', { status: 200 });

    } catch (dbError) {
      console.error(`Database error processing 'email.opened' event for Resend ID ${resendMessageId}:`, dbError);
      return new NextResponse('Internal Server Error during webhook processing', { status: 500 });
    }

  } else {
    // Handle other event types or ignore them
    console.log(`Ignoring webhook event type: ${eventType || 'unknown'}`);
    return new NextResponse('Event type not handled or payload invalid', { status: 200 }); // Still return 200 for unhandled types
  }
} 