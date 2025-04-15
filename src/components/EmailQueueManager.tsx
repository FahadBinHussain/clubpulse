'use client';

import { useState, useEffect, useTransition } from 'react';
import { getEmailQueue, updateEmailStatus } from '@/app/actions';
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

  // Function to fetch queued emails
  const fetchQueue = async () => {
    setIsLoading(true);
    setError(null);
    setUpdateMessage(null); // Clear previous update messages
    try {
      const result = await getEmailQueue();
      if (result.success && result.emails) {
        // Convert createdAt string back to Date object if needed (Prisma might return strings)
        const emailsWithDate = result.emails.map(email => ({...
          email,
          createdAt: new Date(email.createdAt)
        }));
        setQueuedEmails(emailsWithDate);
      } else {
        setError(result.message || "Failed to fetch email queue.");
        setQueuedEmails([]); // Clear queue on error
      }
    } catch (err) {
      setError("An unexpected error occurred while fetching the queue.");
      console.error(err);
      setQueuedEmails([]);
    }
    setIsLoading(false);
  };

  // Fetch emails on component mount
  useEffect(() => {
    fetchQueue();
  }, []);

  // Function to handle status update
  const handleUpdate = (emailId: string, status: EmailStatus) => {
    startUpdateTransition(async () => {
        setUpdateMessage(`Updating email ${emailId} to ${status}...`);
        try {
            const result = await updateEmailStatus(emailId, status);
            setUpdateMessage(result.message); 
            if(result.success) {
                // Refresh the queue after successful update
                // Option 1: Refetch the whole list (simple)
                // fetchQueue(); 
                
                // Option 2: Remove the updated email from the current state (more responsive)
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
      <h2 className="text-xl font-semibold mb-4">Email Approval Queue</h2>

      {isLoading && <p>Loading email queue...</p>}
      {error && <p className="text-red-600">Error: {error}</p>}
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
                      disabled={isUpdating}
                      className="text-green-600 hover:text-green-900 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleUpdate(email.id, EmailStatus.CANCELED)}
                      disabled={isUpdating}
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