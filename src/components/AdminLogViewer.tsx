'use client';

import { useState, useEffect } from 'react';
import { getAdminLogs } from '@/app/actions';
import { AdminLog } from '@prisma/client'; // Import AdminLog type

export default function AdminLogViewer() {
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLogs = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await getAdminLogs();
        if (result.success && result.logs) {
          setLogs(result.logs);
        } else {
          setError(result.message || "Failed to fetch admin logs.");
        }
      } catch (err) {
        setError("An unexpected client-side error occurred while fetching logs.");
        console.error("Error fetching admin logs:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchLogs();
  }, []);

  // Helper to format details JSON nicely
  const formatDetails = (details: any): string => { 
      if (!details) return 'N/A';
      try {
          // Basic formatting, customize as needed
          return JSON.stringify(details);
      } catch (e) {
          return 'Invalid JSON';
      }
  };

  return (
    <div className="mt-6 p-4 border rounded-lg shadow-md w-full max-w-4xl flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Admin Activity Log</h2>

      {isLoading && <p>Loading logs...</p>}
      {error && <p className="text-red-600">Error fetching logs: {error}</p>}

      {!isLoading && !error && logs.length === 0 && (
        <p>No admin activity logs found.</p>
      )}

      {!isLoading && !error && logs.length > 0 && (
        <div className="overflow-x-auto border border-gray-200 rounded-md max-h-[400px]"> {/* Added max-height */}
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Admin User</th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Action</th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Details</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 whitespace-nowrap text-gray-500">{new Date(log.timestamp).toLocaleString()}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-700">{log.adminUserEmail}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-700 font-mono text-xs">{log.action}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-500 font-mono text-xs">{formatDetails(log.details)}</td> 
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
} 