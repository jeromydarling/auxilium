import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Home, Upload, HeartHandshake, HandHeart,
  Compass, Settings, LogOut, ShieldCheck, Scale, Siren, BookOpen, Inbox, Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from './AuthContext';
import { ErrorBoundary } from './ErrorBoundary';
import { CompassLauncher } from '@/features/nri/CompassDrawer';
import { ReportButton } from '@/features/feedback/ReportPanel';

/**
 * The application shell.
 *
 * A fixed left rail and a content column — the layout an operations tool
 * should have. Navigation is grouped by what a staff member is doing, not by
 * data model: the daily work first, the intelligence layer next, the
 * administration last.
 */

const NAV_GROUPS: { label: string; items: { to: string; label: string; icon: typeof Users }[] }[] = [
  {
    label: 'Daily work',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/needs', label: 'Sharing needs', icon: HeartHandshake },
      { to: '/prayer', label: 'Prayer board', icon: HandHeart },
      { to: '/escalations', label: 'Escalations', icon: Siren },
    ],
  },
  {
    label: 'People',
    items: [
      { to: '/applications', label: 'Applications', icon: Inbox },
      { to: '/members', label: 'Members', icon: Users },
      { to: '/households', label: 'Households', icon: Home },
      { to: '/imports', label: 'Imports', icon: Upload },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { to: '/nri', label: 'Command center', icon: Compass },
      { to: '/integrity', label: 'Claims integrity', icon: Scale },
      { to: '/knowledge', label: 'Knowledge', icon: BookOpen },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/site', label: 'Your site', icon: Globe },
      { to: '/settings', label: 'Settings', icon: Settings },
      { to: '/settings/rules', label: 'NRI rules', icon: ShieldCheck },
    ],
  },
];

export function AppShell() {
  const { user, org, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen">
      <nav className="hidden w-60 shrink-0 flex-col border-r bg-card md:flex">
        <div className="border-b p-4">
          <p className="text-lg font-semibold tracking-tight">
            {org?.brand?.wordmark || 'Auxilium'}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {org?.name ?? 'Health sharing ministry'}
          </p>
          {org?.kind === 'demo' && (
            <span className="mt-2 inline-block rounded border border-onus/40 bg-onus/10 px-1.5 py-0.5 text-xs font-medium text-onus">
              Demo data
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-4">
              <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/' || item.to === '/settings'}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
                          isActive
                            ? 'bg-primary/10 font-medium text-primary'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                        )
                      }
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t p-3">
          {/* Above the identity block rather than buried in Settings. The moment
              somebody is willing to report something is the moment it happened;
              by the time they have navigated somewhere to do it, they have
              talked themselves out of it and lost the detail. */}
          <ReportButton />
          <p className="mt-1.5 truncate px-2 text-sm font-medium">{user?.name}</p>
          <p className="truncate px-2 text-xs capitalize text-muted-foreground">{user?.role}</p>
          <Button variant="ghost" size="sm" className="mt-1.5 w-full justify-start" onClick={handleSignOut}>
            <LogOut /> Sign out
          </Button>
        </div>
      </nav>

      {/* A second boundary, inside the shell.
          The root one in main.tsx catches everything, but it replaces the whole
          screen — including the navigation. One broken page then looks like a
          broken product, and the way out is a link the person can no longer
          see. Keyed on the path so walking to another page clears it, which is
          the ordinary way somebody recovers. */}
      <main className="min-w-0 flex-1">
        <ErrorBoundary key={pathname} area={`staff:${pathname}`}>
          <Outlet />
        </ErrorBoundary>
      </main>

      <CompassLauncher />
    </div>
  );
}

/** Consistent page header. Every route uses it, so the app never feels stitched. */
export function PageHeader({
  title, description, actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="border-b bg-card px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}
