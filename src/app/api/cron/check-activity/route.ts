import { NextResponse } from 'next/server';
import { checkMemberActivity } from '@/app/actions';

// Export a GET handler
export async function GET(request: Request) {
  // Protection: Check for Vercel's cron secret
  const authHeader = request.headers.get('authorization');
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.warn('Unauthorized attempt to access cron endpoint.');
    return new NextResponse('Unauthorized', { status: 401 });
  }

  console.log("Cron job triggered: Starting checkMemberActivity...");

  try {
    const result = await checkMemberActivity();
    console.log("Cron job finished checkMemberActivity:", result);

    // Return the result message and status
    return NextResponse.json(result, { status: result.success ? 200 : 500 });

  } catch (error) {
    console.error("Error running cron job:", error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 