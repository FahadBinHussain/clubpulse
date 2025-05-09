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

// --- Props type for Custom Label Renderer ---
interface CustomizedLabelProps {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
  name: string;
  // 'index' and 'value' are passed by recharts but not used here, so commented out or removed
  // index: number; 
  // value: number;
}
// --- End Props type ---

const PIE_COLORS = ['#10B981', '#F59E0B']; // Green for Active, Amber for Below Threshold
const BAR_COLOR = '#3B82F6'; // Blue for activity bars

// --- Custom Label Renderer for Pie Chart ---
const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: CustomizedLabelProps) => {
  const RADIAN = Math.PI / 180;
  // Adjust label position slightly outwards from the center of the slice
  const radius = innerRadius + (outerRadius - innerRadius) * 0.6; 
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  const formattedPercent = `(${(percent * 100).toFixed(0)}%)`;
  const fontSize = 11; // Slightly smaller font size

  if (name === 'Below Threshold') {
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={fontSize}>
        <tspan x={x} dy="-0.6em">Below</tspan>
        <tspan x={x} dy="1.2em">Threshold {formattedPercent}</tspan>
      </text>
    );
  } else {
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={fontSize}>
        {`${name} ${formattedPercent}`}
      </text>
    );
  }
};
// --- End Custom Label Renderer ---

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
    <div className="mt-6 p-4 border dark:border-gray-700 rounded-lg shadow-md w-full flex flex-col lg:flex-row gap-6 justify-around bg-white dark:bg-gray-800">
      
      {/* Status Breakdown Pie Chart */}
      <div className="flex-1 flex flex-col items-center min-w-[300px]">
        <h3 className="text-lg font-semibold mb-2 text-center text-gray-800 dark:text-gray-100">Member Status Breakdown</h3>
        {isLoading && <p className="text-center py-10 text-gray-500 dark:text-gray-400">Loading status chart...</p>}
        {error && <p className="text-red-600 dark:text-red-400 text-center py-10">Error: {error}</p>}
        {!isLoading && !error && !analyticsData && (
          <p className="text-center text-gray-500 dark:text-gray-400 py-10">No status data available.</p>
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
                    label={renderCustomizedLabel}
                  >
                    {pieChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(31, 41, 55, 0.9)', borderColor: '#4b5563'}}
                    itemStyle={{ color: '#d1d5db' }}
                    labelStyle={{ color: '#f9fafb' }}
                  />
                  <Legend wrapperStyle={{ color: '#4b5563' }}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-1">
                Total Members: {analyticsData.totalMembers}
            </p>
          </>
        )}
      </div>

      {/* Activity Distribution Bar Chart */}
      <div className="flex-1 flex flex-col items-center min-w-[300px]">
        <h3 className="text-lg font-semibold mb-2 text-center text-gray-800 dark:text-gray-100">Activity Distribution</h3>
         {isLoading && <p className="text-center py-10 text-gray-500 dark:text-gray-400">Loading distribution chart...</p>}
         {error && <p className="text-red-600 dark:text-red-400 text-center py-10">Error: {error}</p>}
         {!isLoading && !error && (!analyticsData || barChartData.length === 0) && (
           <p className="text-center text-gray-500 dark:text-gray-400 py-10">No distribution data available.</p>
         )}
         {!isLoading && !error && analyticsData && barChartData.length > 0 && (
           <>
             <div style={{ width: '100%', height: 250 }}>
               <ResponsiveContainer>
                 <BarChart data={barChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                   <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" className="dark:stroke-gray-700" />
                   <XAxis dataKey="range" tick={{ fontSize: 12, fill: '#4b5563' }} className="dark:fill-gray-400" />
                   <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#4b5563' }} className="dark:fill-gray-400" />
                   <Tooltip 
                     contentStyle={{ backgroundColor: 'rgba(31, 41, 55, 0.9)', borderColor: '#4b5563'}}
                     itemStyle={{ color: '#d1d5db' }}
                     labelStyle={{ color: '#f9fafb' }}
                   />
                   <Bar dataKey="count" fill={BAR_COLOR} name="Members" />
                 </BarChart>
               </ResponsiveContainer>
             </div>
              <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-1">
                Members by Activity Count Range
              </p>
           </>
         )}
      </div>
    </div>
  );
} 