import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { MemberAuthProvider, useMemberAuth } from './MemberAuthContext';
import { PortalShell } from './PortalShell';
import { AppShell } from './AppShell';
import { LoginPage } from '@/routes/LoginPage';
import { ConfirmProvider } from '@/components/ui/confirm';

/**
 * Code splitting, by **audience** rather than by route.
 *
 * The three groups here want almost nothing in common. A member opening their
 * bill on a phone was downloading the roster importer, the integrity centre, the
 * site builder and the brand studio — a few hundred kilobytes of software they
 * have no permission to reach. Same for a stranger filling in an application.
 *
 * That matters more here than in most products because of who these people are
 * and when they read this: somebody in a hospital car park deciding whether to
 * submit a bill. It is the same argument that keeps the marketing and ministry
 * sites at zero JavaScript, applied to the one surface that genuinely needs some.
 *
 * Split at the audience boundary because that is where the boundary already is:
 * `/portal/*` and the staff tree mount different auth providers and share almost
 * nothing. The knowledge base is the exception — both audiences reach it — and it
 * is lazy too, because Rollup hoists a module used by two chunks into a shared
 * one rather than duplicating it. Eagerly importing it to "avoid duplication"
 * would only guarantee that the stranger filling in an application downloads
 * every staff operations article.
 *
 * These are named exports, hence the `.then` unwrapping. A default export per
 * page would be tidier here and worse everywhere else.
 */
const lazyPage = <T extends Record<string, unknown>>(
  load: () => Promise<T>,
  name: keyof T,
) => lazy(() => load().then((m) => ({ default: m[name] as React.ComponentType })));

// ── The stranger ─────────────────────────────────────────────────────────────
const ApplyPage = lazyPage(() => import('@/routes/ApplyPage'), 'ApplyPage');

// ── Both audiences. Hoisted into a shared chunk, not duplicated. ─────────────
const KnowledgePage = lazyPage(() => import('@/routes/KnowledgePage'), 'KnowledgePage');
const KnowledgeArticlePage = lazyPage(
  () => import('@/routes/KnowledgeArticlePage'),
  'KnowledgeArticlePage',
);

// ── The member ───────────────────────────────────────────────────────────────
const PortalLoginPage = lazyPage(() => import('@/routes/portal/PortalLoginPage'), 'PortalLoginPage');
const PortalAcceptPage = lazyPage(() => import('@/routes/portal/PortalAcceptPage'), 'PortalAcceptPage');
const PortalClaimsPage = lazyPage(() => import('@/routes/portal/PortalClaimsPage'), 'PortalClaimsPage');
const PortalClaimDetailPage = lazyPage(() => import('@/routes/portal/PortalClaimDetailPage'), 'PortalClaimDetailPage');
const PortalRightsPage = lazyPage(() => import('@/routes/portal/PortalRightsPage'), 'PortalRightsPage');
const PortalHealthPage = lazyPage(() => import('@/routes/portal/PortalHealthPage'), 'PortalHealthPage');

// ── Staff ────────────────────────────────────────────────────────────────────
const DashboardPage = lazyPage(() => import('@/routes/DashboardPage'), 'DashboardPage');
const MembersPage = lazyPage(() => import('@/routes/MembersPage'), 'MembersPage');
const MemberDetailPage = lazyPage(() => import('@/routes/MemberDetailPage'), 'MemberDetailPage');
const HouseholdsPage = lazyPage(() => import('@/routes/HouseholdsPage'), 'HouseholdsPage');
const HouseholdDetailPage = lazyPage(() => import('@/routes/HouseholdDetailPage'), 'HouseholdDetailPage');
const ImportsPage = lazyPage(() => import('@/routes/ImportsPage'), 'ImportsPage');
const ImportDetailPage = lazyPage(() => import('@/routes/ImportDetailPage'), 'ImportDetailPage');
const NeedsPage = lazyPage(() => import('@/routes/NeedsPage'), 'NeedsPage');
const PrayerBoardPage = lazyPage(() => import('@/routes/PrayerBoardPage'), 'PrayerBoardPage');
const CommandCenterPage = lazyPage(() => import('@/routes/CommandCenterPage'), 'CommandCenterPage');
const IntegrityPage = lazyPage(() => import('@/routes/IntegrityPage'), 'IntegrityPage');
const EscalationsPage = lazyPage(() => import('@/routes/EscalationsPage'), 'EscalationsPage');
const ApplicationsPage = lazyPage(() => import('@/routes/ApplicationsPage'), 'ApplicationsPage');
const ApplicationDetailPage = lazyPage(() => import('@/routes/ApplicationDetailPage'), 'ApplicationDetailPage');
const SettingsPage = lazyPage(() => import('@/routes/SettingsPage'), 'SettingsPage');
const SiteBuilder = lazyPage(() => import('@/features/cms/SiteBuilder'), 'SiteBuilder');
const RulesPage = lazyPage(() => import('@/routes/RulesPage'), 'RulesPage');

/**
 * What a chunk boundary looks like while it loads.
 *
 * Not a spinner and not blank. On a fast connection this is never seen; on a bad
 * one it is seen for a second or two, and a blank screen at that moment is
 * indistinguishable from the app being broken — which is the impression this
 * audience least needs. The wording matches the auth-loading state above it, so
 * a slow sign-in and a slow chunk read as one wait rather than two.
 */
function PageLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );
}

export function App() {
  // Which tree you land in is decided by the path, before either auth provider
  // mounts. A member visiting /portal never has staff auth in scope, and a
  // staff session never has member auth in scope.
  return (
    <Routes>
      {/* Public: no session, no auth provider. Somebody applying to a ministry
          does not have an account yet, which is the whole point. */}
      <Route
        path="/apply/:slug"
        element={
          <Suspense fallback={<PageLoading />}>
            <ApplyPage />
          </Suspense>
        }
      />
      <Route
        path="/portal/*"
        element={
          <MemberAuthProvider>
            <Suspense fallback={<PageLoading />}>
              <PortalRoutes />
            </Suspense>
          </MemberAuthProvider>
        }
      />
      <Route
        path="*"
        element={
          <AuthProvider>
            <Suspense fallback={<PageLoading />}>
              <AppRoutes />
            </Suspense>
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
          <Route path="health" element={<PortalHealthPage />} />
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

  // ConfirmProvider is mounted here rather than at the root, and that placement
  // is load-bearing for the audience split.
  //
  // It renders a Radix dialog, and mounting it above the router pulled the
  // dialog primitive into the eager shared chunk — 98.7KB to 115KB gzipped,
  // paid by every member opening a bill on a phone and every stranger filling
  // in an application, for a control neither of them can reach. Confirmations
  // are a staff concern; this is the staff tree.
  return (
    <ConfirmProvider>
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
        <Route path="/applications" element={<ApplicationsPage />} />
        <Route path="/applications/:id" element={<ApplicationDetailPage />} />
        <Route path="/knowledge" element={<KnowledgePage />} />
        {/* Slugs carry a slash — "member/your-rights" — so this captures the
            rest of the path rather than a single segment. */}
        <Route path="/knowledge/*" element={<KnowledgeArticlePage />} />
        <Route path="/site" element={<SiteBuilder />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/rules" element={<RulesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </ConfirmProvider>
  );
}
