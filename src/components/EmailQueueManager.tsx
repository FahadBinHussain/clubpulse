'use client';

import { useState, useEffect, useTransition } from 'react';
import { getEmailQueue, updateEmailStatus, checkMemberActivity } from '@/app/actions';
import { EmailStatus } from '@prisma/client';

interface QueuedEmail {
  id: string;
  recipientEmail: string;
  recipientName: string | null;
  subject: string;
  template: string | null;
  createdAt: Date; 
}

// Interface for sheet errors returned from the action
interface SheetError {
    rowIndex: number;
    reason: string;
    rowData: (string | number | boolean | null)[]; // Store the raw row data
}

export default function EmailQueueManager() {
  const [queuedEmails, setQueuedEmails] = useState<QueuedEmail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, startUpdateTransition] = useTransition();
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [isChecking, startCheckTransition] = useTransition();
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const [sheetErrors, setSheetErrors] = useState<SheetError[]>([]); // <-- State for sheet errors

  const handleCheckAndRefresh = () => {
    startCheckTransition(async () => {
      setIsLoading(true);
      setError(null);
      setUpdateMessage(null);
      setCheckMessage("Checking sheet & queuing new warnings...");
      setSheetErrors([]); // Clear previous errors

      try {
        const checkResult = await checkMemberActivity();
        setCheckMessage(checkResult.message); // Show the summary message
        if (checkResult.errorsList && checkResult.errorsList.length > 0) {
            setSheetErrors(checkResult.errorsList); // Store the detailed errors
            console.log("Sheet validation errors found:", checkResult.errorsList);
        }
        if (!checkResult.success && (!checkResult.errorsList || checkResult.errorsList.length === 0)) {
            // Log if the overall check failed but no specific row errors were returned
            console.warn("checkMemberActivity failed but no specific errors list returned:", checkResult.message);
        }
        // Always try to fetch the queue even if check had errors/warnings
      } catch (err) {
        setCheckMessage("An error occurred during sheet check.");
        console.error("Error calling checkMemberActivity:", err);
        // Optionally set sheetErrors here too if the whole action failed
      }

      // Fetch Email Queue (moved outside the check try-catch)
      try {
        const result = await getEmailQueue();
        console.log("Result received in EmailQueueManager:", JSON.stringify(result, null, 2)); // Keep this log
        if (result.success && result.emails) {
          const emailsWithDate = result.emails.map(email => ({...email, createdAt: new Date(email.createdAt) }));
          setQueuedEmails(emailsWithDate);
        } else {
          setError(result.message || "Failed to fetch email queue.");
          setQueuedEmails([]);
        }
      } catch (err) {
        setError("An unexpected error occurred while fetching the queue.");
        console.error(err);
        setQueuedEmails([]);
      } finally {
         setIsLoading(false); // Set loading false only after both check and fetch attempt
      }

    });
  };

  useEffect(() => {
    const initialFetch = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const result = await getEmailQueue();
            if (result.success && result.emails) {
                const emailsWithDate = result.emails.map(email => ({...
                  email,
                  createdAt: new Date(email.createdAt)
                }));
                setQueuedEmails(emailsWithDate);
            } else {
                setError(result.message || "Failed to fetch email queue.");
            }
        } catch (err) {
            setError("An unexpected error occurred while fetching the queue.");
            console.error(err);
        }
        setIsLoading(false);
    };
    initialFetch();
  }, []);

  const handleUpdate = (emailId: string, status: EmailStatus) => {
    startUpdateTransition(async () => {
        setUpdateMessage(`Updating email ${emailId} to ${status}...`);
        try {
            const result = await updateEmailStatus(emailId, status);
            setUpdateMessage(result.message); 
            if(result.success) {
                setQueuedEmails(prevEmails => prevEmails.filter(email => email.id !== emailId));
            } 
        } catch (err) {
            setUpdateMessage("An unexpected error occurred during update.");
            console.error(err);
        }
    });
  };

  return (
    <div className="mt-6 p-4 border rounded-lg shadow-md w-full max-w-4xl flex flex-col gap-4"> {/* Added flex-col and gap-4 */} 
      {/* --- Email Queue Section --- */}
      <div className="w-full">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-xl font-semibold">Email Approval Queue</h2>
          <button 
            onClick={handleCheckAndRefresh}
            disabled={isLoading || isUpdating || isChecking}
            className="px-3 py-1 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50"
          >
            {isChecking ? "Checking..." : "Check Sheet & Refresh Queue"}
          </button>
        </div>

        {checkMessage && <p className={`text-sm mb-2 ${checkMessage.includes("Failed") || checkMessage.includes("Error") ? 'text-red-600' : 'text-blue-600'}`}>{checkMessage}</p>}

        {isLoading && <p>Loading email queue...</p>}
        {error && <p className="text-red-600">Error fetching queue: {error}</p>}
        {updateMessage && <p className={`text-sm mb-2 ${updateMessage.includes("Failed") || updateMessage.includes("Error") ? 'text-red-600' : 'text-blue-600'}`}>{updateMessage}</p>}

        {/* --- Responsive Email Queue Display --- */}
        {!isLoading && !error && queuedEmails.length === 0 && (
          <p>No emails currently pending approval.</p>
        )}
        
        {/* Table for Medium screens and up */} 
        {!isLoading && !error && queuedEmails.length > 0 && (
          <div className="hidden md:block overflow-x-auto border border-gray-200 rounded-md">
            <table className="min-w-full divide-y divide-gray-200">
              {/* Make thead sticky */} 
              <thead className="bg-gray-50 sticky top-0 z-10"> 
                <tr>
                  <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recipient</th>
                  <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</th>
                  <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Queued At</th>
                  {/* Make Actions header sticky */} 
                  <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky right-0 bg-gray-50">Actions</th> 
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {queuedEmails.map((email) => (
                  <tr key={email.id}>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{email.recipientName || 'N/A'} ({email.recipientEmail})</td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{email.subject}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">{email.createdAt.toLocaleString()}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm font-medium space-x-2 sticky right-0 bg-white">
                      <button
                        onClick={() => handleUpdate(email.id, EmailStatus.APPROVED)}
                        disabled={isUpdating || isChecking}
                        className="text-green-600 hover:text-green-900 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleUpdate(email.id, EmailStatus.CANCELED)}
                        disabled={isUpdating || isChecking}
                        className="text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Cancel
                      </button>
                      {/* TODO: Add Preview button later */} 
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Cards for Small screens */} 
        {!isLoading && !error && queuedEmails.length > 0 && (
          <div className="block md:hidden space-y-3">
            {queuedEmails.map((email) => (
              <div key={email.id} className="p-3 border rounded-lg shadow-sm bg-white text-sm">
                <div className="mb-2">
                  <span className="font-medium text-gray-700">Recipient:</span> {email.recipientName || 'N/A'} ({email.recipientEmail})
                </div>
                <div className="mb-2">
                  <span className="font-medium text-gray-700">Subject:</span> {email.subject}
                </div>
                <div className="mb-3 text-xs text-gray-500">
                  <span className="font-medium">Queued:</span> {email.createdAt.toLocaleString()}
                </div>
                <div className="flex justify-end space-x-3 border-t pt-2">
                  <button
                    onClick={() => handleUpdate(email.id, EmailStatus.APPROVED)}
                    disabled={isUpdating || isChecking}
                    className="text-green-600 hover:text-green-900 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleUpdate(email.id, EmailStatus.CANCELED)}
                    disabled={isUpdating || isChecking}
                    className="text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- Responsive Sheet Errors Section --- */}
      {sheetErrors.length > 0 && (
        <div className="mt-4 pt-4 border-t w-full">
          <h3 className="text-lg font-semibold text-red-700 mb-2">Sheet Validation Errors ({sheetErrors.length})</h3>
          <p className="text-sm text-gray-600 mb-2">The following rows in the Google Sheet could not be processed. Please correct them and run the check again.</p>
          
          {/* Table for Medium screens and up */} 
          <div className="hidden md:block overflow-x-auto max-h-60 border rounded-md">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              {/* ... existing error table thead ... */} 
               <thead className="bg-red-50 sticky top-0">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-red-800 uppercase tracking-wider">Row</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-red-800 uppercase tracking-wider">Name (from Sheet)</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-red-800 uppercase tracking-wider">Reason</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-red-800 uppercase tracking-wider">Raw Row Data</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {/* ... existing error table tbody mapping ... */}
                {sheetErrors.map((err) => {
                  const nameFromSheet = typeof err.rowData?.[0] === 'string' ? err.rowData[0] : 'N/A';
                  return (
                    <tr key={err.rowIndex} className="hover:bg-red-50">
                      <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-900">{err.rowIndex}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-700">{nameFromSheet}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-red-700">{err.reason}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-500 font-mono">{JSON.stringify(err.rowData)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {/* Cards for Small screens */} 
          <div className="block md:hidden space-y-2 max-h-60 overflow-y-auto border rounded-md p-2 bg-red-50">
            {sheetErrors.map((err) => {
              const nameFromSheet = typeof err.rowData?.[0] === 'string' ? err.rowData[0] : 'N/A';
              return (
                <div key={err.rowIndex} className="p-2 border-b border-red-200 bg-white rounded shadow-sm text-xs">
                  <div className="mb-1 font-medium">
                    <span className="text-gray-700">Row:</span> <span className="text-gray-900">{err.rowIndex}</span> | <span className="text-gray-700">Name:</span> <span className="text-gray-900">{nameFromSheet}</span>
                  </div>
                  <div className="mb-1">
                    <span className="font-medium text-red-700">Reason:</span> <span className="text-red-800">{err.reason}</span>
                  </div>
                  <div className="text-gray-500 font-mono break-all">
                     <span className="font-medium text-gray-600">Data:</span> {JSON.stringify(err.rowData)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
} 