import PusherServer from 'pusher';

// Check for required environment variables
const appId = process.env.PUSHER_APP_ID;
const key = process.env.NEXT_PUBLIC_PUSHER_KEY; // Public key needed here too
const secret = process.env.PUSHER_SECRET;
const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

if (!appId || !key || !secret || !cluster) {
  console.warn(
    'Pusher environment variables (PUSHER_APP_ID, NEXT_PUBLIC_PUSHER_KEY, PUSHER_SECRET, NEXT_PUBLIC_PUSHER_CLUSTER) are not fully configured. Pusher server functionality will be disabled.'
  );
}

// Initialize Pusher server client only if all variables are set
export const pusherServer = 
    (appId && key && secret && cluster) 
    ? new PusherServer({
        appId: appId,
        key: key,
        secret: secret,
        cluster: cluster,
        useTLS: true, // Always use TLS
      })
    : null;

/**
 * Helper function to trigger a Pusher event safely.
 * Ensures Pusher is configured before attempting to trigger.
 * 
 * @param channel - The channel name (e.g., 'admin-updates')
 * @param event - The event name (e.g., 'email-queue-updated')
 * @param data - The data payload to send with the event
 */
export async function triggerPusherEvent<T>(channel: string, event: string, data: T) {
  if (!pusherServer) {
    console.log('Pusher server not configured, skipping event trigger.');
    return; // Do nothing if Pusher isn't set up
  }

  try {
    await pusherServer.trigger(channel, event, data);
    console.log(`Pusher event triggered: Channel='${channel}', Event='${event}'`);
  } catch (error) {
    console.error(`Failed to trigger Pusher event (Channel: ${channel}, Event: ${event}):`, error);
    // Decide if you want to throw the error or just log it
  }
} 