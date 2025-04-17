'use client'; // Need client component for hooks like useSession

import { useSession, signIn, signOut } from "next-auth/react";
import Image from "next/image";
import EmailQueueManager from "@/components/EmailQueueManager";
import ThresholdManager from "@/components/ThresholdManager"; // <-- Import the new component
import WarningLogViewer from "@/components/WarningLogViewer"; // <-- Import the new component
import AdminLogViewer from "@/components/AdminLogViewer"; // <-- Import the new component
import AnalyticsViewer from "@/components/AnalyticsViewer"; // <-- Import the new component
import MemberStatusPortal from "@/components/MemberStatusPortal"; // <-- Import the new portal component

export default function Home() {
  const { data: session, status } = useSession();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-8 items-center text-center w-full">
        <h1 className="text-3xl font-bold">ClubPulse</h1>

        {status === "loading" && <p>Loading session...</p>}

        {status === "authenticated" && session && (
          <div className="flex flex-col items-center gap-4 p-4 border rounded-lg shadow-md w-full max-w-4xl">
            
            {/* --- Conditional Rendering based on Role --- */}
            {session.user?.role === 'PANEL' ? (
              // --- PANEL VIEW --- 
              <div className="w-full flex flex-col items-center gap-6"> 
                 {/* Display Admin User Info */}
                 <div className="flex flex-col items-center gap-2 text-center border-b pb-4 w-full max-w-xs">
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
                 </div>
                 
                 {/* Email Queue Manager */} 
                 <EmailQueueManager /> 
                 
                 {/* Threshold Manager */} 
                 <ThresholdManager /> 
                 
                 {/* Warning Log Viewer */} 
                 <WarningLogViewer /> 

                 {/* Admin Log Viewer */} 
                 <AdminLogViewer />

                 {/* Analytics Viewer */} 
                 <AnalyticsViewer />
              </div>
            ) : (
              // --- MEMBER/GUEST VIEW --- 
              <MemberStatusPortal /> // <-- Render the new portal component
            )}
            {/* --- End Conditional Rendering --- */}
            
            {/* Sign Out Button (Common to both roles) */} 
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
