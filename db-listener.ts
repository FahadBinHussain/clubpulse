import { Client } from 'pg';
import { config } from 'dotenv';
import Pusher from 'pusher'; // Use the Pusher server library
import path from 'path';

// --- Load Environment Variables ---
// Adjust the path if your .env.local is elsewhere relative to this script
config({ path: path.resolve(process.cwd(), '.env.local') }); 

const DATABASE_URL = process.env.DATABASE_URL;

// --- Pusher Configuration (Copied from src/lib/pusher.ts - consider centralizing later) ---
const PUSHER_APP_ID = process.env.PUSHER_APP_ID;
const PUSHER_KEY = process.env.NEXT_PUBLIC_PUSHER_KEY; // Note: Using public key here might be okay if only triggering, but standard practice uses server key for server-side triggering
const PUSHER_SECRET = process.env.PUSHER_SECRET;
const PUSHER_CLUSTER = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

// Pusher Server Instance (Use this for triggering from backend)
let pusherServer: Pusher | null = null;
if (PUSHER_APP_ID && PUSHER_KEY && PUSHER_SECRET && PUSHER_CLUSTER) {
    pusherServer = new Pusher({
        appId: PUSHER_APP_ID,
        key: PUSHER_KEY, // Using the public key here - is this intended? Usually server uses its own key/secret
        secret: PUSHER_SECRET,
        cluster: PUSHER_CLUSTER,
        useTLS: true,
    });
    console.log("Pusher server client initialized for listener.");
} else {
    console.error("Pusher server credentials missing in environment variables. Pusher triggering will be disabled in listener.");
}

// Helper function to trigger Pusher event (similar to src/lib/pusher.ts)
async function triggerPusherEvent(channel: string, event: string, data: any) {
    if (!pusherServer) {
        console.error("Pusher server client not initialized. Cannot trigger event.");
        return;
    }
    try {
        await pusherServer.trigger(channel, event, data);
        console.log(`Successfully triggered Pusher event '${event}' on channel '${channel}' with data:`, data);
    } catch (error) {
        console.error(`Failed to trigger Pusher event '${event}' on channel '${channel}':`, error);
    }
}

// --- Constants for Pusher Channels/Events (Match actions.ts) ---
const ADMIN_CHANNEL = 'admin-updates';
const EMAIL_QUEUE_EVENT = 'email-queue-updated';
const THRESHOLDS_EVENT = 'thresholds-updated'; // Add if we create triggers for role_thresholds later
// --- End Constants ---

if (!DATABASE_URL) {
    console.error("DATABASE_URL environment variable is not set. Exiting.");
    process.exit(1);
}

const listenerClient = new Client({
    connectionString: DATABASE_URL,
    // Neon requires SSL
    ssl: {
        rejectUnauthorized: false, // Adjust as needed for your SSL setup, Neon typically requires this or a CA cert
    },
});

async function connectAndListen() {
    try {
        await listenerClient.connect();
        console.log("Database listener connected successfully.");

        // Start listening on the channel
        await listenerClient.query('LISTEN db_change_channel');
        console.log("Listening for notifications on 'db_change_channel'...");

        // Handle incoming notifications
        listenerClient.on('notification', async (msg) => {
            console.log(`Received notification on channel '${msg.channel}':`, msg.payload);

            // Check the payload to decide which Pusher event to trigger
            if (msg.channel === 'db_change_channel') {
                if (msg.payload === 'email_queue_updated') {
                   await triggerPusherEvent(ADMIN_CHANNEL, EMAIL_QUEUE_EVENT, { source: 'db_notify', table: 'email_queue' });
                } 
                // Add else if blocks here for other payloads like 'role_threshold_updated' if needed
                // else if (msg.payload === 'role_threshold_updated') {
                //    await triggerPusherEvent(ADMIN_CHANNEL, THRESHOLDS_EVENT, { source: 'db_notify', table: 'role_thresholds' });
                // }
                 else {
                    console.warn(`Received unknown payload: ${msg.payload}`);
                }
            }
        });

        // Handle client errors
        listenerClient.on('error', (err) => {
            console.error('Database listener client error:', err);
            // Attempt to reconnect or handle error appropriately
            // For simplicity, we'll exit here, but a real service might retry
            process.exit(1); 
        });

        // Keep the script running
        console.log("Listener process started. Press Ctrl+C to exit.");
        // The script will stay alive because of the active DB connection and listener

    } catch (err) {
        console.error("Failed to connect or set up database listener:", err);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log("Received SIGINT. Closing database listener connection...");
    await listenerClient.end();
    console.log("Listener connection closed.");
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log("Received SIGTERM. Closing database listener connection...");
    await listenerClient.end();
    console.log("Listener connection closed.");
    process.exit(0);
});

// Start the listener
connectAndListen(); 