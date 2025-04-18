'use client';

import { useState, useEffect, useTransition, useCallback, useRef } from 'react';
import { getAdminLogs } from '@/app/actions';
import { AdminLog } from '@prisma/client'; // Import AdminLog type

const PAGE_SIZE = 10; // Define page size constant

// Helper to format date
const formatDate = (date: Date | null | undefined): string => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleString(); 
};

// Helper to format details JSON nicely
const formatDetails = (details: unknown): string => {
    if (!details) return 'N/A';
    try {
        return JSON.stringify(details);
    } catch (e) {
        console.error("Error formatting details JSON:", e);
        return 'Invalid JSON';
    }
};

// --- Types for sorting --- 
type SortField = 'timestamp' | 'adminUserEmail' | 'action';
type SortDirection = 'asc' | 'desc';
type SortOption = `${SortField}_${SortDirection}`;

// --- Sort Component --- 
const SortIcon = ({ direction }: { direction: SortDirection | null }) => {
  if (!direction) return null;
  return direction === 'asc' ? <span className="ml-1">▲</span> : <span className="ml-1">▼</span>;
};

// Debounce helper function
function debounce<F extends (...args: any[]) => any>(func: F, wait: number): (...args: Parameters<F>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<F>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

export default function AdminLogViewer() {
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFetching, startFetchingTransition] = useTransition();

  // State for pagination, filtering, and sorting
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [filterUserEmail, setFilterUserEmail] = useState<string>('');
  const [filterAction, setFilterAction] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortOption>('timestamp_desc'); // Default sort

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Refs for input values to avoid direct state dependency in debounce
  const userEmailFilterRef = useRef(filterUserEmail);
  const actionFilterRef = useRef(filterAction);

  // Fetch logs function - useCallback to stabilize
  const fetchLogs = useCallback((page: number, userEmail: string | null, action: string | null, sort: SortOption) => {
    startFetchingTransition(async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await getAdminLogs(page, PAGE_SIZE, userEmail, action, sort); 
        if (result.success && result.logs) {
          setLogs(result.logs); // Assuming dates are handled correctly by Prisma/driver
          setTotalCount(result.totalCount || 0);
          setCurrentPage(result.page || 1);
          // Only update filter state *if* they were actually passed back (or default)
          setFilterUserEmail(result.filterUserEmail || '');
          setFilterAction(result.filterAction || '');
          userEmailFilterRef.current = result.filterUserEmail || ''; // Sync ref
          actionFilterRef.current = result.filterAction || '';     // Sync ref
          setSortBy(result.sortBy as SortOption ?? 'timestamp_desc');
        } else {
          setError(result.message || "Failed to fetch logs.");
          setLogs([]);
          setTotalCount(0);
        }
      } catch (err) {
        setError("An unexpected client-side error occurred while fetching logs.");
        console.error("Error fetching admin logs:", err);
        setLogs([]);
        setTotalCount(0);
      } finally {
        setIsLoading(false);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // No dependencies needed here

  // Initial fetch
  useEffect(() => {
    fetchLogs(currentPage, filterUserEmail, filterAction, sortBy);
  }, [fetchLogs]); // Run only once on mount

  // Debounced fetch function for filter inputs
  const debouncedFetch = useCallback(debounce((page, userEmail, action, sort) => {
    fetchLogs(page, userEmail, action, sort);
  }, 500), [fetchLogs]); // Debounce by 500ms

  // --- Handlers --- 
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages && newPage !== currentPage) {
      fetchLogs(newPage, userEmailFilterRef.current, actionFilterRef.current, sortBy);
    }
  };

  const handleFilterUserEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFilterUserEmail(value); // Update state immediately for input control
    userEmailFilterRef.current = value; // Update ref immediately
    setCurrentPage(1);
    debouncedFetch(1, value, actionFilterRef.current, sortBy);
  };

  const handleFilterActionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFilterAction(value); // Update state immediately
    actionFilterRef.current = value; // Update ref immediately
    setCurrentPage(1);
    debouncedFetch(1, userEmailFilterRef.current, value, sortBy);
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
    setCurrentPage(1);
    fetchLogs(1, userEmailFilterRef.current, actionFilterRef.current, newSortBy);
  };

  return (
    <div className="mt-6 p-4 border rounded-lg shadow-md w-full flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Admin Activity Log</h2>

      {/* --- Filter Controls --- */} 
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-2">
          <div className="flex items-center gap-2">
              <label htmlFor="userFilter" className="font-medium text-gray-700 min-w-[70px]">Filter User:</label>
              <input 
                type="text"
                id="userFilter"
                placeholder="Enter user email..."
                value={filterUserEmail}
                onChange={handleFilterUserEmailChange}
                disabled={isFetching}
                className="flex-grow p-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
          </div>
          <div className="flex items-center gap-2">
              <label htmlFor="actionFilter" className="font-medium text-gray-700 min-w-[70px]">Filter Action:</label>
              <input 
                type="text"
                id="actionFilter"
                placeholder="Enter action type..."
                value={filterAction}
                onChange={handleFilterActionChange}
                disabled={isFetching}
                className="flex-grow p-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
          </div>
      </div>
      {/* --- End Filter Controls --- */} 

      {isLoading && <p>Loading logs...</p>}
      {error && <p className="text-red-600">Error fetching logs: {error}</p>}

      {!isLoading && !error && logs.length === 0 && (
        <p>No admin activity logs found matching the criteria.</p>
      )}

      {!isLoading && !error && logs.length > 0 && (
        <div className="overflow-x-auto border border-gray-200 rounded-md max-h-[400px]">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th scope="col" className="sticky left-0 bg-gray-50 px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSortChange('timestamp')}>
                    Timestamp
                    {sortBy.startsWith('timestamp') && <SortIcon direction={sortBy.endsWith('asc') ? 'asc' : 'desc'} />}
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSortChange('adminUserEmail')}>
                    Admin User
                    {sortBy.startsWith('adminUserEmail') && <SortIcon direction={sortBy.endsWith('asc') ? 'asc' : 'desc'} />}
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSortChange('action')}>
                    Action
                    {sortBy.startsWith('action') && <SortIcon direction={sortBy.endsWith('asc') ? 'asc' : 'desc'} />}
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Details</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="sticky left-0 bg-white hover:bg-gray-50 px-3 py-2 whitespace-nowrap text-gray-500">{formatDate(log.timestamp)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-700">{log.adminUserEmail}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-700 font-mono text-xs">{log.action}</td>
                  <td className="px-3 py-2 whitespace-normal text-gray-500 font-mono text-xs break-words">{formatDetails(log.details)}</td> 
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