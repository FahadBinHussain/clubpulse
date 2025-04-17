'use client';

import { useState, useEffect } from 'react';
import { getWarningLogs } from '@/app/actions';
import { WarningLog, EmailStatus } from '@prisma/client'; // Import full type

// Define the structure expected by the component (including relations if needed later)
// For now, directly use the Prisma type
// interface WarningLogEntry extends WarningLog {}

export default function WarningLogViewer() {
  const [logs, setLogs] = useState<WarningLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLogs = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await getWarningLogs();
        if (result.success && result.logs) {
          // Convert date strings to Date objects if needed (Prisma usually handles this)
          // const logsWithDates = result.logs.map(log => ({...log, createdAt: new Date(log.createdAt), emailSentAt: log.emailSentAt ? new Date(log.emailSentAt) : null }));
          setLogs(result.logs);
        } else {
          setError(result.message || "Failed to fetch warning logs.");
        }
      } catch (err) {
        setError("An unexpected client-side error occurred while fetching logs.");
        console.error("Error fetching warning logs:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchLogs();
  }, []);

  // Helper to format status
  const formatStatus = (status: EmailStatus) => {
      switch (status) {
        case EmailStatus.QUEUED: return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800">Queued</span>;
        case EmailStatus.APPROVED: return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">Approved</span>; // Should not appear if processing works
        case EmailStatus.SENT: return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800">Sent</span>;
        case EmailStatus.CANCELED: return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-800">Canceled</span>;
        case EmailStatus.FAILED: return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800">Failed</span>;
        default: return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-500">Unknown</span>;
      }
  }

  return (
    <div className="mt-6 p-4 border rounded-lg shadow-md w-full max-w-4xl flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Warning Log</h2>

      {isLoading && <p>Loading logs...</p>}
      {error && <p className="text-red-600">Error fetching logs: {error}</p>}

      {!isLoading && !error && logs.length === 0 && (
        <p>No warning logs found.</p>
      )}

      {!isLoading && !error && logs.length > 0 && (
        <div className="overflow-x-auto border border-gray-200 rounded-md max-h-[400px]"> {/* Added max-height and scroll */}
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Recipient</th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Activity / Threshold</th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Template</th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Email Status</th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Opened?</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 whitespace-nowrap text-gray-500">{new Date(log.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-700">{log.recipientName || 'N/A'} ({log.recipientEmail})</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                    <span className="font-medium">{log.activityCount}</span> / {log.threshold}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-500 font-mono text-xs">{log.templateUsed}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatStatus(log.status)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-center">
                    {log.emailOpened ? 
                      <span title={`Opened at ${log.emailSentAt ? new Date(log.emailSentAt).toLocaleString() : 'N/A'}`} className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100 text-green-700">
                        ✓
                      </span> 
                      : 
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-400">
                        -
                      </span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
} 