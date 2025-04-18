'use client';

import React from 'react';
// Import icons later if needed (e.g., for each nav item)

// Define the possible views/sections
type AdminView = 'queue' | 'thresholds' | 'warnings' | 'adminLogs' | 'analytics' | 'dashboard'; // Added 'dashboard' for overview

interface SidebarProps {
  activeView: AdminView;
  setActiveView: (view: AdminView) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeView, setActiveView }) => {

  const navItems = [
    { id: 'dashboard', label: 'Dashboard Overview' }, // Optional overview page
    { id: 'queue', label: 'Email Queue' },
    { id: 'thresholds', label: 'Thresholds' },
    { id: 'warnings', label: 'Warning Logs' },
    { id: 'adminLogs', label: 'Admin Logs' },
    { id: 'analytics', label: 'Analytics' },
  ];

  return (
    <aside className="w-64 bg-gray-800 text-white p-4 flex-shrink-0 hidden md:flex md:flex-col overflow-y-auto">
      <h2 className="text-lg font-semibold mb-6 border-b border-gray-700 pb-2">Navigation</h2>
      <nav className="flex-grow">
        <ul className="space-y-2">
          {navItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => setActiveView(item.id as AdminView)}
                className={`w-full flex items-center px-3 py-2 text-sm rounded-md transition-colors duration-150 
                  ${activeView === item.id 
                    ? 'bg-gray-700 text-white font-medium' 
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  }`}
              >
                {/* Add icon placeholder later */}
                <span className="ml-2">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {/* Optional: Add footer or user info at the bottom of sidebar */}
      <div className="mt-auto pt-4 border-t border-gray-700">
         <p className="text-xs text-gray-500 text-center">ClubPulse v0.1</p> 
      </div>
    </aside>
  );
};

export default Sidebar;
export type { AdminView }; // Export the type 