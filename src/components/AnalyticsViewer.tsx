'use client';

import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getAnalyticsData } from '@/app/actions';

// Define expected data structure from the action
interface AnalyticsStatusData {
  activeCount: number;
  belowThresholdCount: number;
  totalMembers: number;
}

const COLORS = ['#10B981', '#F59E0B']; // Green for Active, Amber for Below Threshold

export default function AnalyticsViewer() {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsStatusData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await getAnalyticsData();
        if (result.success && result.data) {
          setAnalyticsData(result.data);
        } else {
          setError(result.message || "Failed to fetch analytics data.");
        }
      } catch (err) {
        setError("An unexpected client-side error occurred while fetching analytics.");
        console.error("Error fetching analytics data:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const chartData = analyticsData ? [
    { name: 'Active', value: analyticsData.activeCount },
    { name: 'Below Threshold', value: analyticsData.belowThresholdCount },
  ] : [];

  return (
    <div className="mt-6 p-4 border rounded-lg shadow-md w-full max-w-md flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-center">Member Status Breakdown</h2>

      {isLoading && <p className="text-center">Loading analytics...</p>}
      {error && <p className="text-red-600 text-center">Error: {error}</p>}

      {!isLoading && !error && !analyticsData && (
        <p className="text-center text-gray-500">No analytics data available.</p>
      )}

      {!isLoading && !error && analyticsData && (
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
           <p className="text-center text-sm text-gray-600 mt-2">
              Total Members Processed: {analyticsData.totalMembers}
           </p>
        </div>
      )}
    </div>
  );
} 