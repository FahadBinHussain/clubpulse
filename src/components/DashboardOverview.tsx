'use client';

import { useState, useEffect } from 'react';
import { getDashboardSummary } from '@/app/actions';
import { AdminLog } from '@prisma/client';

// Helper to format date (could move to a utils file)
const formatDate = (date: Date | string | null | undefined): string => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }); 
};

// Define structure for the data fetched by the action
interface DashboardSummaryData {
  pendingEmailCount: number;
  recentAdminLogs: Pick<AdminLog, 'id' | 'adminUserEmail' | 'action' | 'timestamp'>[];
}

// Example icons (replace with actual imports or SVGs)
const ClockIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>;
const EnvelopeIcon = () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>;

export default function DashboardOverview() {
  const [summaryData, setSummaryData] = useState<DashboardSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await getDashboardSummary();
        if (result.success && result.data) {
          setSummaryData(result.data);
        } else {
          setError(result.message || "Failed to fetch dashboard data.");
        }
      } catch (err) {
        setError("An unexpected client-side error occurred.");
        console.error("Error fetching dashboard summary:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {/* Welcome Message (Can be passed as prop or fetched if needed) */}
      {/* <h2 className="text-2xl font-semibold text-gray-800">Dashboard Overview</h2> */}
      
      {isLoading && <p className="text-center text-gray-500 dark:text-gray-400">Loading dashboard data...</p>}
      {error && <p className="text-center text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 p-3 rounded border border-red-200 dark:border-red-800/30">Error: {error}</p>}

      {!isLoading && !error && summaryData && (
        <>
          {/* Key Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Pending Emails Card */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/50 dark:to-blue-950/60 p-4 rounded-lg shadow border border-blue-200 dark:border-blue-800/50 flex items-center gap-4">
              <div className="p-3 rounded-full bg-blue-500 dark:bg-blue-600 text-white">
                 <EnvelopeIcon />
              </div>
              <div>
                <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">Pending Emails</p>
                <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{summaryData.pendingEmailCount}</p>
              </div>
            </div>

            {/* Example Placeholder Card */}
             <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/50 dark:to-yellow-950/60 p-4 rounded-lg shadow border border-yellow-200 dark:border-yellow-800/50 flex items-center gap-4">
               <div className="p-3 rounded-full bg-yellow-500 dark:bg-yellow-600 text-white">
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.008v.008H12z" /></svg>
               </div>
               <div>
                 <p className="text-sm text-yellow-700 dark:text-yellow-300 font-medium">Warnings Today</p>
                 <p className="text-2xl font-bold text-yellow-900 dark:text-yellow-100">0</p> {/* Replace with actual data */}
               </div>
             </div>
          </div>

          {/* Recent Activity Feed */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-3">Recent Admin Activity</h3>
            {summaryData.recentAdminLogs.length > 0 ? (
              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {summaryData.recentAdminLogs.map((log) => (
                  <li key={log.id} className="py-3 flex justify-between items-center text-sm">
                    <div>
                      <p className="text-gray-800 dark:text-gray-100 font-medium capitalize">{log.action.replace(/_/g, ' ')}</p>
                      <p className="text-gray-500 dark:text-gray-400 text-xs">by {log.adminUserEmail}</p>
                    </div>
                    <div className="text-gray-400 dark:text-gray-500 text-xs flex items-center gap-1">
                       <ClockIcon />
                       {formatDate(log.timestamp)}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No recent admin activity found.</p>
            )}
            {/* Optional: Link to full Admin Log view */}
            {/* <button className="text-sm text-indigo-600 hover:underline mt-3">View all logs</button> */} 
          </div>
        </>
      )}
    </div>
  );
} 