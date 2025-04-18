import { NextResponse } from 'next/server';
import { checkMemberActivity } from '@/app/actions';

// Simple GET handler for Vercel Cron
export async function GET(request: Request) {
  console.log("Cron job /api/cron/check-activity triggered.");

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
    console.warn("Unauthorized attempt to trigger cron job /check-activity.");
    return NextResponse.json({ success: false, message: 'Unauthorized.' }, { status: 401 });
  }
  // --- End Security Check ---

  try {
    console.log("Executing checkMemberActivity action...");
    const result = await checkMemberActivity(); 
    console.log("checkMemberActivity result:", result.message);
    
    // Return the result from the action
    return NextResponse.json(result, { status: result.success ? 200 : 500 });

  } catch (error) {
    console.error("Error executing checkMemberActivity from cron:", error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message: `Cron job failed: ${message}` }, { status: 500 });
  }
} 