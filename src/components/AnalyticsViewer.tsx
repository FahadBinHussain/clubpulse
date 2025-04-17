'use client';

import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { getAnalyticsData } from '@/app/actions';

// Define expected data structure from the action
interface AnalyticsStatusData {
  activeCount: number;
  belowThresholdCount: number;
  totalMembers: number;
  activityDistribution?: { range: string; count: number }[];
}

const PIE_COLORS = ['#10B981', '#F59E0B']; // Green for Active, Amber for Below Threshold
const BAR_COLOR = '#3B82F6'; // Blue for activity bars

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

  const pieChartData = analyticsData ? [
    { name: 'Active', value: analyticsData.activeCount },
    { name: 'Below Threshold', value: analyticsData.belowThresholdCount },
  ] : [];

  const barChartData = analyticsData?.activityDistribution || [];

  return (
    <div className="mt-6 p-4 border rounded-lg shadow-md w-full max-w-4xl flex flex-col lg:flex-row gap-6 justify-around">
      
      {/* Status Breakdown Pie Chart */}
      <div className="flex-1 flex flex-col items-center min-w-[300px]">
        <h3 className="text-lg font-semibold mb-2 text-center">Member Status Breakdown</h3>
        {isLoading && <p className="text-center py-10">Loading status chart...</p>}
        {error && <p className="text-red-600 text-center py-10">Error: {error}</p>}
        {!isLoading && !error && !analyticsData && (
          <p className="text-center text-gray-500 py-10">No status data available.</p>
        )}
        {!isLoading && !error && analyticsData && (
          <>
            <div style={{ width: '100%', height: 250 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={pieChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {pieChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <p className="text-center text-sm text-gray-600 mt-1">
                Total Members: {analyticsData.totalMembers}
            </p>
          </>
        )}
      </div>

      {/* Activity Distribution Bar Chart */}
      <div className="flex-1 flex flex-col items-center min-w-[300px]">
        <h3 className="text-lg font-semibold mb-2 text-center">Activity Distribution</h3>
         {isLoading && <p className="text-center py-10">Loading distribution chart...</p>}
         {error && <p className="text-red-600 text-center py-10">Error: {error}</p>}
         {!isLoading && !error && (!analyticsData || barChartData.length === 0) && (
           <p className="text-center text-gray-500 py-10">No distribution data available.</p>
         )}
         {!isLoading && !error && analyticsData && barChartData.length > 0 && (
           <>
             <div style={{ width: '100%', height: 250 }}>
               <ResponsiveContainer>
                 <BarChart data={barChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                   <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                   <XAxis dataKey="range" tick={{ fontSize: 12 }} />
                   <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                   <Tooltip />
                   <Bar dataKey="count" fill={BAR_COLOR} name="Members" />
                 </BarChart>
               </ResponsiveContainer>
             </div>
              <p className="text-center text-sm text-gray-600 mt-1">
                Members by Activity Count Range
              </p>
           </>
         )}
      </div>
    </div>
  );
} 