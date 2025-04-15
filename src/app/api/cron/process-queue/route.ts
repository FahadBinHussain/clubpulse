import { NextResponse } from 'next/server';
import { processEmailQueue } from '@/app/actions'; // Import the Server Action

// Export a GET handler for the process-queue cron job
export async function GET(request: Request) {
  // Protection: Check for Vercel's cron secret
  const authHeader = request.headers.get('authorization');
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.warn('Unauthorized attempt to access process-queue cron endpoint.');
    return new NextResponse('Unauthorized', { status: 401 });
  }

  console.log("Cron job triggered: Starting processEmailQueue...");

  try {
    // Call the server action to process the email queue
    const result = await processEmailQueue();
    console.log("Cron job finished processEmailQueue:", result);

    // Return the result message and status (e.g., number processed, sent, failed)
    return NextResponse.json(result, { status: result.success ? 200 : 500 });

  } catch (error) {
    console.error("Error running process-queue cron job:", error);
    // Use NextResponse for consistency in error handling
    return new NextResponse('Internal Server Error during queue processing', { status: 500 });
  }
} 