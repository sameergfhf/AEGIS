// src/components/Layout.tsx — App shell with sidebar navigation + user session
import { NavLink, Outlet, Link } from 'react-router-dom';
import {
  Shield,
  LayoutDashboard,
  History,
  FileCode2,
  Settings,
  LogOut,
  User,
  Globe,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/history', icon: History, label: 'Scan History' },
  { to: '/spec', icon: FileCode2, label: 'API Spec' },
  { to: '/settings', icon: Settings, label: 'Settings' },
  { to: '/', icon: Globe, label: 'Landing Page' },
];

export default function Layout({ children }: { children?: React.ReactNode } = {}) {
  const { user, signOut } = useAuth();

  async function handleSignOut() {
    await signOut();
    toast.success('Signed out successfully.');
  }

  // Determine display name from user metadata
  const displayName =
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    user?.email?.split('@')[0] ??
    'Security Analyst';

  const avatarUrl: string | undefined =
    user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture;

  return (
    <div className="flex h-screen bg-[#020617] overflow-hidden text-slate-100 selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* ── Left Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="w-64 flex-shrink-0 flex flex-col border-r border-slate-800/80 bg-slate-950/70 backdrop-blur-2xl z-20">
        {/* Logo & Product Title */}
        <Link
          to="/dashboard"
          className="flex items-center gap-3 px-6 py-5 border-b border-slate-800/70 group hover:bg-slate-900/40 transition-all"
        >
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-md shadow-cyan-500/25 group-hover:shadow-cyan-400/40 transition-all">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-base font-extrabold text-white leading-tight group-hover:text-cyan-300 transition-colors">
                AEGIS
              </span>
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                PRO
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">Observable Defense</p>
          </div>
        </Link>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/dashboard' || to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                  isActive
                    ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm shadow-cyan-500/10'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Sidebar Bottom Controls */}
        <div className="p-4 space-y-3 border-t border-slate-800/70 bg-slate-950/40">
          {/* Active Security Engine Status */}
          <div className="glass-card px-3 py-2 flex items-center justify-between border border-slate-800">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-semibold text-slate-300">Backend Connected</span>
            </div>
            <span className="text-[10px] text-emerald-400 font-mono font-bold">443 / 8000</span>
          </div>

          {/* User profile & signout button */}
          <div className="glass-card px-3 py-2.5 flex items-center gap-2.5 border border-slate-800">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="w-8 h-8 rounded-full object-cover border border-cyan-500/40 shadow-sm shadow-cyan-500/20"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500/30 to-blue-600/30 border border-slate-700 flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-cyan-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate">{displayName}</p>
              {user?.email ? (
                <p className="text-[10px] text-slate-500 truncate font-mono">{user.email}</p>
              ) : (
                <p className="text-[10px] text-cyan-400">Security Analyst</p>
              )}
            </div>
            <button
              id="sidebar-signout-btn"
              onClick={handleSignOut}
              title="Sign out of console"
              className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors flex-shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main Viewport with Ambient Grid Background ────────────────────────── */}
      <main className="flex-1 overflow-auto relative">
        <div className="absolute inset-0 bg-grid-cyber pointer-events-none opacity-30" />
        <div className="relative z-10">
          {children ?? <Outlet />}
        </div>
      </main>
    </div>
  );
}
