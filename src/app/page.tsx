'use client'; // Need client component for hooks like useSession

import { useSession, signIn, signOut } from "next-auth/react";
import Image from "next/image";
import { useState, useTransition } from "react"; // Import useState and useTransition
import { checkMemberActivity } from "@/app/actions"; // Import the server action
import EmailQueueManager from "@/components/EmailQueueManager"; // <-- Import the component

export default function Home() {
  const { data: session, status } = useSession();
  const [isPending, startTransition] = useTransition(); // Hook for loading state
  const [actionMessage, setActionMessage] = useState<string | null>(null); // State for action result message

  // Function to handle the button click
  const handleCheckActivity = () => {
    startTransition(async () => {
      setActionMessage("Checking activity...");
      const result = await checkMemberActivity();
      setActionMessage(result.message);
    });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-8 items-center text-center">
        <h1 className="text-3xl font-bold">ClubPulse</h1>

        {status === "loading" && <p>Loading session...</p>}

        {status === "authenticated" && session && (
          <div className="flex flex-col items-center gap-4 p-4 border rounded-lg shadow-md w-full max-w-4xl">
            <p>Welcome back!</p>
            {session.user?.image && (
              <Image
                src={session.user.image}
                alt="User profile picture"
                width={64}
                height={64}
                className="rounded-full"
              />
            )}
            <p className="font-semibold">{session.user?.name}</p>
            <p className="text-sm text-gray-600">{session.user?.email}</p>
            <p className="text-xs text-gray-500">(Role: {session.user?.role})</p>
            
            {/* Conditionally render Admin section only for PANEL role */}
            {session.user?.role === 'PANEL' && (
              <div className="mt-4 pt-4 border-t w-full flex flex-col items-center gap-4"> {/* Added gap-4 */}
                 {/* Existing Check Activity Button Section */}
                 <div className="w-full flex flex-col items-center gap-2">
                    <h2 className="text-lg font-medium">Admin Actions</h2>
                    <button
                      onClick={handleCheckActivity}
                      disabled={isPending}
                      className="px-4 py-2 font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isPending ? "Checking..." : "Check Member Activity"}
                    </button>
                    {actionMessage && (
                      <p className={`mt-2 text-sm ${actionMessage.startsWith("Failed") || actionMessage.startsWith("An unexpected") ? 'text-red-600' : 'text-gray-600'}`}>
                        {actionMessage}
                      </p>
                    )}
                 </div>
                 
                 {/* Add the Email Queue Manager Component */}
                 <EmailQueueManager /> 
                 
              </div>
            )}
            
            <button
              onClick={() => signOut()}
              className="mt-4 px-4 py-2 font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              Sign Out
            </button>
          </div>
        )}

        {status === "unauthenticated" && (
          <div className="flex flex-col items-center gap-4">
            <p>You are not signed in.</p>
            <button
              onClick={() => signIn("google")}
              className="px-4 py-2 font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Sign in with Google
            </button>
          </div>
        )}

        {/* Keep or remove the original Next.js/Vercel links as desired */}
        <div className="mt-8 text-sm text-gray-500">
          (Original Next.js template content below)
        </div>
        {/* ... Original content like Deploy link, Docs link etc. can go here ... */}

      </main>
    </div>
  );
}
