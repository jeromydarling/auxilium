import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/app/AppShell';
import { api } from '@/lib/api';
import { relativeDays } from '@/lib/utils';
import { useAuth } from '@/app/AuthContext';
import { CommitmentSettings } from '@/features/onboarding/CommitmentSettings';
import { FormEditor } from '@/features/applications/FormEditor';
import { BrandStudio } from '@/features/brand/BrandStudio';

export function SettingsPage() {
  const { user } = useAuth();
  const canAdminister = user?.role === 'owner' || user?.role === 'admin';

  return (
    <>
      <PageHeader title="Settings" description="Ministry, team, and branding." />

      <div className="p-6">
        <Tabs defaultValue="ministry">
          <TabsList>
            <TabsTrigger value="ministry">Ministry</TabsTrigger>
            <TabsTrigger value="brand">Brand</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="application">Application</TabsTrigger>
            <TabsTrigger value="portal">Member portal</TabsTrigger>
            <TabsTrigger value="system">System</TabsTrigger>
          </TabsList>

          <TabsContent value="ministry">
            <MinistrySettings canEdit={canAdminister} />
          </TabsContent>
          <TabsContent value="brand">
            <BrandStudio canEdit={canAdminister} />
          </TabsContent>
          <TabsContent value="team">
            <TeamSettings />
          </TabsContent>
          <TabsContent value="application">
            <FormEditor canEdit={canAdminister} />
          </TabsContent>
          <TabsContent value="portal">
            <PortalSettings />
          </TabsContent>
          <TabsContent value="system">
            <SystemSettings />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function MinistrySettings({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin', 'org'], queryFn: () => api.admin.org() });

  const [name, setName] = useState('');
  const [wordmark, setWordmark] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data?.org) return;
    setName(data.org.name);
    setWordmark(data.org.brand?.wordmark ?? '');
    setSupportEmail(data.org.brand?.supportEmail ?? '');
  }, [data?.org]);

  const save = async () => {
    await api.admin.updateOrg({
      name,
      brand: { ...(data?.org.brand ?? {}), wordmark, supportEmail },
    });
    queryClient.invalidateQueries({ queryKey: ['admin', 'org'] });
    queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-6">
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Ministry details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="org-name">Ministry name</Label>
          <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wordmark">Wordmark</Label>
          <Input
            id="wordmark"
            value={wordmark}
            onChange={(e) => setWordmark(e.target.value)}
            placeholder="Shown in the sidebar instead of “Auxilium”"
            disabled={!canEdit}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="support-email">Support email</Label>
          <Input
            id="support-email"
            type="email"
            value={supportEmail}
            onChange={(e) => setSupportEmail(e.target.value)}
            disabled={!canEdit}
          />
        </div>
        {canEdit && (
          <div className="flex items-center gap-3 pt-1">
            <Button onClick={save}>Save</Button>
            {saved && <span className="text-sm text-muted-foreground">Saved.</span>}
          </div>
        )}
      </CardContent>
    </Card>

    <CommitmentSettings canEdit={canEdit} />
    </div>
  );
}

function TeamSettings() {
  const { data } = useQuery({ queryKey: ['admin', 'users'], queryFn: () => api.admin.users() });

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Last seen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.items.map((member) => (
            <TableRow key={member.id}>
              <TableCell className="font-medium">{member.name}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{member.email}</TableCell>
              <TableCell>
                <Badge variant="muted" className="capitalize">{member.role}</Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {relativeDays(member.last_seen_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * The white-label CMS shell. V1 lists pages and their publish state; the block
 * editor is V2. The schema and the public read endpoint already accept it.
 */
function PortalSettings() {
  const { data } = useQuery({ queryKey: ['cms', 'pages'], queryFn: () => api.cms.pages() });

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Member portal pages</CardTitle>
      </CardHeader>
      <CardContent>
        {(data?.items.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            No portal pages yet. The white-label member portal is a shell in V1 — pages, blocks, and
            draft/publish exist, and the visual builder comes next.
          </p>
        ) : (
          <div className="divide-y">
            {data?.items.map((page) => (
              <div key={page.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-medium">{page.title}</p>
                  <p className="font-mono text-xs text-muted-foreground">/{page.slug}</p>
                </div>
                <Badge variant={page.status === 'published' ? 'secondary' : 'muted'} className="capitalize">
                  {page.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SystemSettings() {
  const { data: health } = useQuery({ queryKey: ['health'], queryFn: () => api.health() });

  return (
    <div className="grid max-w-3xl gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Platform health</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Environment</span>
            <span className="font-mono">{health?.env ?? '—'}</span>
          </div>
          {Object.entries(health?.checks ?? {}).map(([binding, status]) => (
            <div key={binding} className="flex justify-between gap-3">
              <span className="font-mono text-muted-foreground">{binding}</span>
              <span className={status === 'ok' || status === 'bound' ? '' : 'text-onus'}>
                {status}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How NRI works</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Every score in Auxilium is a sum of named, weighted reasons — never a model. The full
            rule set is published, including the exact weight each rule contributes.
          </p>
          <Link
            to="/settings/rules"
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Read the rules <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
