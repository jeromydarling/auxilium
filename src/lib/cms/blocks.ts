/**
 * The ministry site.
 *
 * Not a general website builder. Ministries do not need another Squarespace,
 * and one built here would lose to Squarespace — what they need is the six or
 * seven pages this category actually requires, written well, wired to the
 * product so they cannot go stale, and impossible to get wrong.
 *
 * The design that follows from that:
 *
 * **Templates first, blocks second.** A ministry starts from a page that is
 * already right and rearranges it, rather than from an empty canvas. Given a
 * blank page most ministries produce something worse than the template, and the
 * ones who do not are rare enough that "add a block" covers them.
 *
 * **Some blocks are live.** `share_ratio`, `guidelines`, and `apply` do not
 * hold copy — they render from the product. A ministry that publishes its share
 * ratio on a page it hand-typed will have a wrong number on its website within
 * a quarter, and the wrong number is the one a journalist screenshots. Live
 * blocks cannot drift because there is nothing to drift from.
 *
 * **Nothing here renders.** This module defines the shapes and the defaults.
 * The Worker draws them for the public site and React draws them in the editor,
 * both from these definitions, so the preview and the page cannot disagree.
 *
 * Pure. No database, no clock, no DOM.
 */

export type BlockType =
  | 'hero'
  | 'prose'
  | 'steps'
  | 'faq'
  | 'cta'
  | 'stats'
  /** Live: the ministry's current share ratio, from the ledger. */
  | 'share_ratio'
  /** Live: published guideline versions, with effective dates. */
  | 'guidelines'
  /** Live: a link into the published application form. */
  | 'apply';

/** Blocks whose content comes from the product rather than from an editor. */
export const LIVE_BLOCKS: BlockType[] = ['share_ratio', 'guidelines', 'apply'];

export function isLive(type: BlockType): boolean {
  return LIVE_BLOCKS.includes(type);
}

export interface Block {
  id: string;
  type: BlockType;
  /** Editable copy. Empty for live blocks. */
  heading?: string;
  body?: string;
  /** For `steps` and `faq`. */
  items?: { title: string; body: string }[];
  /** For `stats`. Every figure carries a source — see the note below. */
  stats?: { value: string; label: string; source?: string }[];
  /** For `cta` and `apply`. */
  actionLabel?: string;
  actionHref?: string;
}

export interface SitePage {
  slug: string;
  title: string;
  /** Shown in the site's navigation. Not every page needs to be. */
  nav?: boolean;
  blocks: Block[];
}

// ── Reserved paths ───────────────────────────────────────────────────────────

/**
 * Slugs a ministry cannot have.
 *
 * Ministry sites live at `/{slug}`, on the same origin as the marketing site.
 * That is a deliberate trade — no wildcard DNS, no subdomain to explain, one
 * certificate — but it means the two namespaces share a floor, and a ministry
 * called "Security Health Share" would otherwise shadow `/security`.
 *
 * Checked at signup and at rename rather than only at signup, because a slug
 * that becomes reserved later is exactly the kind of thing that breaks quietly.
 * The marketing slugs are listed rather than imported so this module stays pure
 * and this file is the one place to look when a page is added.
 */
export const RESERVED_SLUGS = new Set([
  // Marketing pages.
  'about', 'claims-integrity', 'compare', 'faq', 'features', 'guides',
  'how-it-works', 'narrative-relational-intelligence', 'pricing', 'security',
  'who-its-for',
  // Application surfaces.
  'app', 'api', 'apply', 'portal', 'admin', 'login', 'signup', 'auth',
  // Files the Worker generates.
  'robots.txt', 'sitemap.xml', 'llms.txt', 'favicon.ico', 'img', 'assets',
  // Kept back so they are available later without breaking somebody's site.
  'blog', 'help', 'support', 'status', 'legal', 'privacy', 'terms', 'docs',
  'settings', 'account', 'billing', 'new', 'static', 'public', 'well-known',
]);

export function slugAvailable(slug: string): { ok: boolean; reason?: string } {
  const clean = slug.trim().toLowerCase();

  if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(clean)) {
    return {
      ok: false,
      reason: 'Use 3 to 50 characters: lowercase letters, numbers, and hyphens between them.',
    };
  }
  if (RESERVED_SLUGS.has(clean)) {
    return { ok: false, reason: `“${clean}” is used by Auxilium itself. Try something else.` };
  }
  // A slug that is only a reserved word plus a hyphen is the kind of near-miss
  // that confuses people reading a link out loud.
  if (clean.startsWith('api-') || clean.startsWith('app-')) {
    return { ok: false, reason: 'Slugs cannot start with “api-” or “app-”.' };
  }
  return { ok: true };
}

// ── Templates ────────────────────────────────────────────────────────────────

let counter = 0;
/** Deterministic within a build, unique within a page. Ids are not meaningful. */
function blockId(type: string): string {
  counter += 1;
  return `${type}_${counter}`;
}

/**
 * The pages this category actually needs.
 *
 * Chosen from what ministries are asked and answer badly. "What is and is not
 * shared" exists because vagueness there is the single biggest source of the
 * decline nobody saw coming, and a ministry that writes it down plainly has
 * already done more than most.
 */
export function defaultSite(ministryName: string): SitePage[] {
  counter = 0;
  return [
    {
      slug: 'home',
      title: 'Home',
      nav: false,
      blocks: [
        {
          id: blockId('hero'),
          type: 'hero',
          heading: `Sharing one another's medical costs`,
          body:
            `${ministryName} is a community of households who help carry each other's medical ` +
            'bills. This is not insurance, and that difference is worth understanding before you ' +
            'join rather than after.',
          // No button here on purpose. The apply block directly beneath resolves
          // a live one that points at the ministry's real form; a second button
          // with a hand-typed destination is how a site ends up with a dead
          // "Apply" link nobody notices.
        },
        { id: blockId('apply'), type: 'apply' },
        {
          id: blockId('steps'),
          type: 'steps',
          heading: 'How it works',
          items: [
            { title: 'You contribute monthly', body: 'A set amount each month, shared with households who have medical needs.' },
            { title: 'You submit a bill', body: 'When you have a medical cost, you send it in and it gets a due date immediately.' },
            { title: 'A person reviews it', body: 'Not an algorithm. You can see which stage it is at and whether anyone has opened it.' },
            { title: 'It is shared, or it is not', body: 'Either way you are told why, with the guideline provision behind the decision.' },
          ],
        },
        { id: blockId('share_ratio'), type: 'share_ratio' },
      ],
    },
    {
      slug: 'what-is-shared',
      title: 'What is and is not shared',
      nav: true,
      blocks: [
        {
          id: blockId('prose'),
          type: 'prose',
          heading: 'Be specific here',
          body:
            'This is the page that prevents the worst thing that happens in this category: ' +
            'somebody contributes for years, has a procedure, and only then discovers it will not ' +
            'be shared. Write plainly what is shared, what is not, and what has a waiting period. ' +
            'Vagueness here is not kindness.',
        },
        { id: blockId('guidelines'), type: 'guidelines' },
      ],
    },
    {
      slug: 'membership',
      title: 'Joining',
      nav: true,
      blocks: [
        {
          id: blockId('prose'),
          type: 'prose',
          heading: 'What we ask of members',
          body:
            'Describe what membership involves — what you expect of members, what they can expect ' +
            'of you, and anything that would disqualify somebody. People would rather find that ' +
            'out now than at their first need.',
        },
        { id: blockId('apply'), type: 'apply' },
      ],
    },
    {
      slug: 'faq',
      title: 'Questions',
      nav: true,
      blocks: [
        {
          id: blockId('faq'),
          type: 'faq',
          heading: 'Common questions',
          items: [
            {
              title: 'Is this insurance?',
              body:
                'No. Sharing is voluntary and is not guaranteed, and you remain personally ' +
                'responsible for your own medical bills. That is the honest answer and every ' +
                'ministry has to give it.',
            },
            {
              title: 'What happens if a bill is not shared?',
              body:
                'You are told why, with the guideline provision behind it, and you can appeal. ' +
                'Appeals succeed more often than people expect and are attempted far less often ' +
                'than they should be.',
            },
            {
              title: 'How long does a decision take?',
              body:
                'Replace this with your own committed turnaround. Members ask this more than ' +
                'anything else, and a specific number is worth more than a reassuring sentence.',
            },
          ],
        },
      ],
    },
  ];
}

/** A block a ministry adds from scratch, with placeholder copy worth replacing. */
export function newBlock(type: BlockType): Block {
  const id = blockId(type);
  switch (type) {
    case 'hero':
      return { id, type, heading: 'A short, plain headline', body: 'One or two sentences underneath.' };
    case 'steps':
      return {
        id, type, heading: 'How it works',
        items: [{ title: 'First', body: 'What happens.' }, { title: 'Then', body: 'What happens next.' }],
      };
    case 'faq':
      return { id, type, heading: 'Questions', items: [{ title: 'A question', body: 'The answer.' }] };
    case 'stats':
      return { id, type, heading: 'By the numbers', stats: [{ value: '—', label: 'Describe what this counts' }] };
    case 'cta':
      return { id, type, heading: 'Ready to join?', actionLabel: 'Apply', actionHref: '' };
    default:
      // Live blocks carry no copy. Giving them placeholder text would invite a
      // ministry to edit something that is about to be overwritten by the
      // product.
      return { id, type };
  }
}

// ── Live blocks ──────────────────────────────────────────────────────────────

/**
 * What the product knows that a live block might render.
 *
 * Assembled by the Worker from the ledger, the guideline table, and the
 * application form. Every field is optional because every one of them is
 * genuinely absent on a ministry's first day, and what a block does when its
 * data is missing is the interesting half of the design.
 */
export interface SiteContext {
  ministryName: string;
  /** Share ratio in basis points, and the window it covers. */
  shareRatio?: { bps: number; periodLabel: string };
  guidelines?: { version: string; effective_from: string; provisionCount: number; url?: string }[];
  /**
   * Which version binds a member, as the ministry has declared it. Ministries
   * publish at least four different answers and all four are in real use, so
   * the sentence on the public page has to be read from the declaration rather
   * than assumed — a site that tells members the wrong one is worse than a site
   * that says nothing, because they will act on it.
   */
  governingRule?: 'member_join' | 'date_of_service' | 'date_submitted' | 'date_received';
  /** Present only when the ministry has published its application form. */
  applyHref?: string;
}

/**
 * How each governing rule reads to a member.
 *
 * Written from the member's side — "the one in force when you joined", not
 * "the enrolment rule" — because the person reading this is trying to work out
 * which document their own bill will be judged against.
 */
const GOVERNING_SENTENCE: Record<NonNullable<SiteContext['governingRule']>, string> = {
  member_join: 'The one that applies to you is the version in force on the day you joined.',
  date_of_service:
    'The one that applies is the version in force on the date you received the care ' +
    '— not the version in force when you joined.',
  date_submitted: 'The one that applies is the version in force when you send the bill in.',
  date_received: 'The one that applies is the version in force when we receive your bills.',
};

export interface ResolvedBlock extends Block {
  /** Set on live blocks. The editor shows it; the renderer draws it. */
  live?: { heading: string; body?: string; items?: { title: string; body: string }[] };
}

/**
 * A live block with no data behind it is dropped, not rendered empty.
 *
 * The alternative — a "Share ratio" heading over a dash, or a "Guidelines"
 * panel with nothing under it — reads to a visitor as a ministry that has
 * something to hide, which is the exact opposite of why the block exists. A
 * ministry that has not published its guidelines yet is better served by a page
 * that does not mention them than by a page that mentions them and shows none.
 *
 * The editor uses the same function, so what a ministry sees in the preview is
 * a block that will not appear — with an explanation — rather than a surprise
 * after publishing.
 */
export function resolveBlock(block: Block, ctx: SiteContext): ResolvedBlock | null {
  switch (block.type) {
    case 'share_ratio': {
      if (!ctx.shareRatio) return null;
      const pct = (ctx.shareRatio.bps / 100).toFixed(1);
      return {
        ...block,
        live: {
          heading: 'Where the money went',
          body:
            `Of every dollar members contributed in ${ctx.shareRatio.periodLabel}, ` +
            `${pct}% reached members' medical costs. ` +
            'The ACA holds insurers to 80%. Sharing ministries are not held to it — ' +
            'we publish against it anyway, because a number nobody can check is not a number.',
        },
      };
    }

    case 'guidelines': {
      if (!ctx.guidelines?.length) return null;
      return {
        ...block,
        live: {
          heading: 'Our sharing guidelines',
          body:
            'These are the documents a decision about your bill is made against. ' +
            (ctx.governingRule ? GOVERNING_SENTENCE[ctx.governingRule] : ''),
          items: ctx.guidelines.map((g) => ({
            title: `Version ${g.version}`,
            body:
              `In force from ${g.effective_from}. ${g.provisionCount} provisions.` +
              (g.url ? ` Read it at ${g.url}` : ''),
          })),
        },
      };
    }

    case 'apply': {
      if (!ctx.applyHref) return null;
      return {
        ...block,
        actionLabel: block.actionLabel?.trim() || `Apply to ${ctx.ministryName}`,
        actionHref: ctx.applyHref,
        live: {
          heading: 'Apply to join',
          body: 'A person reads every application. You will hear back either way.',
        },
      };
    }

    default:
      return block;
  }
}

export function resolveSite(page: SitePage, ctx: SiteContext): ResolvedBlock[] {
  return page.blocks
    .map((b) => resolveBlock(b, ctx))
    .filter((b): b is ResolvedBlock => b !== null);
}

/** Menu entries, in the order a ministry set. Never includes the home page. */
export function siteNav(pages: SitePage[]): { slug: string; title: string }[] {
  return pages
    .filter((p) => p.nav && p.slug !== 'home')
    .map((p) => ({ slug: p.slug, title: p.title }));
}

export interface SiteIssue {
  path: string;
  message: string;
}

/**
 * Why a live block has nothing to show, in terms of the thing to go and do.
 * "No data" is not actionable; "record contributions and disbursements" is.
 */
const LIVE_GAPS: Record<string, string> = {
  share_ratio:
    'This will not appear: there is nothing in the ledger yet, so there is no share ratio ' +
    'to publish. Record a month of contributions and disbursements first.',
  guidelines:
    'This will not appear: no sharing guidelines have been published, so there is nothing ' +
    'for it to list.',
  apply:
    'This will not appear: the application form has not been published, so there is nowhere ' +
    'for the button to go.',
};

/**
 * What is wrong with a site before it is published.
 *
 * Warnings, not blocks — a ministry is entitled to publish a page we think is
 * thin. The one thing worth being firm about is an unsourced statistic: a
 * number on a public page with nothing behind it is exactly what this product
 * spends the rest of its time arguing against.
 *
 * Pass `ctx` to also learn which live blocks have no data behind them and will
 * therefore not appear. That is not a mistake in the page — it is a gap in the
 * ministry's setup — so it is reported here rather than left to be discovered
 * by looking at the published site and wondering where the section went.
 */
export function reviewSite(pages: SitePage[], ctx?: SiteContext): SiteIssue[] {
  const issues: SiteIssue[] = [];
  const seen = new Set<string>();

  if (pages.length > 0 && !pages.some((p) => p.slug === 'home')) {
    issues.push({
      path: 'home',
      message: 'There is no home page, so the site address will not answer with anything.',
    });
  }

  for (const page of pages) {
    if (seen.has(page.slug)) {
      issues.push({ path: page.slug, message: 'Two pages share this address.' });
    }
    seen.add(page.slug);

    if (page.blocks.length === 0) {
      issues.push({ path: page.slug, message: 'This page has nothing on it.' });
    }

    for (const block of page.blocks) {
      if (block.type === 'stats') {
        for (const stat of block.stats ?? []) {
          if (!stat.source?.trim()) {
            issues.push({
              path: `${page.slug}.${block.id}`,
              message:
                `“${stat.value} ${stat.label}” has no source. A figure on a public page that ` +
                'nobody can check is the thing this product exists to argue against.',
            });
          }
        }
      }

      if (
        !isLive(block.type) && !block.heading?.trim() && !block.body?.trim() &&
        !block.items?.length && !block.stats?.length && !block.actionLabel?.trim()
      ) {
        issues.push({ path: `${page.slug}.${block.id}`, message: 'This block is empty.' });
      }

      if (ctx && isLive(block.type) && resolveBlock(block, ctx) === null) {
        issues.push({ path: `${page.slug}.${block.id}`, message: LIVE_GAPS[block.type] });
      }
    }
  }

  return issues;
}
