// src/components/Layout.tsx — App shell with sidebar navigation

import { NavLink, Outlet } from 'react-router-dom';
import { Shield, LayoutDashboard, History, FileCode2, Settings, Activity } from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/history', icon: History, label: 'Scan History' },
  { to: '/spec', icon: FileCode2, label: 'API Spec' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Layout() {
  return (
    <div className="flex h-screen bg-[#020617] overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 flex flex-col border-r border-slate-800/60 bg-slate-900/50 backdrop-blur-xl">
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-800/60">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-tight">API Sentinel</h1>
            <p className="text-xs text-slate-400">Security Scanner</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Status indicator */}
        <div className="px-4 pb-4">
          <div className="glass-card px-3 py-2 flex items-center gap-2">
            <Activity className="w-3 h-3 text-green-400" />
            <span className="text-xs text-slate-400">Backend connected</span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
