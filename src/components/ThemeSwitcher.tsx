'use client'

import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { useSession } from 'next-auth/react'
import { updateUserTheme } from '@/app/actions'
import { useTransition } from 'react'

// Define available themes (match these with your Tailwind setup if using CSS variables)
const themes = [
  { value: 'system', label: 'System', icon: '💻' },
  { value: 'light', label: 'Light', icon: '☀️' },
  { value: 'dark', label: 'Dark', icon: '🌙' },
  // Add custom themes here - these names need corresponding styles in globals.css or components
  { value: 'zinc', label: 'Zinc', icon: '🔩' }, 
  { value: 'rose', label: 'Rose', icon: '🌹' },
  { value: 'blue', label: 'Blue', icon: '💧' }, 
]

export function ThemeSwitcher() {
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme } = useTheme()
  const [isSaving, startSaveTransition] = useTransition()
  const { status } = useSession()

  // Log initial/updated theme values
  useEffect(() => {
    console.log('[ThemeSwitcher] Theme state:', theme);
  }, [theme]);

  // Effect ensures component is mounted before rendering UI to avoid hydration mismatch
  useEffect(() => setMounted(true), [])

  const handleThemeChange = (newTheme: string) => {
    console.log(`[ThemeSwitcher] handleThemeChange called. Current theme: ${theme}, New theme requested: ${newTheme}`);
    setTheme(newTheme); // Update theme via next-themes
    console.log(`[ThemeSwitcher] setTheme('${newTheme}') called.`);

    // If user is logged in, save preference to DB
    if (status === 'authenticated') {
      startSaveTransition(async () => {
        try {
          const result = await updateUserTheme(newTheme);
          if (!result.success) {
            console.warn("Failed to save theme preference:", result.message);
            // Optionally show a small error message to the user
          }
        } catch (error) {
          console.error("Error calling updateUserTheme:", error);
        }
      });
    }
  };

  if (!mounted) {
    // Render a placeholder or null on the server/before mount
    return <div className="w-8 h-8"></div>; // Placeholder to prevent layout shift
  }

  return (
    <div className="relative inline-block text-left">
      {/* Simple button showing current theme icon */}
      {/* More sophisticated dropdown could be used here */}
      <div className="flex items-center gap-1">
          {themes.map((t) => (
            <button
              key={t.value}
              onClick={() => handleThemeChange(t.value)}
              title={`Set theme to ${t.label}`}
              disabled={isSaving}
              className={`p-1.5 rounded-md text-sm transition-colors duration-150 
                ${theme === t.value 
                   ? 'bg-gray-200 dark:bg-gray-700 ring-2 ring-indigo-500' 
                   : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
                }
                ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
                {t.icon}
            </button>
          ))}
      </div>
    </div>
  )
} 