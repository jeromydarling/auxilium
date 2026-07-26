import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { MemberAuthProvider, useMemberAuth } from './MemberAuthContext';
import { PortalShell } from './PortalShell';
import { PortalLoginPage } from '@/routes/portal/PortalLoginPage';
import { PortalAcceptPage } from '@/routes/portal/PortalAcceptPage';
import { PortalClaimsPage } from '@/routes/portal/PortalClaimsPage';
import { PortalClaimDetailPage } from '@/routes/portal/PortalClaimDetailPage';
import { PortalRightsPage } from '@/routes/portal/PortalRightsPage';
import { AppShell } from './AppShell';
import { LoginPage } from '@/routes/LoginPage';
import { DashboardPage } from '@/routes/DashboardPage';
import { MembersPage } from '@/routes/MembersPage';
import { MemberDetailPage } from '@/routes/MemberDetailPage';
import { HouseholdsPage } from '@/routes/HouseholdsPage';
import { HouseholdDetailPage } from '@/routes/HouseholdDetailPage';
import { ImportsPage } from '@/routes/ImportsPage';
import { ImportDetailPage } from '@/routes/ImportDetailPage';
import { NeedsPage } from '@/routes/NeedsPage';
import { PrayerBoardPage } from '@/routes/PrayerBoardPage';
import { CommandCenterPage } from '@/routes/CommandCenterPage';
import { KnowledgePage } from '@/routes/KnowledgePage';
import { KnowledgeArticlePage } from '@/routes/KnowledgeArticlePage';
import { SettingsPage } from '@/routes/SettingsPage';
import { RulesPage } from '@/routes/RulesPage';
import { IntegrityPage } from '@/routes/IntegrityPage';
import { EscalationsPage } from '@/routes/EscalationsPage';

export function App() {
  // Which tree you land in is decided by the path, before either auth provider
  // mounts. A member visiting /portal never has staff auth in scope, and a
  // staff session never has member auth in scope.
  return (
    <Routes>
      <Route
        path="/portal/*"
        element={
          <MemberAuthProvider>
            <PortalRoutes />
          </MemberAuthProvider>
        }
      />
      <Route
        path="*"
        element={
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        }
      />
    </Routes>
  );
}

/**
 * The portal and the staff app are separate route trees, not one tree with
 * conditional nav.
 *
 * `/portal/*` never mounts `AuthProvider` and the staff tree never mounts
 * `MemberAuthProvider`, so there is no component anywhere that can be rendered
 * with the wrong audience's identity in scope. The split is checked at the
 * router rather than inside each page, because a check inside each page is one
 * somebody eventually forgets to write.
 */
function PortalRoutes() {
  const { member, loading } = useMemberAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  // Paths below are relative, not absolute. This is a descendant <Routes>: the
  // parent route already consumed "/portal", so these match against what is
  // left of the path. Writing "/portal/login" here matches nothing and renders
  // a blank page with no error in the console at all, which is exactly how this
  // was found — by opening it, not by reading it.
  return (
    <Routes>
      {/* Both reachable signed out — accepting an invitation is how you get an
          account in the first place. */}
      <Route path="login" element={<PortalLoginPage />} />
      <Route path="accept/:token" element={<PortalAcceptPage />} />

      {member ? (
        <Route element={<PortalShell />}>
          <Route index element={<PortalClaimsPage />} />
          <Route path="claims/:id" element={<PortalClaimDetailPage />} />
          <Route path="rights" element={<PortalRightsPage />} />
          <Route path="knowledge" element={<KnowledgePage />} />
          {/* Slugs carry a slash, so this captures the rest of the path. */}
          <Route path="knowledge/*" element={<KnowledgeArticlePage />} />
          <Route path="*" element={<Navigate to="/portal" replace />} />
        </Route>
      ) : (
        <Route path="*" element={<Navigate to="/portal/login" replace />} />
      )}
    </Routes>
  );
}

function AppRoutes() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading Auxilium…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/members" element={<MembersPage />} />
        <Route path="/members/:id" element={<MemberDetailPage />} />
        <Route path="/households" element={<HouseholdsPage />} />
        <Route path="/households/:id" element={<HouseholdDetailPage />} />
        <Route path="/imports" element={<ImportsPage />} />
        <Route path="/imports/:id" element={<ImportDetailPage />} />
        <Route path="/needs" element={<NeedsPage />} />
        <Route path="/prayer" element={<PrayerBoardPage />} />
        <Route path="/nri" element={<CommandCenterPage />} />
        <Route path="/integrity" element={<IntegrityPage />} />
        <Route path="/escalations" element={<EscalationsPage />} />
        <Route path="/knowledge" element={<KnowledgePage />} />
        {/* Slugs carry a slash — "member/your-rights" — so this captures the
            rest of the path rather than a single segment. */}
        <Route path="/knowledge/*" element={<KnowledgeArticlePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/rules" element={<RulesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
