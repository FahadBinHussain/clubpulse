'use client';

import { useState, useEffect, useTransition } from 'react';
import { getRoleThresholds, upsertRoleThreshold, getUniqueRolesFromSheet } from '@/app/actions';
import { RoleThreshold } from '@prisma/client';

export default function ThresholdManager() {
  const [thresholds, setThresholds] = useState<RoleThreshold[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, startUpdateTransition] = useTransition();
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  
  // State for unique roles from the sheet
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [isLoadingRoles, setIsLoadingRoles] = useState(true);
  const [rolesError, setRolesError] = useState<string | null>(null);

  // Form state
  const [selectedRole, setSelectedRole] = useState('');
  const [thresholdValue, setThresholdValue] = useState('');

  // Fetch thresholds and roles on component mount
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setIsLoadingRoles(true);
      setError(null);
      setRolesError(null);

      try {
        // Fetch thresholds
        const thresholdsResult = await getRoleThresholds();
        if (thresholdsResult.success && thresholdsResult.thresholds) {
          setThresholds(thresholdsResult.thresholds);
        } else {
          setError(thresholdsResult.message || "Failed to fetch thresholds.");
        }

        // Fetch unique roles
        const rolesResult = await getUniqueRolesFromSheet();
        if (rolesResult.success && rolesResult.roles) {
          setAvailableRoles(rolesResult.roles);
          // Pre-select the first role if available and none selected
          if (rolesResult.roles.length > 0 && !selectedRole) {
             // setSelectedRole(rolesResult.roles[0]); // Optional: pre-select first role
          }
        } else {
          setRolesError(rolesResult.message || "Failed to fetch roles from sheet.");
        }

      } catch (err) {
        setError("An unexpected client-side error occurred while fetching data.");
        console.error(err);
      } finally {
        setIsLoading(false);
        setIsLoadingRoles(false);
      }
    };
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // Handle form submission
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const numericThreshold = parseInt(thresholdValue, 10);

    if (!selectedRole) {
        setUpdateMessage("Please select a role.");
        return;
    }
    if (isNaN(numericThreshold) || numericThreshold < 0) {
        setUpdateMessage("Please enter a valid non-negative number for the threshold.");
        return;
    }

    startUpdateTransition(async () => {
      setUpdateMessage("Updating threshold...");
      setError(null);
      try {
        const result = await upsertRoleThreshold(selectedRole, numericThreshold);
        setUpdateMessage(result.message);
        if (result.success && result.threshold) {
          setThresholds(prev => {
             const index = prev.findIndex(t => t.roleName.toLowerCase() === result.threshold!.roleName.toLowerCase());
             if (index > -1) {
                 const updated = [...prev];
                 updated[index] = result.threshold!;
                 return updated;
             } else {
                 return [...prev, result.threshold!].sort((a, b) => a.roleName.localeCompare(b.roleName));
             }
          });
          // Don't clear selectedRole, just the value
          // setSelectedRole(''); 
          setThresholdValue(''); 
        }
      } catch (err) {
        setUpdateMessage("An unexpected client-side error occurred during update.");
        console.error(err);
      }
    });
  };

  return (
    <div className="mt-6 p-4 border rounded-lg shadow-md w-full max-w-lg flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Manage Role Thresholds</h2>

      {/* Display Current Thresholds */}
      <div className="border-t pt-4">
        <h3 className="text-lg font-medium mb-2">Current Thresholds</h3>
        {isLoading && <p>Loading thresholds...</p>}
        {error && <p className="text-red-600">Error: {error}</p>}
        {!isLoading && !error && thresholds.length === 0 && (
          <p className="text-gray-500 text-sm">No role-specific thresholds set. Default (5) applies.</p>
        )}
        {!isLoading && !error && thresholds.length > 0 && (
          <ul className="space-y-1 text-sm list-disc list-inside">
            {thresholds.map(t => (
              <li key={t.id}>
                <span className="font-medium capitalize">{t.roleName}</span>: <span className="text-blue-600 font-semibold">{t.threshold}</span>
              </li>
            ))}
             <li className="text-gray-500 italic">Default (for other roles): {5}</li>
          </ul>
        )}
      </div>

      {/* Add/Update Form */}
      <div className="border-t pt-4">
        <h3 className="text-lg font-medium mb-2">Add / Update Threshold</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="roleSelect" className="block text-sm font-medium text-gray-700">Role Name</label>
            {isLoadingRoles ? (
                <p className="text-sm text-gray-500">Loading roles...</p>
            ) : rolesError ? (
                <p className="text-sm text-red-600">Error loading roles: {rolesError}</p>
            ) : (
                <select 
                    id="roleSelect"
                    name="roleSelect"
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                >
                    <option value="" disabled>-- Select a Role --</option>
                    {availableRoles.map(role => (
                        <option key={role} value={role}>{role}</option>
                    ))}
                </select>
            )}
             <p className="mt-1 text-xs text-gray-500">Select a role from your sheet. Value will be saved in lowercase.</p>
          </div>
          <div>
            <label htmlFor="thresholdValue" className="block text-sm font-medium text-gray-700">New Threshold</label>
            <input 
              type="number"
              id="thresholdValue"
              name="thresholdValue"
              value={thresholdValue}
              onChange={(e) => setThresholdValue(e.target.value)}
              required
              min="0"
              placeholder="e.g., 3 (Default is 5)"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
          <button 
            type="submit"
            disabled={isUpdating || isLoadingRoles || !selectedRole}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {isUpdating ? "Saving..." : "Save Threshold"}
          </button>
          {updateMessage && <p className={`text-sm mt-2 ${updateMessage.includes("Error") || updateMessage.includes("Failed") || updateMessage.includes("Please") ? 'text-red-600' : 'text-green-600'}`}>{updateMessage}</p>}
        </form>
      </div>
    </div>
  );
}