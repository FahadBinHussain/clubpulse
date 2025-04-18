'use client'; // Need client component for hooks like useSession

import { useState } from 'react'; // <-- Import useState
import { useSession, signIn, signOut } from "next-auth/react";
import Image from "next/image";
import EmailQueueManager from "@/components/EmailQueueManager";
import ThresholdManager from "@/components/ThresholdManager"; // <-- Import the new component
import WarningLogViewer from "@/components/WarningLogViewer"; // <-- Import the new component
import AdminLogViewer from "@/components/AdminLogViewer"; // <-- Import the new component
import AnalyticsViewer from "@/components/AnalyticsViewer"; // <-- Import the new component
import MemberStatusPortal from "@/components/MemberStatusPortal"; // <-- Import the new portal component
import Sidebar, { AdminView } from '@/components/Sidebar'; // <-- Import Sidebar and type
import DashboardOverview from '@/components/DashboardOverview'; // <-- Import the new component

export default function Home() {
  const { data: session, status } = useSession();
  const [activeView, setActiveView] = useState<AdminView>('dashboard'); // <-- Add state for active view

  // Helper function to render the active panel component
  const renderActivePanelComponent = () => {
    switch (activeView) {
      case 'queue':
        return <EmailQueueManager />;
      case 'thresholds':
        return <ThresholdManager />;
      case 'warnings':
        return <WarningLogViewer />;
      case 'adminLogs':
        return <AdminLogViewer />;
      case 'analytics':
        return <AnalyticsViewer />;
      case 'dashboard':
      default:
        // Show the new DashboardOverview component
        return <DashboardOverview />;
    }
  };

  return (
    // Use flex-col for overall structure, ensure full height
    <div className="flex flex-col h-screen font-[family-name:var(--font-geist-sans)] bg-gray-50">
      
      {/* --- Fixed Header --- */}
      <header className="sticky top-0 z-30 flex items-center justify-between w-full px-4 py-3 bg-white border-b border-gray-200 shadow-sm sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-gray-800">ClubPulse</h1>
        
        {/* User Info / Sign In/Out Area */}
        <div className="flex items-center gap-4">
          {status === "loading" && <p className="text-sm text-gray-500">Loading...</p>}

          {status === "authenticated" && session && (
            <>
              {/* Display user info concisely in header */}
              <div className="flex items-center gap-2 text-sm">
                 {session.user?.image && (
                    <Image
                        src={session.user.image}
                        alt="User profile picture"
                        width={32} // Smaller size for header
                        height={32}
                        className="rounded-full"
                      />
                 )}
                 <span className="hidden sm:inline text-gray-700">{session.user?.name}</span>
              </div>
              <button
                onClick={() => signOut()}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
              >
                Sign Out
              </button>
            </>
          )}

          {status === "unauthenticated" && (
            <button
              onClick={() => signIn("google")}
              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            >
              Sign in with Google
            </button>
          )}
        </div>
      </header>

      {/* --- Main Content Area with Sidebar --- */}
      <main className="flex-grow overflow-y-hidden"> 
        <div className="flex flex-row h-full">

          {/* --- Sidebar (Render for Panel users) --- */}
          {status === "authenticated" && session?.user?.role === 'PANEL' && (
            <Sidebar activeView={activeView} setActiveView={setActiveView} /> // <-- Use Sidebar component
          )}

          {/* --- Main View Area --- */}
          <div className="flex-grow p-4 sm:p-6 lg:p-8 overflow-y-auto bg-gray-100"> 
            
            {status === "authenticated" && session && (
              <>
                {session.user?.role === 'PANEL' ? (
                  // Render the component based on activeView state
                  renderActivePanelComponent() 
                ) : (
                  // --- MEMBER/GUEST VIEW --- 
                  <MemberStatusPortal /> 
                )}
              </>
            )}

            {/* Handle unauthenticated state */}
            {status === "unauthenticated" && (
               <div className="flex flex-col items-center justify-center h-full">
                 <div className="p-6 bg-white rounded-lg shadow border text-center">
                    <p className="mb-4">Please sign in to view the dashboard.</p>
                    {/* Sign in button is in the header */}
                 </div>
               </div>
            )}

          </div> {/* End flex-grow p-6 */} 

        </div> {/* End flex flex-row h-full */} 
      </main>
      {/* --- End Main Content Area --- */}

    </div> // End flex-col h-screen
  );
}
