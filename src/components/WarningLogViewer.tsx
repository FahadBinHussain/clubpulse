'use client';

import { useState, useEffect, useTransition } from 'react';
import { getWarningLogs } from '@/app/actions';
import { WarningLog, EmailStatus } from '@prisma/client'; // Import WarningLog type

const PAGE_SIZE = 10; // Define page size constant

// Helper to format date
const formatDate = (date: Date | null | undefined): string => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleString(); 
};

// Helper to get badge color based on status
const getStatusBadgeClass = (status: EmailStatus): string => {
  switch (status) {
    case EmailStatus.QUEUED:
      return 'bg-blue-100 text-blue-800';
    case EmailStatus.APPROVED:
      return 'bg-yellow-100 text-yellow-800';
    case EmailStatus.SENT:
      return 'bg-green-100 text-green-800';
    case EmailStatus.CANCELED:
      return 'bg-gray-100 text-gray-800';
    case EmailStatus.FAILED:
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export default function WarningLogViewer() {
  const [logs, setLogs] = useState<WarningLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFetching, startFetchingTransition] = useTransition();
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Fetch logs function
  const fetchLogs = (page: number) => {
    startFetchingTransition(async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await getWarningLogs(page, PAGE_SIZE); // Pass page and size
        if (result.success && result.logs) {
          // Ensure dates are Date objects
          const logsWithDates = result.logs.map(log => ({ 
            ...log, 
            createdAt: new Date(log.createdAt), 
            emailSentAt: log.emailSentAt ? new Date(log.emailSentAt) : null,
            // emailOpenedAt needs to be handled similarly if added to the model/action
          }));
          setLogs(logsWithDates);
          setTotalCount(result.totalCount || 0); // Update total count
          setCurrentPage(result.page || 1); // Update current page from result
        } else {
          setError(result.message || "Failed to fetch logs.");
          setLogs([]);
          setTotalCount(0);
        }
      } catch (err) {
        setError("An unexpected client-side error occurred while fetching logs.");
        console.error("Error fetching logs:", err);
        setLogs([]);
        setTotalCount(0);
      } finally {
        setIsLoading(false);
      }
    });
  };

  // Initial fetch
  useEffect(() => {
    fetchLogs(currentPage); 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Fetch only on mount initially

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages && newPage !== currentPage) {
      fetchLogs(newPage);
    }
  };

  return (
    <div className="mt-6 p-4 border rounded-lg shadow-md w-full max-w-4xl flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Warning Logs</h2>

      {isLoading && <p>Loading logs...</p>}
      {error && <p className="text-red-600">Error: {error}</p>}

      {!isLoading && !error && logs.length === 0 && (
        <p>No warning logs found.</p>
      )}

      {/* Log Table (Responsive) */} 
      {!isLoading && !error && logs.length > 0 && (
        <div className="overflow-x-auto border border-gray-200 rounded-md">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Recipient</th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Template</th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Activity</th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Threshold</th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Logged At</th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Sent At</th>
                <th scope="col" className="px-3 py-2 text-center font-medium text-gray-500 uppercase tracking-wider">Opened?</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 whitespace-nowrap">
                      <div>{log.recipientName || 'N/A'}</div>
                      <div className="text-xs text-gray-500">{log.recipientEmail}</div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap hidden md:table-cell text-gray-700">{log.templateUsed}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-center text-gray-700">{log.activityCount}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-center text-gray-700">{log.threshold}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(log.status)}`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap hidden lg:table-cell text-gray-500">{formatDate(log.createdAt)}</td>
                  <td className="px-3 py-2 whitespace-nowrap hidden lg:table-cell text-gray-500">{formatDate(log.emailSentAt)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-center text-gray-700">
                    {log.emailOpened ? 
                        <span className="text-green-600" title="Email was opened">✔️</span> : 
                        <span className="text-gray-400" title="Email not opened or tracking unavailable">➖</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      {/* Pagination Controls */} 
      {!isLoading && !error && totalPages > 1 && (
          <div className="flex justify-between items-center mt-4 text-sm">
              {/* Previous Button */} 
              <button 
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1 || isFetching}
                className="px-3 py-1 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                &larr; Previous
              </button>

              {/* Page Info */} 
              <span className="text-gray-600">
                Page {currentPage} of {totalPages} (Total: {totalCount})
              </span>
              
              {/* Next Button */} 
              <button 
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages || isFetching}
                className="px-3 py-1 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next &rarr;
              </button>
          </div>
      )}
    </div>
  );
} 