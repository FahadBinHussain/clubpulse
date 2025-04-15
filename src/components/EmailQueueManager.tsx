'use client';

import { useState, useEffect, useTransition } from 'react';
import { getEmailQueue, updateEmailStatus, checkMemberActivity } from '@/app/actions';
import { EmailStatus } from '@prisma/client';

interface QueuedEmail {
  id: string;
  recipientEmail: string;
  recipientName: string | null;
  subject: string;
  template: string;
  createdAt: Date; 
}

export default function EmailQueueManager() {
  const [queuedEmails, setQueuedEmails] = useState<QueuedEmail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, startUpdateTransition] = useTransition();
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [isChecking, startCheckTransition] = useTransition();
  const [checkMessage, setCheckMessage] = useState<string | null>(null);

  const handleCheckAndRefresh = () => {
    startCheckTransition(async () => {
      setIsLoading(true);
      setError(null);
      setUpdateMessage(null);
      setCheckMessage("Checking sheet & queuing new warnings...");

      try {
        const checkResult = await checkMemberActivity();
        setCheckMessage(checkResult.message);
        if (!checkResult.success) {
            console.warn("checkMemberActivity failed but proceeding to fetch queue:", checkResult.message);
        }
      } catch (err) {
        setCheckMessage("An error occurred during sheet check.");
        console.error("Error calling checkMemberActivity:", err);
      }

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
          setQueuedEmails([]);
        }
      } catch (err) {
        setError("An unexpected error occurred while fetching the queue.");
        console.error(err);
        setQueuedEmails([]);
      }
      
      setIsLoading(false);
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
    <div className="mt-6 p-4 border rounded-lg shadow-md w-full max-w-4xl">
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

      {!isLoading && !error && queuedEmails.length === 0 && (
        <p>No emails currently pending approval.</p>
      )}

      {!isLoading && !error && queuedEmails.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recipient</th>
                <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</th>
                <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Queued At</th>
                <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {queuedEmails.map((email) => (
                <tr key={email.id}>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{email.recipientName} ({email.recipientEmail})</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{email.subject}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">{email.createdAt.toLocaleString()}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm font-medium space-x-2">
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
    </div>
  );
} 