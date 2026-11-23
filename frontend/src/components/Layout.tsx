import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, History, FileCode2, Settings, LogOut, Users, ChevronDown, Plus, Globe, ShieldCheck, Check, Building2, Activity } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { ThemeToggle } from './ui';
import BrandLogo from './BrandLogo';
import toast from 'react-hot-toast';

const navItems = [
  { to: '/dashboard', label: 'Overview', exact: true, icon: LayoutDashboard },
  { to: '/spec', label: 'API catalog', icon: FileCode2 },
  { to: '/history', label: 'Scan history', icon: History },
  { to: '/team', label: 'Team & access', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
];
const routeNames: Record<string, string> = { dashboard: 'Overview', history: 'Scan history', team: 'Team & access', spec: 'API catalog', 'operation-scan': 'Operation scan', settings: 'Settings', scan: 'Scan report' };

export default function Layout({ children }: { children?: React.ReactNode } = {}) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { workspaces, currentWorkspace, setCurrentWorkspace, invitations } = useWorkspace();
  const [openMenu, setOpenMenu] = useState<'workspace' | 'account' | null>(null);
  useEffect(() => setOpenMenu(null), [location.pathname]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpenMenu(null); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  const displayName = user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? user?.email?.split('@')[0] ?? 'Operator';
  const avatarUrl: string | undefined = user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture;
  const initials = displayName.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((part: string) => part[0]?.toUpperCase()).join('');
  const sectionName = routeNames[location.pathname.split('/').filter(Boolean)[0] ?? 'dashboard'] ?? 'Console';
  const close = () => setOpenMenu(null);
  const signOutNow = async () => { close(); await signOut(); toast.success('Signed out.'); };
  const renderWorkspaceMenu = () => (
    <div className="layout-menu" role="menu" aria-label="Switch workspace">
      <p className="layout-menu-label">Your workspaces</p>
      {workspaces.length ? (
        workspaces.map((ws) => (
          <button
            key={ws.id}
            type="button"
            role="menuitemradio"
            aria-checked={ws.id === currentWorkspace?.id}
            onClick={() => {
              setCurrentWorkspace(ws);
              close();
            }}
            className="layout-menu-item"
          >
            <span>{ws.name}</span>
            <span className="layout-menu-meta">
              {ws.role}
              {ws.id === currentWorkspace?.id && <Check size={15} />}
            </span>
          </button>
        ))
      ) : (
        <p className="layout-menu-empty">No workspaces yet</p>
      )}
      <Link to="/team" onClick={close} className="layout-menu-item">
        <span>
          <Plus size={15} /> Manage workspaces
        </span>
        <span />
      </Link>
    </div>
  );

  const renderAccountMenu = () => (
    <div className="layout-menu account-menu" role="menu" aria-label="Account">
      <div className="account-menu-heading">
        <strong>{displayName}</strong>
        <span>{user?.email}</span>
      </div>
      <Link to="/team" role="menuitem" onClick={close} className="layout-menu-item">
        <span>
          <Users size={15} /> Team & workspaces
        </span>
        <span />
      </Link>
      <Link to="/" role="menuitem" onClick={close} className="layout-menu-item">
        <span>
          <Globe size={15} /> Public site
        </span>
        <span />
      </Link>
      <Link to="/settings" role="menuitem" onClick={close} className="layout-menu-item">
        <span>
          <Settings size={15} /> Configuration & health
        </span>
        <span />
      </Link>
      <button type="button" role="menuitem" onClick={signOutNow} className="layout-menu-item layout-signout">
        <span>
          <LogOut size={15} /> Sign out
        </span>
        <span />
      </button>
    </div>
  );
  return <div className="aegis-shell app-layout">
    <a className="skip-link sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50" href="#main-content">Skip to main content</a>
    <aside className="app-sidebar">
      <div className="sidebar-brand"><BrandLogo to="/dashboard" size="md" /><span className="sidebar-version">SECURITY PLATFORM</span></div>
      <button type="button" className="workspace-switch" aria-haspopup="menu" aria-expanded={openMenu === 'workspace'} onClick={() => setOpenMenu(openMenu === 'workspace' ? null : 'workspace')}>
        <span className="workspace-icon"><Building2 size={17} /></span><span className="workspace-copy"><small>WORKSPACE</small><strong>{currentWorkspace?.name ?? 'Personal workspace'}</strong></span><ChevronDown size={16} className={openMenu === 'workspace' ? 'rotate-180' : ''} />
      </button>
      {openMenu === 'workspace' && <><button className="menu-scrim" aria-label="Close workspace menu" onClick={close} />{renderWorkspaceMenu()}</>}
      <div className="sidebar-section-title">YOUR WORKSPACE</div>
      <nav aria-label="Primary" className="sidebar-nav">
        {navItems.map(({ to, label, exact, icon: Icon }) => <NavLink key={to} to={to} end={exact} title={label} className="sidebar-link"><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{to === '/team' && invitations.length > 0 && <span className="nav-count">{invitations.length}</span>}</NavLink>)}
      </nav>
      <div className="sidebar-tools-label">TOOLS</div>
      <nav aria-label="Scan tools" className="sidebar-nav sidebar-tool-nav">
        <NavLink to="/operation-scan" title="Operation scan" className="sidebar-link"><Activity size={18} strokeWidth={1.8} /><span>Operation scan</span></NavLink>
        <NavLink to="/" title="Public API check" className="sidebar-link"><Globe size={18} strokeWidth={1.8} /><span>Public API check</span></NavLink>
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-health"><span className="health-icon"><Activity size={17} /></span><span><strong>All systems operational</strong><small>Security services online</small></span><i /></div>
        <div className="sidebar-user">
          <div className="user-avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : initials || 'OP'}</div>
          <div className="user-copy"><strong>{displayName}</strong><span>{user?.email}</span></div>
          <div className="relative"><button className="user-menu-trigger" aria-label={`Account menu for ${displayName}`} aria-haspopup="menu" aria-expanded={openMenu === 'account'} onClick={() => setOpenMenu(openMenu === 'account' ? null : 'account')}><ChevronDown size={17} /></button>{openMenu === 'account' && <><button className="menu-scrim" aria-label="Close account menu" onClick={close} />{renderAccountMenu()}</>}</div>
        </div>
      </div>
    </aside>
    <div className="app-content">
      <header className="app-topbar"><div className="topbar-title"><span className="topbar-mark"><ShieldCheck size={17} /></span><span>AEGIS</span><span className="topbar-divider">/</span><span className="topbar-section">{sectionName}</span></div><div className="topbar-actions"><span className="service-status"><i /> Services online</span><div className="mobile-workspace-menu"><button type="button" className="mobile-menu-trigger" aria-label="Switch workspace" aria-haspopup="menu" aria-expanded={openMenu === 'workspace'} onClick={() => setOpenMenu(openMenu === 'workspace' ? null : 'workspace')}><Building2 size={17} /></button>{openMenu === 'workspace' && <><button className="menu-scrim" aria-label="Close workspace menu" onClick={close} />{renderWorkspaceMenu()}</>}</div><ThemeToggle /><Link to="/dashboard" className="aegis-signal-action"><Plus size={17} /> New scan</Link><div className="mobile-account-menu"><button type="button" className="mobile-menu-trigger" aria-label={`Account menu for ${displayName}`} aria-haspopup="menu" aria-expanded={openMenu === 'account'} onClick={() => setOpenMenu(openMenu === 'account' ? null : 'account')}>{avatarUrl ? <img src={avatarUrl} alt="" /> : initials || 'OP'}</button>{openMenu === 'account' && <><button className="menu-scrim" aria-label="Close account menu" onClick={close} />{renderAccountMenu()}</>}</div></div></header>
      <main id="main-content" tabIndex={-1} className="aegis-main focus:outline-none">{children ?? <Outlet />}</main>
      <nav aria-label="Primary mobile" className="aegis-bottomnav">{navItems.map(({ to, label, exact, icon: Icon }) => <NavLink key={to} to={to} end={exact} aria-label={label}><Icon size={18} /><span>{label}</span></NavLink>)}</nav>
    </div>
  </div>;
}
