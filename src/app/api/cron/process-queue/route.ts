import { NextResponse } from 'next/server';
import { processEmailQueue } from '@/app/actions'; // Import the Server Action

export async function POST(request: Request) {
  console.log('Received request for /api/cron/process-queue');
  const authHeader = request.headers.get('authorization');

  // 1. Verify Authorization Header
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.warn('Unauthorized access attempt to /api/cron/process-queue');
    return new NextResponse('Unauthorized', { status: 401 });
  }

  console.log('Authorization successful for /api/cron/process-queue');

  try {
    // 2. Call the Server Action
    console.log('Calling processEmailQueue Server Action...');
    const result = await processEmailQueue();
    console.log('processEmailQueue Server Action finished.', result);

    // 3. Return the result
    if (result.success) {
      return NextResponse.json({ 
        message: result.message,
        processed: result.processed,
        sent: result.sent,
        failed: result.failed 
      });
    } else {
      // Return a 500 status if the action itself reported an error
      return NextResponse.json({ message: result.message }, { status: 500 });
    }
  } catch (error) {
    // Catch any unexpected errors during the action call
    console.error('Unexpected error in /api/cron/process-queue:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
} 