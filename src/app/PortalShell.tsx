import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BookOpen, FileText, HeartPulse, LogOut, ShieldQuestion } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useMemberAuth } from './MemberAuthContext';

/**
 * The member portal shell.
 *
 * Four destinations, and no more. A member is not an operator of this
 * software: they are here because something is happening to a medical bill and
 * they want to know what. Every additional navigation item is one more thing
 * between a frightened person and the answer.
 *
 * "Your rights" is a first-class destination rather than a page buried in the
 * knowledge base, and that is the most deliberate decision in this file. The
 * single most valuable thing a member can learn — that appealing works about
 * half the time and almost nobody does it — is worthless if it is three clicks
 * deep behind a search box they have to know what to type into.
 */
const NAV = [
  { to: '/portal', label: 'Your bills', icon: FileText, end: true },
  { to: '/portal/health', label: 'Your health', icon: HeartPulse, end: false },
  { to: '/portal/rights', label: 'Your rights', icon: ShieldQuestion, end: false },
  { to: '/portal/knowledge', label: 'Answers', icon: BookOpen, end: false },
];

export function PortalShell() {
  const { member, org, signOut } = useMemberAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{org?.name ?? 'Member portal'}</p>
            <p className="truncate text-xs text-muted-foreground">{member?.name}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await signOut();
              navigate('/portal/login', { replace: true });
            }}
          >
            <LogOut className="mr-1.5 h-4 w-4" /> Sign out
          </Button>
        </div>

        {/* Horizontal rather than a sidebar: most members open this on a phone,
            usually while holding the bill. */}
        <nav className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-2 pb-2">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )
              }
            >
              <Icon className="h-4 w-4" /> {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-4xl px-4 pb-10 pt-4">
        {/* Not fine print. A member who believes this is insurance will make
            worse decisions than one who knows it is not, and the difference
            shows up on the day a need is declined. */}
        <p className="text-xs leading-relaxed text-muted-foreground">
          Health care sharing is not insurance. Whether a need is shared is decided under your
          ministry&rsquo;s published guidelines, and you remain personally responsible for your own
          medical bills. Nothing here is a decision about a particular need, and nothing here is
          legal advice.
        </p>
      </footer>
    </div>
  );
}
