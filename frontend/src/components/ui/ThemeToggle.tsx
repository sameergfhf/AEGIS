import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem('aegis-theme', theme);
  } catch {
    // The visual toggle still works when storage is blocked by browser policy.
  }
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) themeColor.content = theme === 'dark' ? '#080C14' : '#FAF8F5';
  window.dispatchEvent(new CustomEvent<'light' | 'dark'>('aegis-theme-change', { detail: theme }));
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [isDark, setIsDark] = useState(() => document.documentElement.dataset.theme === 'dark');

  useEffect(() => {
    const syncTheme = (event: Event) => {
      const theme = (event as CustomEvent<'light' | 'dark'>).detail;
      setIsDark(theme === 'dark');
    };
    window.addEventListener('aegis-theme-change', syncTheme);
    return () => window.removeEventListener('aegis-theme-change', syncTheme);
  }, []);

  const nextTheme = isDark ? 'light' : 'dark';

  const toggleTheme = () => {
    const nextIsDark = !isDark;
    setIsDark(nextIsDark);
    applyTheme(nextIsDark ? 'dark' : 'light');
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${nextTheme} theme`}
      aria-pressed={isDark}
      title={`Switch to ${nextTheme} mode`}
      className={`group relative inline-flex h-9 w-[68px] cursor-pointer items-center rounded-full border border-line bg-canvas p-1 transition-colors duration-200 hover:border-forest/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)] ${className}`}
    >
      {/* Sliding Active Pill */}
      <span
        className={`absolute top-1 bottom-1 flex w-7 items-center justify-center rounded-full bg-paper shadow-sm transition-transform duration-200 ease-out ${
          isDark ? 'translate-x-[32px] text-cyan-400' : 'translate-x-0 text-amber-500'
        }`}
        aria-hidden="true"
      >
        {isDark ? (
          <Moon className="h-3.5 w-3.5 fill-cyan-400/20" />
        ) : (
          <Sun className="h-3.5 w-3.5 fill-amber-500/20" />
        )}
      </span>

      {/* Static Track Icons for Crisp Context */}
      <div className="flex w-full items-center justify-between px-1.5 text-muted pointer-events-none">
        <Sun
          className={`h-3.5 w-3.5 transition-opacity ${
            !isDark ? 'opacity-0' : 'opacity-70 group-hover:opacity-100'
          }`}
          aria-hidden="true"
        />
        <Moon
          className={`h-3.5 w-3.5 transition-opacity ${
            isDark ? 'opacity-0' : 'opacity-70 group-hover:opacity-100'
          }`}
          aria-hidden="true"
        />
      </div>
    </button>
  );
}
export default ThemeToggle;
