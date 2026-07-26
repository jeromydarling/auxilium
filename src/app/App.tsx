import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
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
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
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
