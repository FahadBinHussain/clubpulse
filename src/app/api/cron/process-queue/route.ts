import { NextResponse } from 'next/server';
import { processEmailQueue } from '@/app/actions'; // Import the server action
import { triggerPusherEvent } from '@/lib/pusher'; // Import pusher helper

// Simple GET handler for Vercel Cron
export async function GET(request: Request) {
  console.log("Cron job /api/cron/process-queue triggered.");

  // --- Security Check --- 
  const cronSecret = process.env.CRON_SECRET;
  const authorizationHeader = request.headers.get('authorization');
  const isDevelopment = process.env.NODE_ENV !== 'production'; // Check environment

  if (!isDevelopment && !cronSecret) { // Only enforce secret existence in production
    console.error("CRON_SECRET environment variable is not set.");
    return NextResponse.json({ success: false, message: 'Internal configuration error.' }, { status: 500 });
  }

  // Skip check in development OR if header matches secret
  if (!isDevelopment && authorizationHeader !== `Bearer ${cronSecret}`) {
    console.warn("Unauthorized attempt to trigger cron job /process-queue.");
    return NextResponse.json({ success: false, message: 'Unauthorized.' }, { status: 401 });
  }
  // --- End Security Check ---

  try {
    console.log("Executing processEmailQueue action...");
    const result = await processEmailQueue();
    console.log("processEmailQueue result:", result.message);
    
    // Trigger Pusher event IF emails were processed (regardless of sent/failed count)
    if (result.success && result.processed && result.processed > 0) {
        // Use a generic event type or a specific one for cron processing
        await triggerPusherEvent('admin-updates', 'email-queue-updated', { triggeredBy: 'processQueueCron' });
    }

    // Return the result from the action
    return NextResponse.json(result, { status: result.success ? 200 : 500 });

  } catch (error) {
    console.error("Error executing processEmailQueue from cron:", error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message: `Cron job failed: ${message}` }, { status: 500 });
  }
} 