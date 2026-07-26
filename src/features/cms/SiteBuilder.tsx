import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowDown, ArrowUp, ExternalLink, Eye, Globe, Plus, Trash2, Zap,
} from 'lucide-react';
import { api, type SiteView } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/app/AppShell';
import { newBlock, isLive, type Block, type BlockType, type SitePage } from '@/lib/cms/blocks';
import { brandCss } from '@/lib/brand/tokens';
import { DomainSettings } from './DomainSettings';

/**
 * The site builder.
 *
 * Three things shape this screen, all of them reactions to how block editors
 * usually go wrong.
 *
 * **You start from a site, not from a canvas.** "Create your first page" is
 * where most ministries stop. The template is four pages that are already
 * right, and the job becomes editing sentences rather than inventing a website.
 *
 * **The preview is the published page.** It is rendered from the same
 * `resolved` blocks the Worker renders, under the same brand tokens. Not a
 * likeness — the same data through the same pipeline, so there is nothing for a
 * preview to be wrong about.
 *
 * **Live blocks look different and cannot be typed into.** A ministry seeing
 * "this comes from your ledger" next to a greyed-out box learns the model in
 * one glance, and never wastes an afternoon editing text that is about to be
 * overwritten.
 */

const ADDABLE: { type: BlockType; label: string; note: string }[] = [
  { type: 'prose', label: 'Words', note: 'A heading and some paragraphs.' },
  { type: 'steps', label: 'Steps', note: 'A numbered sequence. Good for “how it works”.' },
  { type: 'faq', label: 'Questions', note: 'Question and answer pairs.' },
  { type: 'stats', label: 'Figures', note: 'Numbers you type. Each one needs a source.' },
  { type: 'cta', label: 'Button', note: 'A heading and one link.' },
  { type: 'hero', label: 'Opening', note: 'The large block at the top of a page.' },
  { type: 'share_ratio', label: 'Share ratio', note: 'Live, from your ledger.' },
  { type: 'guidelines', label: 'Guidelines', note: 'Live, from your published versions.' },
  { type: 'apply', label: 'Apply', note: 'Live, links to your application form.' },
];

export function SiteBuilder() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['cms', 'site'], queryFn: () => api.cms.site() });

  const [active, setActive] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pages = useMemo(() => data?.pages ?? [], [data?.pages]);
  const page = pages.find((p) => p.slug === active) ?? pages[0];

  useEffect(() => {
    if (!active && pages.length) setActive(pages[0].slug);
  }, [active, pages]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['cms', 'site'] });

  async function guarded(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!data || pages.length === 0) {
    return (
      <>
        <PageHeader title="Your site" description="A public site for your ministry." />
        {/* Written to the same shape as EmptyState — what goes here, why it is
            worth having, and the one thing to do next — but with a button
            rather than a link, because starting a site is an action. */}
        <div className="p-6">
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Globe className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
            <p className="font-medium">You do not have a site yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              A public site for your ministry: what you are, what is and is not shared, and how
              somebody joins.
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              The things people most want to know before joining — what is shared, what is not, and
              how long a decision takes — are exactly what most ministry sites leave vague. The
              template is four pages that already say them, so the job is editing sentences rather
              than inventing a website.
            </p>
            <Button className="mt-4" disabled={busy} onClick={() => guarded(() => api.cms.initSite())}>
              Start from the template
            </Button>
          </div>
          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Your site"
        description={data.published_at ? `Live at ${data.public_url}` : 'Not published yet.'}
        actions={
          <div className="flex items-center gap-2">
            {data.published_at && (
              <Button variant="outline" size="sm" asChild>
                <a href={data.public_url} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-1.5 h-4 w-4" /> View
                </a>
              </Button>
            )}
            <Button
              size="sm"
              variant={data.published_at ? 'outline' : 'default'}
              disabled={busy}
              onClick={() => guarded(() => api.cms.publishSite(!data.published_at))}
            >
              {data.published_at ? 'Unpublish' : 'Publish site'}
            </Button>
          </div>
        }
      />

      <div className="space-y-6 p-6">
        {error && <p className="text-sm text-destructive">{error}</p>}

        <ReviewPanel issues={data.issues} />

        <div className="grid gap-6 lg:grid-cols-[16rem_1fr_22rem]">
          <PageList
            site={data}
            active={page?.slug ?? null}
            busy={busy}
            onSelect={setActive}
            onAct={guarded}
          />

          {page ? (
            <PageEditor key={page.slug} site={data} page={page} busy={busy} onAct={guarded} />
          ) : (
            <div />
          )}

          {page && <Preview site={data} page={page} />}
        </div>
      </div>
    </>
  );
}

// ── The review ───────────────────────────────────────────────────────────────

function ReviewPanel({ issues }: { issues: SiteView['issues'] }) {
  if (issues.length === 0) return null;
  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          {issues.length} thing{issues.length === 1 ? '' : 's'} worth looking at
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {issues.map((issue) => (
            <li key={`${issue.path}-${issue.message}`}>
              <span className="font-mono text-xs text-muted-foreground">{issue.path}</span>{' '}
              {issue.message}
            </li>
          ))}
        </ul>
        {/* Warnings, not gates. A ministry is entitled to publish a page we
            think is thin, and a builder that refuses to publish teaches people
            to work around it rather than to read it. */}
        <p className="mt-3 text-xs text-muted-foreground">
          None of these stop you publishing.
        </p>
      </CardContent>
    </Card>
  );
}

// ── Pages ────────────────────────────────────────────────────────────────────

function PageList({
  site, active, busy, onSelect, onAct,
}: {
  site: SiteView;
  active: string | null;
  busy: boolean;
  onSelect: (slug: string) => void;
  onAct: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [adding, setAdding] = useState('');

  function move(index: number, delta: number) {
    const ids = site.pages.map((p) => p.id).filter((id): id is string => Boolean(id));
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    onAct(() => api.cms.reorder(ids));
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {site.pages.map((page, i) => (
          <div
            key={page.slug}
            className={`flex items-center gap-1 rounded-md border px-2 py-1.5 text-sm ${
              page.slug === active ? 'border-primary bg-primary/5' : 'border-transparent'
            }`}
          >
            <button className="flex-1 truncate text-left" onClick={() => onSelect(page.slug)}>
              {page.title}
              {page.status !== 'published' && (
                <Badge variant="outline" className="ml-2 text-[10px]">draft</Badge>
              )}
            </button>
            <Button
              variant="ghost" size="icon" className="h-6 w-6" disabled={busy || i === 0}
              aria-label={`Move ${page.title} up`} onClick={() => move(i, -1)}
            >
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost" size="icon" className="h-6 w-6"
              disabled={busy || i === site.pages.length - 1}
              aria-label={`Move ${page.title} down`} onClick={() => move(i, 1)}
            >
              <ArrowDown className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!adding.trim()) return;
          onAct(() => api.cms.createPage({ title: adding.trim(), nav: true }));
          setAdding('');
        }}
      >
        <Input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          placeholder="New page title"
          aria-label="New page title"
          className="h-8 text-sm"
        />
        <Button type="submit" size="icon" variant="outline" className="h-8 w-8" disabled={busy}>
          <Plus className="h-4 w-4" />
        </Button>
      </form>

      <Address site={site} onAct={onAct} busy={busy} />
      <DomainSettings />
    </div>
  );
}

/**
 * The public address.
 *
 * Shown here rather than buried in settings because it is part of the site, and
 * because the moment a ministry sees `/{their-slug}` they understand what they
 * are building. Changing it is warned about rather than prevented — it is their
 * address — but the warning is specific, because "this may break links" is
 * ignorable and "anyone who has your old link will get a 404" is not.
 */
function Address({
  site, onAct, busy,
}: {
  site: SiteView;
  onAct: (fn: () => Promise<unknown>) => Promise<void>;
  busy: boolean;
}) {
  const [slug, setSlug] = useState(site.org.slug);
  const [check, setCheck] = useState<{ ok: boolean; reason?: string } | null>(null);

  useEffect(() => {
    if (slug === site.org.slug) return setCheck(null);
    const t = setTimeout(() => {
      api.cms.checkSlug(slug).then(setCheck).catch(() => setCheck(null));
    }, 350);
    return () => clearTimeout(t);
  }, [slug, site.org.slug]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Address</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-1 text-sm">
          <span className="text-muted-foreground">/</span>
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            aria-label="Site address"
            className="h-8 text-sm"
          />
        </div>
        {check && !check.ok && <p className="text-xs text-destructive">{check.reason}</p>}
        {slug !== site.org.slug && check?.ok && (
          <>
            <p className="text-xs text-muted-foreground">
              Anyone holding a link to <span className="font-mono">/{site.org.slug}</span> will get
              a “page not found” after this. Nothing forwards.
            </p>
            <Button
              size="sm" variant="outline" disabled={busy}
              onClick={() => onAct(() => api.cms.setSlug(slug))}
            >
              Move the site
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Blocks ───────────────────────────────────────────────────────────────────

function PageEditor({
  site, page, busy, onAct,
}: {
  site: SiteView;
  page: SiteView['pages'][number];
  busy: boolean;
  onAct: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [draft, setDraft] = useState<SitePage>({ ...page });
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify({ ...page }), [draft, page]);

  useEffect(() => setDraft({ ...page }), [page]);

  const update = (patch: Partial<SitePage>) => setDraft({ ...draft, ...patch });
  const setBlock = (i: number, block: Block) =>
    update({ blocks: draft.blocks.map((b, j) => (j === i ? block : b)) });

  function save() {
    if (!page.id) return;
    onAct(() =>
      api.cms.updatePage(page.id!, {
        title: draft.title,
        blocks: draft.blocks,
        nav: draft.nav,
        // Editing a published page republishes it. The alternative — edits
        // sitting invisibly as drafts on a live site — is how a ministry ends
        // up believing it has corrected something it has not.
        status: page.status,
      }),
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="page-title">Page title</Label>
              <Input
                id="page-title"
                value={draft.title}
                onChange={(e) => update({ title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="page-slug">Address</Label>
              <Input id="page-slug" value={`/${site.org.slug}/${draft.slug}`} readOnly disabled />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(draft.nav)}
              disabled={draft.slug === 'home'}
              onChange={(e) => update({ nav: e.target.checked })}
            />
            Show in the menu
            {draft.slug === 'home' && (
              <span className="text-xs text-muted-foreground">
                — the home page is reached from your name in the header
              </span>
            )}
          </label>
        </CardContent>
      </Card>

      {draft.blocks.map((block, i) => (
        <BlockEditor
          key={block.id}
          block={block}
          context={site.context}
          onChange={(b) => setBlock(i, b)}
          onMove={(delta) => {
            const next = [...draft.blocks];
            const target = i + delta;
            if (target < 0 || target >= next.length) return;
            [next[i], next[target]] = [next[target], next[i]];
            update({ blocks: next });
          }}
          onRemove={() => update({ blocks: draft.blocks.filter((_, j) => j !== i) })}
        />
      ))}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Add a block</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {ADDABLE.map((option) => (
            <Button
              key={option.type}
              size="sm"
              variant="outline"
              title={option.note}
              onClick={() => update({ blocks: [...draft.blocks, newBlock(option.type)] })}
            >
              {isLive(option.type) && <Zap className="mr-1.5 h-3 w-3" />}
              {option.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button disabled={!dirty || busy} onClick={save}>
          {dirty ? 'Save changes' : 'Saved'}
        </Button>
        {page.id && draft.slug !== 'home' && (
          <Button
            variant="ghost"
            className="text-destructive"
            disabled={busy}
            onClick={() => onAct(() => api.cms.deletePage(page.id!))}
          >
            <Trash2 className="mr-1.5 h-4 w-4" /> Delete this page
          </Button>
        )}
      </div>
    </div>
  );
}

function BlockEditor({
  block, context, onChange, onMove, onRemove,
}: {
  block: Block;
  context: SiteView['context'];
  onChange: (block: Block) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const live = isLive(block.type);

  return (
    <Card className={live ? 'border-dashed bg-muted/30' : undefined}>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm capitalize">
          {live && <Zap className="h-3.5 w-3.5 text-primary" />}
          {block.type.replace('_', ' ')}
        </CardTitle>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Move up" onClick={() => onMove(-1)}>
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Move down" onClick={() => onMove(1)}>
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Remove block" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {live ? (
          <LiveBlockNote type={block.type} context={context} />
        ) : (
          <>
            <Input
              value={block.heading ?? ''}
              placeholder="Heading"
              onChange={(e) => onChange({ ...block, heading: e.target.value })}
            />
            {block.type !== 'steps' && block.type !== 'faq' && block.type !== 'stats' && (
              <Textarea
                rows={4}
                value={block.body ?? ''}
                placeholder="Body. Leave a blank line between paragraphs."
                onChange={(e) => onChange({ ...block, body: e.target.value })}
              />
            )}
            {(block.type === 'steps' || block.type === 'faq') && (
              <ItemsEditor block={block} onChange={onChange} />
            )}
            {block.type === 'stats' && <StatsEditor block={block} onChange={onChange} />}
            {(block.type === 'cta' || block.type === 'hero') && (
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={block.actionLabel ?? ''}
                  placeholder="Button text"
                  onChange={(e) => onChange({ ...block, actionLabel: e.target.value })}
                />
                <Input
                  value={block.actionHref ?? ''}
                  placeholder="Where it goes"
                  onChange={(e) => onChange({ ...block, actionHref: e.target.value })}
                />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * What a live block will show, or why it will not appear.
 *
 * Both matter. Showing the current value tells a ministry the wiring works;
 * naming the gap turns "my share ratio is missing" into "record a month of
 * ledger" without a support conversation.
 */
function LiveBlockNote({ type, context }: { type: BlockType; context: SiteView['context'] }) {
  const state: Record<string, { on: boolean; text: string }> = {
    share_ratio: {
      on: Boolean(context.shareRatio),
      text: context.shareRatio
        ? `Currently ${(context.shareRatio.bps / 100).toFixed(1)}%, over ${context.shareRatio.periodLabel}.`
        : 'Nothing in your ledger yet, so this block will not appear. Record a month of contributions and disbursements.',
    },
    guidelines: {
      on: Boolean(context.guidelines?.length),
      text: context.guidelines?.length
        ? `${context.guidelines.length} version${context.guidelines.length === 1 ? '' : 's'}, newest first.`
        : 'You have not published any sharing guidelines, so this block will not appear.',
    },
    apply: {
      on: Boolean(context.applyHref),
      text: context.applyHref
        ? `Links to your application form at ${context.applyHref}.`
        : 'Your application form is not published, so this block will not appear.',
    },
  };

  const s = state[type];
  if (!s) return null;

  return (
    <div className="space-y-1 text-sm">
      <p className={s.on ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-500'}>
        {s.text}
      </p>
      {s.on && (
        <p className="text-xs text-muted-foreground">
          This updates itself. There is nothing here to type, which is the point — a number you
          hand-type is wrong within a quarter.
        </p>
      )}
    </div>
  );
}

function ItemsEditor({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  const items = block.items ?? [];
  const set = (i: number, patch: Partial<{ title: string; body: string }>) =>
    onChange({ ...block, items: items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="space-y-2 rounded-md border p-3">
          <div className="flex gap-2">
            <Input
              value={item.title}
              placeholder={block.type === 'faq' ? 'Question' : 'Step'}
              onChange={(e) => set(i, { title: e.target.value })}
            />
            <Button
              variant="ghost" size="icon" aria-label={`Remove item ${i + 1}`}
              onClick={() => onChange({ ...block, items: items.filter((_, j) => j !== i) })}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <Textarea
            rows={2}
            value={item.body}
            placeholder={block.type === 'faq' ? 'Answer' : 'What happens'}
            onChange={(e) => set(i, { body: e.target.value })}
          />
        </div>
      ))}
      <Button
        size="sm" variant="outline"
        onClick={() => onChange({ ...block, items: [...items, { title: '', body: '' }] })}
      >
        <Plus className="mr-1.5 h-4 w-4" /> Add
      </Button>
    </div>
  );
}

function StatsEditor({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  const stats = block.stats ?? [];
  const set = (i: number, patch: Partial<{ value: string; label: string; source: string }>) =>
    onChange({ ...block, stats: stats.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  return (
    <div className="space-y-3">
      {stats.map((stat, i) => (
        <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[8rem_1fr_auto]">
          <Input value={stat.value} placeholder="94%" onChange={(e) => set(i, { value: e.target.value })} />
          <Input value={stat.label} placeholder="of needs shared" onChange={(e) => set(i, { label: e.target.value })} />
          <Button
            variant="ghost" size="icon" aria-label={`Remove figure ${i + 1}`}
            onClick={() => onChange({ ...block, stats: stats.filter((_, j) => j !== i) })}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Input
            className="sm:col-span-3"
            value={stat.source ?? ''}
            placeholder="Where this number comes from — required"
            onChange={(e) => set(i, { source: e.target.value })}
          />
        </div>
      ))}
      <Button
        size="sm" variant="outline"
        onClick={() => onChange({ ...block, stats: [...stats, { value: '', label: '', source: '' }] })}
      >
        <Plus className="mr-1.5 h-4 w-4" /> Add a figure
      </Button>
    </div>
  );
}

// ── Preview ──────────────────────────────────────────────────────────────────

/**
 * The preview.
 *
 * Renders `page.resolved` — the blocks the server produced by running the same
 * `resolveSite` the public renderer runs — inside a scope carrying the same
 * brand tokens. It is not a separate implementation of the site; it is the same
 * data through the same resolution, drawn once more.
 *
 * That means a live block with no data behind it is *absent here too*, which is
 * the single most useful thing this panel does: a ministry sees the gap while
 * it can still be fixed rather than after publishing.
 */
function Preview({ site, page }: { site: SiteView; page: SiteView['pages'][number] }) {
  const css = useMemo(() => brandCss(site.brand, '.site-preview'), [site.brand]);

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Eye className="h-3.5 w-3.5" /> What a visitor sees
      </p>
      <style>{css}</style>
      <div
        className="site-preview overflow-hidden rounded-lg border text-sm"
        style={{
          background: 'var(--brand-surface)',
          color: 'var(--brand-on-surface)',
          fontFamily: 'var(--brand-font)',
        }}
      >
        <div
          className="flex items-center gap-2 border-b px-4 py-3 font-semibold"
          style={{ borderColor: 'var(--brand-border)' }}
        >
          <span
            className="grid h-6 w-6 place-items-center text-xs"
            style={{
              background: 'var(--brand-primary)',
              color: 'var(--brand-on-primary)',
              borderRadius: 'var(--brand-radius)',
            }}
          >
            {site.org.name[0]?.toUpperCase()}
          </span>
          {site.org.name}
        </div>

        <div className="space-y-5 p-4">
          {page.resolved.length === 0 && (
            <p style={{ color: 'var(--brand-muted)' }}>
              Nothing on this page will appear to a visitor.
            </p>
          )}
          {page.resolved.map((block, i) => {
            const heading = block.live?.heading ?? block.heading;
            const body = block.live?.body ?? block.body;
            const items = block.live?.items ?? block.items;
            return (
              <div key={block.id} className="space-y-1.5">
                {heading && (
                  <p className={i === 0 ? 'text-lg font-semibold' : 'font-semibold'}>{heading}</p>
                )}
                {body && <p style={{ color: 'var(--brand-muted)' }}>{body}</p>}
                {items?.map((item, j) => (
                  <div key={j} className="pl-3" style={{ borderLeft: '2px solid var(--brand-border)' }}>
                    <p className="font-medium">{item.title}</p>
                    <p style={{ color: 'var(--brand-muted)' }}>{item.body}</p>
                  </div>
                ))}
                {block.stats?.map((stat, j) => (
                  <p key={j}>
                    <span className="text-xl font-bold" style={{ color: 'var(--brand-primary)' }}>
                      {stat.value}
                    </span>{' '}
                    {stat.label}
                  </p>
                ))}
                {/* Both halves, because the renderer requires both. Drawing a
                    button here for a label with no destination would make the
                    preview promise something the published page does not
                    show — the one thing this panel exists not to do. */}
                {block.actionLabel && block.actionHref && (
                  <span
                    className="inline-block px-3 py-1.5 text-xs font-semibold"
                    style={{
                      background: 'var(--brand-primary)',
                      color: 'var(--brand-on-primary)',
                      borderRadius: 'var(--brand-radius)',
                    }}
                  >
                    {block.actionLabel}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Live blocks with nothing behind them are missing here too — that is what a visitor would
        get.
      </p>
    </div>
  );
}
