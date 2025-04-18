'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import Pusher from 'pusher-js';
import { getEmailQueue, updateEmailStatus, checkMemberActivity, getEmailBodyHtml, approveAllQueuedEmails } from '@/app/actions';
import { EmailStatus } from '@prisma/client';
import { CheckCircleIcon, XCircleIcon, EyeIcon, ArrowPathIcon, ExclamationTriangleIcon } from '@/components/icons'; // Assume you have an icons component

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

// --- Pusher Constants (Match actions.ts) ---
const PUSHER_CHANNEL = 'admin-updates';
const PUSHER_EMAIL_QUEUE_EVENT = 'email-queue-updated';
// --- End Pusher Constants ---

// --- Component Specific Types ---
interface QueuedEmail {
  id: string;
  recipientEmail: string;
  recipientName: string | null;
  subject: string;
  template: string | null;
  createdAt: Date; 
}

// Type for Pusher event data
type PusherEmailQueueEventData = 
  | { triggeredBy: 'checkMemberActivity' }
  | { updatedId: string; newStatus: EmailStatus };
// --- End Types ---

export default function EmailQueueManager() {
  const [queuedEmails, setQueuedEmails] = useState<QueuedEmail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, startUpdateTransition] = useTransition();
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [isChecking, startCheckTransition] = useTransition();
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const [sheetErrors, setSheetErrors] = useState<SheetError[]>([]);
  const [isApprovingAll, startApproveAllTransition] = useTransition();
  const [approveAllMessage, setApproveAllMessage] = useState<string | null>(null);

  // --- State for Preview Modal ---
  const [isPreviewing, startPreviewTransition] = useTransition();
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentPreviewEmailId, setCurrentPreviewEmailId] = useState<string | null>(null);
  // --- End Preview State ---

  // --- Extracted Data Fetching Logic ---
  const fetchQueue = useCallback(async (setLoading = true) => {
      if (setLoading) setIsLoading(true);
      setError(null);
      try {
        const result = await getEmailQueue();
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
         if (setLoading) setIsLoading(false);
      }
  }, []);
  // --- End Data Fetching Logic ---

  const handleCheckAndRefresh = () => {
    startCheckTransition(async () => {
      setError(null);
      setUpdateMessage(null);
      setCheckMessage("Checking sheet & queuing new warnings...");
      setSheetErrors([]);

      try {
        const checkResult = await checkMemberActivity();
        setCheckMessage(checkResult.message);
        if (checkResult.errorsList && checkResult.errorsList.length > 0) {
            setSheetErrors(checkResult.errorsList);
            console.log("Sheet validation errors found:", checkResult.errorsList);
        }
        if (!checkResult.success && (!checkResult.errorsList || checkResult.errorsList.length === 0)) {
            console.warn("checkMemberActivity failed but no specific errors list returned:", checkResult.message);
        }
      } catch (err) {
        setCheckMessage("An error occurred during sheet check.");
        console.error("Error calling checkMemberActivity:", err);
      } finally {
          await fetchQueue();
      }
    });
  };

  // --- Initial Fetch & Pusher Setup ---
  useEffect(() => {
    fetchQueue();

    const pusherKey = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const pusherCluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

    if (!pusherKey || !pusherCluster) {
        console.warn("Pusher client keys not found in environment variables. Realtime updates disabled.");
        return;
    }

    const pusherClient = new Pusher(pusherKey, {
      cluster: pusherCluster,
    });

    const channel = pusherClient.subscribe(PUSHER_CHANNEL);

    channel.bind(PUSHER_EMAIL_QUEUE_EVENT, (data: PusherEmailQueueEventData) => {
      console.log('Pusher event received:', PUSHER_EMAIL_QUEUE_EVENT, data);
      fetchQueue(false);
      setUpdateMessage('Email queue updated in background.');
      setTimeout(() => setUpdateMessage(null), 3000);
    });

    return () => {
      console.log("Unbinding from Pusher event and unsubscribing from channel.");
      channel.unbind(PUSHER_EMAIL_QUEUE_EVENT);
      pusherClient.unsubscribe(PUSHER_CHANNEL);
    };
  }, [fetchQueue]);
  // --- End Initial Fetch & Pusher Setup ---

  const handleUpdate = (emailId: string, status: EmailStatus) => {
    startUpdateTransition(async () => {
        setUpdateMessage(`Updating email ${emailId} to ${status}...`);
        try {
            const result = await updateEmailStatus(emailId, status);
            setUpdateMessage(result.message); 
        } catch (err) {
            setUpdateMessage("An unexpected error occurred during update.");
            console.error(err);
        }
    });
  };

  // --- Handle Preview Click ---
  const handlePreview = (emailId: string) => {
    startPreviewTransition(async () => {
      setPreviewError(null);
      setPreviewHtml(null);
      setIsModalOpen(true);
      setCurrentPreviewEmailId(emailId);
      
      try {
        const result = await getEmailBodyHtml(emailId);
        if (result.success && result.htmlContent) {
          setPreviewHtml(result.htmlContent);
        } else {
          setPreviewError(result.message || "Failed to fetch email content.");
        }
      } catch (err) {
        setPreviewError("An unexpected error occurred while fetching preview.");
        console.error("Preview error:", err);
      }
    });
  };
  
  const closeModal = () => {
      setIsModalOpen(false);
      setPreviewHtml(null);
      setPreviewError(null);
      setCurrentPreviewEmailId(null);
  };
  // --- End Preview Handling ---

  // --- Handle Approve All --- 
  const handleApproveAll = () => {
      if (!confirm(`Are you sure you want to approve all ${queuedEmails.length} pending emails?`)) {
          return;
      }
      startApproveAllTransition(async () => {
          setApproveAllMessage("Approving all emails...");
          setUpdateMessage(null); // Clear single update messages
          try {
              const result = await approveAllQueuedEmails();
              setApproveAllMessage(result.message); 
              // No need to manually refetch, Pusher event should trigger update
          } catch (err) { 
              setApproveAllMessage("An unexpected error occurred while approving all emails.");
              console.error("Approve All Error:", err);
          }
      });
  };
  // --- End Handle Approve All ---

  return (
    <div className="mt-6 p-4 border rounded-lg shadow-md w-full flex flex-col gap-4 relative bg-white">
      {/* --- Email Queue Section --- */}
      <div className="w-full">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-2 mb-4 border-b pb-3">
          <h2 className="text-xl font-semibold text-gray-800">Email Approval Queue</h2>
          <div className="flex flex-wrap gap-2">
              <button 
                onClick={handleCheckAndRefresh}
                disabled={isLoading || isUpdating || isChecking || isApprovingAll}
                className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 transition-colors duration-150"
              >
                {isChecking ? (
                     <> <ArrowPathIcon className="animate-spin h-4 w-4 mr-2" /> Checking...</> 
                 ) : (
                     <> <ArrowPathIcon className="h-4 w-4 mr-2" /> Check Sheet</>
                 )}
              </button>
              <button 
                onClick={handleApproveAll}
                disabled={isLoading || isUpdating || isChecking || isApprovingAll || queuedEmails.length === 0}
                className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-60 disabled:bg-green-400 transition-colors duration-150"
              >
                {isApprovingAll ? (
                     <> <ArrowPathIcon className="animate-spin h-4 w-4 mr-2" /> Approving...</> 
                 ) : (
                     <> <CheckCircleIcon className="h-4 w-4 mr-2" /> Approve All ({queuedEmails.length})</>
                 )}
              </button>
          </div>
        </div>

        {/* Messages Area */} 
        <div className="min-h-[20px] mb-3 text-center sm:text-left">
          {approveAllMessage && <p className={`text-sm ${approveAllMessage.includes("Failed") || approveAllMessage.includes("Error") ? 'text-red-600' : 'text-green-600'}`}>{approveAllMessage}</p>}
          {checkMessage && <p className={`text-sm ${checkMessage.includes("Failed") || checkMessage.includes("Error") ? 'text-red-600' : 'text-blue-600'}`}>{checkMessage}</p>}
          {updateMessage && <p className={`text-sm ${updateMessage.includes("Failed") || updateMessage.includes("Error") ? 'text-red-600' : 'text-green-600'}`}>{updateMessage}</p>}
          {error && <p className="text-red-600 text-sm">Error fetching queue: {error}</p>}
        </div>

        {isLoading && <p className="text-center text-gray-500 py-4">Loading email queue...</p>}

        {/* --- Responsive Email Queue Display --- */}
        {!isLoading && !error && queuedEmails.length === 0 && (
          <p className="text-center text-gray-500 py-4">No emails currently pending approval.</p>
        )}
        
        {/* Table for Medium screens and up */} 
        {!isLoading && !error && queuedEmails.length > 0 && (
          <div className="hidden md:block overflow-x-auto border border-gray-200 rounded-md">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100 sticky top-0 z-10"> 
                <tr>
                  <th scope="col" className="sticky left-0 bg-gray-100 px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider z-20">Recipient</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Subject</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Queued At</th>
                  <th scope="col" className="sticky right-0 bg-gray-100 px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider z-20">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {queuedEmails.map((email) => (
                  <tr key={email.id} className="hover:bg-gray-50 transition-colors duration-150">
                    <td className="sticky left-0 bg-white hover:bg-gray-50 px-4 py-3 whitespace-nowrap text-sm z-10">
                        <div className="text-gray-800 font-medium">{email.recipientName || 'N/A'}</div>
                        <div className="text-gray-500 text-xs break-all">{email.recipientEmail}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-normal md:whitespace-nowrap text-sm text-gray-700">{email.subject}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{email.createdAt.toLocaleString()}</td>
                    <td className="sticky right-0 bg-white hover:bg-gray-50 px-4 py-3 whitespace-nowrap text-sm font-medium text-center space-x-2 z-10">
                       <button
                        onClick={() => handlePreview(email.id)}
                        disabled={isUpdating || isChecking || isPreviewing}
                        title="Preview Email"
                        className="inline-flex items-center p-1 text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
                      >
                        <EyeIcon className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleUpdate(email.id, EmailStatus.APPROVED)}
                        disabled={isUpdating || isChecking || isPreviewing}
                        title="Approve Email"
                        className="inline-flex items-center p-1 text-green-600 hover:text-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
                      >
                        <CheckCircleIcon className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleUpdate(email.id, EmailStatus.CANCELED)}
                        disabled={isUpdating || isChecking || isPreviewing}
                        title="Cancel Email"
                        className="inline-flex items-center p-1 text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
                      >
                        <XCircleIcon className="h-5 w-5" />
                      </button>
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
                  <div className="font-medium text-gray-800">{email.recipientName || 'N/A'}</div>
                  <div className="text-gray-500 text-xs">{email.recipientEmail}</div>
                </div>
                <div className="mb-2 whitespace-normal">
                  <span className="font-medium text-gray-700">Subject:</span> {email.subject}
                </div>
                <div className="mb-3 text-xs text-gray-500">
                  <span className="font-medium">Queued:</span> {email.createdAt.toLocaleString()}
                </div>
                <div className="flex justify-end space-x-3 border-t border-gray-100 pt-2">
                   <button
                    onClick={() => handlePreview(email.id)}
                    disabled={isUpdating || isChecking || isPreviewing}
                    title="Preview Email"
                    className="inline-flex items-center p-1 text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
                  >
                    <EyeIcon className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => handleUpdate(email.id, EmailStatus.APPROVED)}
                    disabled={isUpdating || isChecking || isPreviewing}
                    title="Approve Email"
                    className="inline-flex items-center p-1 text-green-600 hover:text-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
                  >
                    <CheckCircleIcon className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => handleUpdate(email.id, EmailStatus.CANCELED)}
                    disabled={isUpdating || isChecking || isPreviewing}
                    title="Cancel Email"
                    className="inline-flex items-center p-1 text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
                  >
                    <XCircleIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- Responsive Sheet Errors Section --- */}
      {sheetErrors.length > 0 && (
        <div className="mt-6 pt-4 border-t border-red-200 w-full bg-red-50 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-red-800 mb-2 flex items-center">
              <ExclamationTriangleIcon className="h-5 w-5 mr-2 text-red-600" /> 
              Sheet Validation Errors ({sheetErrors.length})
          </h3>
          <p className="text-sm text-red-700 mb-3">The following rows in the Google Sheet could not be processed. Please correct them and run the check again.</p>
          
          {/* Table for Medium screens and up */} 
          <div className="hidden md:block overflow-x-auto max-h-60 border border-red-300 rounded-md bg-white shadow-sm">
            <table className="min-w-full divide-y divide-red-200 text-sm">
               <thead className="bg-red-100 sticky top-0 z-10">
                <tr>
                  <th scope="col" className="sticky left-0 bg-red-100 px-3 py-2 text-left font-medium text-red-900 uppercase tracking-wider z-20">Row</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-red-900 uppercase tracking-wider">Name (from Sheet)</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-red-900 uppercase tracking-wider">Reason</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-red-900 uppercase tracking-wider">Raw Row Data</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-red-100">
                {sheetErrors.map((err) => {
                  const nameFromSheet = typeof err.rowData?.[0] === 'string' ? err.rowData[0] : 'N/A';
                  return (
                    <tr key={err.rowIndex} className="hover:bg-red-50 transition-colors duration-150">
                      <td className="sticky left-0 bg-white hover:bg-red-50 px-3 py-2 whitespace-nowrap font-medium text-gray-900 z-10">{err.rowIndex}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-700">{nameFromSheet}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-red-800 font-medium">{err.reason}</td>
                      <td className="px-3 py-2 whitespace-normal text-gray-500 font-mono text-xs break-words">{JSON.stringify(err.rowData)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {/* Cards for Small screens */} 
          <div className="block md:hidden space-y-2 max-h-60 overflow-y-auto border border-red-300 rounded-md p-2 bg-white shadow-sm">
            {sheetErrors.map((err) => {
              const nameFromSheet = typeof err.rowData?.[0] === 'string' ? err.rowData[0] : 'N/A';
              return (
                <div key={err.rowIndex} className="p-2 border-b border-red-200 bg-white rounded shadow-sm text-xs">
                  <div className="mb-1 font-medium">
                    <span className="text-gray-700">Row:</span> <span className="text-gray-900">{err.rowIndex}</span> | <span className="text-gray-700">Name:</span> <span className="text-gray-900">{nameFromSheet}</span>
                  </div>
                  <div className="mb-1">
                    <span className="font-medium text-red-700">Reason:</span> <span className="text-red-800 font-medium">{err.reason}</span>
                  </div>
                  <div className="text-gray-500 font-mono break-all text-[11px] whitespace-normal">
                     <span className="font-medium text-gray-600">Data:</span> {JSON.stringify(err.rowData)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* --- Preview Modal (Improved Styling) --- */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4"
          onClick={closeModal}
        >
          <div 
            className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside modal
          >
            {/* Modal Header */} 
            <div className="flex justify-between items-center border-b border-gray-200 p-4 flex-shrink-0">
              <h3 className="text-xl font-semibold text-gray-800">Email Preview</h3>
              <button 
                onClick={closeModal} 
                className="text-gray-400 hover:text-gray-600 text-3xl leading-none font-light"
                aria-label="Close modal"
              >
                &times;
              </button>
            </div>
            
            {/* Modal Body (Scrollable) */} 
            <div className="p-6 overflow-y-auto flex-grow">
                {isPreviewing && !previewHtml && 
                    <div className="text-center py-10"><ArrowPathIcon className="animate-spin h-6 w-6 text-blue-500 mx-auto" /> Loading preview...</div>
                }
                {previewError && <p className="text-red-600 bg-red-50 p-3 rounded border border-red-200">Error: {previewError}</p>}
                
                {previewHtml && (
                  // Use iframe for better style isolation 
                  <iframe 
                    srcDoc={previewHtml} 
                    className="w-full h-[60vh] border border-gray-300 rounded"
                    title="Email Preview"
                  />
                )} 
            </div>

            {/* Modal Footer */} 
            <div className="border-t border-gray-200 p-4 flex justify-end flex-shrink-0 bg-gray-50 rounded-b-lg">
              <button 
                onClick={closeModal} 
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition-colors duration-150"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* --- End Preview Modal --- */}
    </div>
  );
} 