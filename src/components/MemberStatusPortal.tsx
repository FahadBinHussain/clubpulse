'use client';

import { useState, useEffect, useTransition } from 'react';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import { getMemberStatus } from '@/app/actions';

// Interface matching the return structure of getMemberStatus
interface MemberStatusData { 
  name?: string | null;
  email?: string | null;
  activityCount?: number;
  role?: string | null; 
  effectiveThreshold?: number;
  statusMessage: string; 
}

// Helper function to calculate progress percentage
const calculateProgress = (count?: number, threshold?: number): number => {
  if (typeof count !== 'number' || typeof threshold !== 'number' || threshold <= 0) {
    return 0;
  }
  return Math.min(Math.max((count / threshold) * 100, 0), 100); // Clamp between 0 and 100
};

// Helper function to get role-specific tips
const getRoleSpecificTips = (role?: string | null): string[] => {
  const normalizedRole = (role || 'general member').trim().toLowerCase(); // Default to general if no role
  
  switch (normalizedRole) {
    case 'co-director':
    case 'co director':
      return [
        "Initiate a strategic discussion or cross-committee collaboration.",
        "Mentor an executive member.",
        "Review and provide feedback on ongoing club projects."
      ];
    case 'senior executive':
      return [
        "Lead a project team meeting or initiative update.",
        "Mentor a junior executive or volunteer for a leadership task.",
        "Propose a new activity or improvement for the club."
      ];
    case 'executive':
      return [
        "Take ownership of a specific task within your committee.",
        "Actively participate in committee meetings and offer input.",
        "Assist a Senior Executive or Co-Director with their initiatives."
      ];
    case 'junior executive':
      return [
        "Volunteer for tasks during meetings or events.",
        "Shadow an Executive to learn more about club operations.",
        "Ask questions and seek opportunities to assist your committee."
      ];
    case 'new recruit':
      return [
          "Introduce yourself at the next meeting or social event.",
          "Explore the club website and member resources.",
          "Reach out to your assigned mentor or a committee head."
      ];
    // Default / General Member
    default:
      return [
        "Attend the next club meeting or join an upcoming event.",
        "Participate in online discussions or forums.",
        "Volunteer for a small task or help out at an event."
      ];
  }
};

export default function MemberStatusPortal() {
  const { data: session } = useSession(); // Get session data for basic info
  const [statusData, setStatusData] = useState<MemberStatusData | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Start loading initially
  const [error, setError] = useState<string | null>(null);
  const [isFetching, startFetchingTransition] = useTransition();

  const fetchStatus = () => {
    startFetchingTransition(async () => {
      setIsLoading(true);
      setError(null);
      setStatusData(null);
      try {
        const result = await getMemberStatus();
        if (result.success && result.status) {
          setStatusData(result.status);
        } else {
          setError(result.message || "Failed to fetch status.");
          // Optionally set a default status if user not found in sheet but auth succeeded
          if (result.message.includes("not found")) {
            setStatusData({ statusMessage: "Not found in activity sheet"});
          }
        }
      } catch (err) {
        setError("An unexpected error occurred while fetching your status.");
        console.error("Error fetching member status:", err);
      }
      setIsLoading(false);
    });
  };

  // Fetch status automatically when the component mounts
  useEffect(() => {
    fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  // Determine display name and email (use session data as fallback)
  const displayName = statusData?.name || session?.user?.name || 'Member';
  const displayEmail = statusData?.email || session?.user?.email || 'No email';

  // Calculate progress for the bar
  const progressPercentage = calculateProgress(statusData?.activityCount, statusData?.effectiveThreshold);
  const progressBarColor = statusData?.statusMessage === 'Active' ? 'bg-teal-500' : 
                           statusData?.statusMessage === 'Below Threshold' ? 'bg-amber-500' : 
                           'bg-gray-400';

  // Get role-specific tips if below threshold
  const tips = statusData?.statusMessage === 'Below Threshold' ? getRoleSpecificTips(statusData.role) : [];

  return (
    // Card container with subtle shadow and padding
    <div className="flex flex-col items-center gap-5 p-6 border border-gray-200 rounded-xl shadow-sm w-full max-w-md bg-gradient-to-br from-white to-gray-50 transition-all duration-300">
      {/* Header */} 
      <h2 className="text-2xl font-bold text-gray-800">Your Activity Status</h2>
      
      {/* Basic User Info - Centered */} 
      <div className="flex flex-col items-center gap-2 w-full">
        {session?.user?.image && (
          <Image
            src={session.user.image}
            alt="User profile picture"
            width={64} // Slightly larger image
            height={64}
            className="rounded-full border-2 border-white shadow-md"
          />
        )}
        <p className="font-semibold text-lg text-gray-800 mt-2">{displayName}</p>
        <p className="text-sm text-gray-500">{displayEmail}</p>
      </div>

      {/* Divider */} 
      <hr className="w-full border-t border-gray-200" />

      {/* Status Display Area */} 
      <div className="text-center w-full flex flex-col items-center gap-4">
        {isLoading ? (
          <div className="flex flex-col items-center gap-2 text-gray-500">
              <svg className="animate-spin h-6 w-6 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Loading status...</span>
          </div>
        ) : error ? (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium w-full">
              ⚠️ Error: {error}
          </div>
        ) : statusData ? (
          <div className="w-full flex flex-col items-center gap-4">
            
            {/* Status Badge */} 
            <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Overall Status:</span>
                <span 
                    className={`inline-flex items-center px-3 py-1 rounded-full text-base font-semibold shadow-sm ${ 
                    statusData.statusMessage === 'Active' ? 'bg-green-100 text-green-800 ring-1 ring-inset ring-green-600/20' : 
                    statusData.statusMessage === 'Below Threshold' ? 'bg-yellow-100 text-yellow-800 ring-1 ring-inset ring-yellow-600/20' : 
                    'bg-gray-100 text-gray-800 ring-1 ring-inset ring-gray-500/10'
                    }`}
                >
                    {statusData.statusMessage}
                </span>
            </div>

            {/* Activity Count & Threshold */} 
            {statusData.activityCount !== undefined && statusData.effectiveThreshold !== undefined && (
                <div className="w-full flex flex-col items-center gap-3 pt-4">
                    {/* Progress Bar */}
                    <div className="w-full bg-gray-200 rounded-full h-3 dark:bg-gray-700 overflow-hidden">
                        <div 
                            className={`h-3 rounded-full ${progressBarColor} transition-all duration-500 ease-out`}
                            style={{ width: `${progressPercentage}%` }}
                        ></div>
                    </div>
                    {/* Numerical Display */} 
                    <div className="w-full flex justify-between items-center text-sm">
                        <div className="flex items-center gap-1 text-gray-700">
                             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-blue-500"> <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /> </svg>
                            <span>Your Activity: <span className="font-bold">{statusData.activityCount}</span></span>
                        </div>
                        <div className="flex items-center gap-1 text-gray-500">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-gray-400"> <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.5 7.5 9l4.5 4.5 7.5-7.5M3 19.5h18" /> </svg>
                            <span>Threshold: <span className="font-bold">{statusData.effectiveThreshold}</span></span>
                        </div>
                    </div>
                </div>
            )}

            {/* Role Display */} 
            {statusData.role && (
               <p className="text-xs text-gray-500">(Club Role: {statusData.role})</p>
            )}

            {/* --- Personalized Tips --- */}
            {statusData.statusMessage === 'Below Threshold' && tips.length > 0 && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 w-full shadow-sm">
                <p className="font-semibold mb-2 text-blue-900">💡 Boost Your Engagement ({statusData.role || 'Member'}):</p>
                <ul className="list-disc list-outside space-y-1 text-left ml-5">
                  {tips.map((tip, index) => <li key={index}>{tip}</li>)}
                </ul>
              </div>
            )}
            {/* --- End Personalized Tips --- */}
            
            {/* Active Status Encouragement */} 
            {statusData.statusMessage === 'Active' && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 w-full shadow-sm">
                    <p className="font-medium">🚀 Great job staying active! Keep up the engagement.</p>
                </div>
            )}
          </div>
        ) : (
          <p className="text-gray-500">Could not load status information.</p> 
        )}
      </div>

      {/* --- Club Resources Section --- */}
      <div className="w-full pt-4 mt-4 border-t border-gray-200">
        <h3 className="text-sm font-semibold text-gray-600 mb-2 text-center uppercase tracking-wider">Club Resources</h3>
        <div className="flex flex-col sm:flex-row justify-center gap-3 text-sm">
          {/* Placeholder Links - Replace with actual URLs */} 
          <a href="#" className="text-indigo-600 hover:text-indigo-800 hover:underline transition-colors">Events Calendar</a>
          <span className="hidden sm:inline text-gray-300">|</span>
          <a href="#" className="text-indigo-600 hover:text-indigo-800 hover:underline transition-colors">Contact Directory</a>
          <span className="hidden sm:inline text-gray-300">|</span>
          <a href="#" className="text-indigo-600 hover:text-indigo-800 hover:underline transition-colors">Club Website</a> 
        </div>
      </div>
      {/* --- End Club Resources --- */}

      {/* Refresh Button */} 
      <button 
        onClick={fetchStatus}
        disabled={isLoading || isFetching}
        className="mt-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {isLoading || isFetching ? (
            <span className="flex items-center"><svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"> <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle> <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path> </svg>Refreshing...</span>
        ) : ( 
            <span className="flex items-center"> <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-1.5"> <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /> </svg> Refresh Status</span>
        )}
      </button>
    </div>
  );
} 