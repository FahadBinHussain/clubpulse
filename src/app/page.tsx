'use client'; // Need client component for hooks like useSession

import { useState, useEffect } from 'react'; // <-- Import useState and useEffect
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
import { ThemeSwitcher } from '@/components/ThemeSwitcher'; // <-- Import ThemeSwitcher

export default function Home() {
  const { data: session, status } = useSession();
  // Set initial state based on role
  const initialView = session?.user?.role === 'PANEL' ? 'dashboard' : 'selfStatus';
  const [activeView, setActiveView] = useState<AdminView>(initialView);

  // Update state if role changes after initial load (e.g., first login sync)
  useEffect(() => {
      const currentInitialView = session?.user?.role === 'PANEL' ? 'dashboard' : 'selfStatus';
      // Only update if the initial view derived from session is different from current active view
      // This prevents resetting view when session updates for other reasons
      if (activeView !== currentInitialView && 
          ((session?.user?.role !== 'PANEL' && activeView !== 'selfStatus') || 
           (session?.user?.role === 'PANEL' && activeView === 'selfStatus'))) { 
          setActiveView(currentInitialView);
      }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.role]); // Dependency on role

  // Helper function to render the active panel component
  const renderActiveComponent = () => { // Renamed for clarity
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
      case 'selfStatus': // Added case for self status
        return (
           // Center the portal
           <div className="w-full flex justify-center pt-6 sm:pt-10">
              <MemberStatusPortal /> 
           </div>
        );
      case 'dashboard':
      default:
        // Show the DashboardOverview component (only relevant for PANEL)
        if (session?.user?.role === 'PANEL') {
            return <DashboardOverview />;
        } else {
            // Non-panel default should be self-status
            return (
               <div className="w-full flex justify-center pt-6 sm:pt-10">
                  <MemberStatusPortal /> 
               </div>
            );
        }
    }
  };

  return (
    // Use flex-col for overall structure, ensure full height
    <div className="flex flex-col h-screen font-[family-name:var(--font-geist-sans)] bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      
      {/* --- Fixed Header --- */}
      <header className="sticky top-0 z-30 flex items-center justify-between w-full px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">ClubPulse</h1>
        
        {/* User Info / Sign In/Out Area */}
        <div className="flex items-center gap-4">
          {/* Add ThemeSwitcher here */}
          <ThemeSwitcher /> 
          
          {status === "loading" && <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>}

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
                 <span className="hidden sm:inline text-gray-700 dark:text-gray-300">{session.user?.name}</span>
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

          {/* --- Sidebar (Render for ALL authenticated users) --- */}
          {status === "authenticated" && session && (
            <Sidebar activeView={activeView} setActiveView={setActiveView} session={session} /> // Pass session
          )}

          {/* --- Main View Area --- */}
          <div className="flex-grow p-4 sm:p-6 lg:p-8 overflow-y-auto bg-gray-100 dark:bg-gray-950"> 
            
            {status === "authenticated" && session && (
               // Directly render based on state, role check is handled inside render function/sidebar items
               renderActiveComponent() 
            )}

            {/* Handle unauthenticated state */}
            {status === "unauthenticated" && (
               <div className="flex flex-col items-center justify-center h-full">
                 <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow border dark:border-gray-700 text-center">
                    <p className="mb-4 text-gray-700 dark:text-gray-300">Please sign in to view the dashboard.</p>
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
