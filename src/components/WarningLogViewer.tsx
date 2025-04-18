'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
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

// --- Types for sorting --- 
type SortField = 'createdAt' | 'activityCount' | 'recipientName' | 'status';
type SortDirection = 'asc' | 'desc';
type SortOption = `${SortField}_${SortDirection}`;

// --- Sort Component --- 
const SortIcon = ({ direction }: { direction: SortDirection | null }) => {
  if (!direction) return null;
  return direction === 'asc' ? <span className="ml-1">▲</span> : <span className="ml-1">▼</span>;
};

export default function WarningLogViewer() {
  const [logs, setLogs] = useState<WarningLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFetching, startFetchingTransition] = useTransition();
  
  // State for pagination, filtering, and sorting
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [filterStatus, setFilterStatus] = useState<EmailStatus | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('createdAt_desc'); // Default sort
  
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Fetch logs function - useCallback to stabilize
  const fetchLogs = useCallback((page: number, status: EmailStatus | null, sort: SortOption) => {
    startFetchingTransition(async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await getWarningLogs(page, PAGE_SIZE, status, sort); 
        if (result.success && result.logs) {
          const logsWithDates = result.logs.map(log => ({ 
            ...log, 
            createdAt: new Date(log.createdAt), 
            emailSentAt: log.emailSentAt ? new Date(log.emailSentAt) : null,
          }));
          setLogs(logsWithDates);
          setTotalCount(result.totalCount || 0);
          setCurrentPage(result.page || 1);
          setFilterStatus(result.filterStatus ?? null); // Update state from response
          setSortBy(result.sortBy as SortOption ?? 'createdAt_desc'); // Update state from response
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Dependencies: none needed due to how it's called

  // Initial fetch
  useEffect(() => {
    fetchLogs(currentPage, filterStatus, sortBy); 
  }, [fetchLogs]); // Run fetchLogs once on mount

  // --- Handlers for UI controls --- 
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages && newPage !== currentPage) {
      fetchLogs(newPage, filterStatus, sortBy);
    }
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value ? e.target.value as EmailStatus : null;
    setFilterStatus(newStatus);
    setCurrentPage(1); // Reset to page 1 when filter changes
    fetchLogs(1, newStatus, sortBy);
  };

  const handleSortChange = (field: SortField) => {
    const currentField = sortBy.split('_')[0];
    const currentDirection = sortBy.split('_')[1] as SortDirection;
    let newDirection: SortDirection = 'desc';
    if (field === currentField && currentDirection === 'desc') {
      newDirection = 'asc';
    }
    const newSortBy = `${field}_${newDirection}` as SortOption;
    setSortBy(newSortBy);
    setCurrentPage(1); // Reset to page 1 when sort changes
    fetchLogs(1, filterStatus, newSortBy);
  };
  // --- End Handlers --- 

  return (
    <div className="mt-6 p-4 border rounded-lg shadow-md w-full max-w-4xl flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Warning Logs</h2>

      {/* --- Filter Controls --- */} 
      <div className="flex items-center gap-4 text-sm">
          <label htmlFor="statusFilter" className="font-medium text-gray-700">Filter by Status:</label>
          <select 
            id="statusFilter"
            value={filterStatus || ''}
            onChange={handleFilterChange}
            disabled={isFetching}
            className="p-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">All Statuses</option>
            {Object.values(EmailStatus).map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
      </div>
      {/* --- End Filter Controls --- */} 

      {isLoading && <p>Loading logs...</p>}
      {error && <p className="text-red-600">Error: {error}</p>}

      {!isLoading && !error && logs.length === 0 && (
        <p>No warning logs found{filterStatus ? ` with status '${filterStatus}'` : ''}.</p>
      )}

      {/* --- Log Table (Responsive) --- */} 
      {!isLoading && !error && logs.length > 0 && (
        <div className="overflow-x-auto border border-gray-200 rounded-md">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSortChange('recipientName')}>
                  Recipient
                  {sortBy.startsWith('recipientName') && <SortIcon direction={sortBy.endsWith('asc') ? 'asc' : 'desc'} />}
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Template</th>
                <th scope="col" className="px-3 py-2 text-center font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSortChange('activityCount')}>
                  Activity
                  {sortBy.startsWith('activityCount') && <SortIcon direction={sortBy.endsWith('asc') ? 'asc' : 'desc'} />}
                </th>
                <th scope="col" className="px-3 py-2 text-center font-medium text-gray-500 uppercase tracking-wider">Threshold</th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSortChange('status')}>
                  Status
                  {sortBy.startsWith('status') && <SortIcon direction={sortBy.endsWith('asc') ? 'asc' : 'desc'} />}
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell cursor-pointer hover:bg-gray-100" onClick={() => handleSortChange('createdAt')}>
                  Logged At
                  {sortBy.startsWith('createdAt') && <SortIcon direction={sortBy.endsWith('asc') ? 'asc' : 'desc'} />}
                </th>
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
      
      {/* --- Pagination Controls --- */} 
      {!isLoading && !error && totalPages > 1 && (
          <div className="flex justify-between items-center mt-4 text-sm">
              <button 
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1 || isFetching}
                className="px-3 py-1 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                &larr; Previous
              </button>
              <span className="text-gray-600">
                Page {currentPage} of {totalPages} (Total: {totalCount})
              </span>
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