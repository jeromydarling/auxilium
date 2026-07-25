import type { MarketingPage, Block, Cta } from '../../src/content/types';
import { marketingMeta, structuredData, SITE } from '../../src/content/meta';
import { pathFor, guides, comparisons } from '../../src/content/registry';

/**
 * The marketing renderer.
 *
 * Server-rendered HTML with no client JavaScript at all. That is a deliberate
 * choice rather than a limitation: these pages exist to be read by search
 * crawlers and by assistants summarizing this category, and both do
 * dramatically better with real HTML than with a single-page app that paints
 * itself after a bundle loads. It also means the site is fast and readable on
 * a bad connection in a hospital car park, which is not a hypothetical for
 * this audience.
 *
 * Styling is inlined for the same reason — one request, no flash, nothing to
 * block rendering.
 */

/** Escape anything interpolated into HTML. Every value passes through here. */
export function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** JSON-LD needs to survive </script> in content. */
function escJsonLd(json: unknown): string {
  return JSON.stringify(json).replace(/</g, '\\u003c');
}

export function renderPage(page: MarketingPage, origin: string): string {
  const meta = marketingMeta(page, origin);
  const graphs = structuredData(page, origin);

  const metaTags = meta.tags
    .map((t) => `<meta ${t.attr}="${esc(t.key)}" content="${esc(t.value)}">`)
    .join('\n    ');

  const jsonLd = graphs
    .map((g) => `<script type="application/ld+json">${escJsonLd(g)}</script>`)
    .join('\n    ');

  // The guides index renders its list from the registry rather than from
  // hand-written blocks, so a new guide appears without touching this page.
  const body =
    page.slug === 'guides'
      ? page.blocks.map(renderBlock).join('\n') + renderGuideIndex()
      : page.blocks.map(renderBlock).join('\n');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${esc(meta.title)}</title>
    <link rel="canonical" href="${esc(meta.canonical)}">
    ${metaTags}
    ${jsonLd}
    <style>${STYLES}</style>
  </head>
  <body>
    ${renderHeader()}
    <main id="main">
      <h1 class="page-title">${esc(page.h1)}</h1>
      ${body}
      ${renderRelated(page)}
    </main>
    ${renderFooter()}
  </body>
</html>`;
}

// ── Blocks ───────────────────────────────────────────────────────────────────

function renderBlock(block: Block): string {
  switch (block.type) {
    case 'hero':
      return `<section class="hero">
        ${block.kicker ? `<p class="kicker">${esc(block.kicker)}</p>` : ''}
        <p class="hero-sub">${esc(block.subheading)}</p>
        <p class="actions">
          ${block.cta ? renderCta(block.cta, 'primary') : ''}
          ${block.secondaryCta ? renderCta(block.secondaryCta, 'secondary') : ''}
        </p>
      </section>`;

    case 'stat':
      return `<section class="stat">
        <p class="stat-value">${esc(block.value)}</p>
        <p class="stat-label">${esc(block.label)}</p>
        ${block.source ? renderSource(block.source) : ''}
      </section>`;

    case 'statRow':
      return `<section class="stat-row">
        ${block.stats.map((s) => `<div class="stat">
          <p class="stat-value">${esc(s.value)}</p>
          <p class="stat-label">${esc(s.label)}</p>
          ${s.source ? renderSource(s.source) : ''}
        </div>`).join('')}
      </section>`;

    case 'prose':
      return `<section class="prose">
        ${block.heading ? `<h2>${esc(block.heading)}</h2>` : ''}
        ${block.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
      </section>`;

    case 'featureList':
      return `<section class="features">
        <h2>${esc(block.heading)}</h2>
        ${block.intro ? `<p class="intro">${esc(block.intro)}</p>` : ''}
        <div class="feature-grid">
          ${block.features.map((f) => `<article class="feature">
            <h3>${esc(f.title)}</h3>
            <p>${esc(f.body)}</p>
            ${f.prevents ? `<p class="prevents"><span>Pattern this addresses:</span> ${esc(f.prevents)}</p>` : ''}
          </article>`).join('')}
        </div>
      </section>`;

    case 'comparison':
      return `<section class="comparison">
        <h2>${esc(block.heading)}</h2>
        ${block.intro ? `<p class="intro">${esc(block.intro)}</p>` : ''}
        <div class="table-scroll">
          <table>
            <thead>
              <tr><th>Capability</th><th>Auxilium</th><th>Alternative</th><th>Notes</th></tr>
            </thead>
            <tbody>
              ${block.rows.map((r) => `<tr>
                <td>${esc(r.capability)}</td>
                <td class="mark ${r.auxilium}">${MARK[r.auxilium]}</td>
                <td class="mark ${r.alternative}">${MARK[r.alternative]}</td>
                <td class="note">${r.note ? esc(r.note) : ''}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>`;

    case 'faq':
      return `<section class="faq">
        <h2>${esc(block.heading)}</h2>
        ${block.items.map((item) => `<details>
          <summary>${esc(item.question)}</summary>
          <p>${esc(item.answer)}</p>
        </details>`).join('')}
      </section>`;

    case 'callout':
      return `<aside class="callout ${block.tone}">
        ${block.heading ? `<p class="callout-heading">${esc(block.heading)}</p>` : ''}
        <p>${esc(block.body)}</p>
      </aside>`;

    case 'quote':
      return `<figure class="quote">
        <blockquote>${esc(block.body)}</blockquote>
        <figcaption>${esc(block.attribution)}${block.source ? ` — ${renderSource(block.source)}` : ''}</figcaption>
      </figure>`;

    case 'cta':
      return `<section class="cta-block">
        <h2>${esc(block.heading)}</h2>
        ${block.body ? `<p>${esc(block.body)}</p>` : ''}
        <p class="actions">
          ${renderCta(block.cta, 'primary')}
          ${block.secondaryCta ? renderCta(block.secondaryCta, 'secondary') : ''}
        </p>
      </section>`;
  }
}

const MARK = { yes: '✓', partial: '~', no: '✗' } as const;

function renderCta(cta: Cta, variant: 'primary' | 'secondary'): string {
  return `<a class="btn ${variant}" href="${esc(cta.href)}">${esc(cta.label)}</a>`;
}

function renderSource(source: { label: string; url: string }): string {
  return `<a class="source" href="${esc(source.url)}" rel="nofollow noopener" target="_blank">${esc(source.label)}</a>`;
}

function renderGuideIndex(): string {
  const byCategory = new Map<string, typeof allGuides>();
  const allGuides = guides();
  for (const guide of allGuides) {
    const key = guide.category ?? 'General';
    byCategory.set(key, [...(byCategory.get(key) ?? []), guide]);
  }

  const sections = [...byCategory.entries()]
    .map(([category, entries]) => `<section class="prose">
      <h2>${esc(category)}</h2>
      <ul class="link-list">
        ${entries.map((g) => `<li>
          <a href="${esc(pathFor(g.slug))}">${esc(g.h1)}</a>
          <span>${esc(g.description)}</span>
        </li>`).join('')}
      </ul>
    </section>`).join('');

  const comparisonList = `<section class="prose">
    <h2>Comparisons</h2>
    <ul class="link-list">
      ${comparisons().map((c) => `<li>
        <a href="${esc(pathFor(c.slug))}">${esc(c.h1)}</a>
        <span>${esc(c.description)}</span>
      </li>`).join('')}
    </ul>
  </section>`;

  return sections + comparisonList;
}

function renderRelated(page: MarketingPage): string {
  if (!page.related?.length) return '';
  // Resolved lazily so a related slug that stops existing is caught by the
  // link-integrity test rather than rendering a dead link.
  return `<nav class="related">
    <h2>Related</h2>
    <ul>
      ${page.related.map((slug) => `<li><a href="${esc(pathFor(slug))}">${esc(titleize(slug))}</a></li>`).join('')}
    </ul>
  </nav>`;
}

function titleize(slug: string): string {
  const last = slug.split('/').pop() ?? slug;
  const words = last.split('-').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function renderHeader(): string {
  return `<header class="site-header">
    <a class="wordmark" href="/">${esc(SITE.name)}</a>
    <nav>
      <a href="/claims-integrity">Claims integrity</a>
      <a href="/need-response-intelligence">NRI</a>
      <a href="/how-it-works">How it works</a>
      <a href="/guides">Guides</a>
      <a class="btn primary small" href="/app/login">Open the demo</a>
    </nav>
  </header>`;
}

function renderFooter(): string {
  return `<footer class="site-footer">
    <p><strong>${esc(SITE.name)}</strong> — ${esc(SITE.tagline)}</p>
    <nav>
      <a href="/claims-integrity">Claims integrity</a>
      <a href="/need-response-intelligence">Need Response Intelligence</a>
      <a href="/how-it-works">How it works</a>
      <a href="/guides">Guides</a>
      <a href="/llms.txt">llms.txt</a>
    </nav>
    <p class="disclaimer">
      Auxilium is software for health care sharing ministries. It is not insurance, not a health
      plan, and not a compliance certification. Health care sharing ministries are exempt from
      state insurance regulation; no software changes that.
    </p>
  </footer>`;
}

/**
 * Inlined stylesheet.
 *
 * Same sober palette as the application — slate ground, one deep teal. This is
 * software people open on the worst day of a family's year, and the marketing
 * site should not promise a different product than the one they get.
 */
const STYLES = `
:root{--bg:#0d1117;--fg:#e6edf3;--muted:#8b949e;--line:#21262d;--card:#161b22;
--primary:#2aa19a;--primary-fg:#04191c;--warn:#d29922;--bad:#f85149;--good:#3fb950;--radius:8px}
@media(prefers-color-scheme:light){:root{--bg:#fbfcfd;--fg:#1c2128;--muted:#57606a;--line:#d8dee4;
--card:#fff;--primary:#12706b;--primary-fg:#fff}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);
font:16px/1.65 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
-webkit-font-smoothing:antialiased}
a{color:var(--primary)}
main{max-width:820px;margin:0 auto;padding:0 20px 72px}
.site-header{max-width:1100px;margin:0 auto;padding:18px 20px;display:flex;flex-wrap:wrap;gap:12px;
align-items:center;justify-content:space-between;border-bottom:1px solid var(--line)}
.wordmark{font-weight:650;font-size:18px;text-decoration:none;color:var(--fg);letter-spacing:-.01em}
.site-header nav{display:flex;flex-wrap:wrap;gap:18px;align-items:center}
.site-header nav a{color:var(--muted);text-decoration:none;font-size:14px}
.site-header nav a:hover{color:var(--fg)}
.page-title{font-size:clamp(28px,5vw,42px);line-height:1.15;letter-spacing:-.02em;margin:48px 0 18px}
.kicker{text-transform:uppercase;letter-spacing:.09em;font-size:12px;color:var(--muted);margin:0 0 6px}
.hero-sub{font-size:19px;color:var(--muted);margin:0 0 24px;max-width:62ch}
.actions{display:flex;flex-wrap:wrap;gap:10px;margin:22px 0 0}
.btn{display:inline-block;padding:10px 18px;border-radius:var(--radius);text-decoration:none;
font-weight:550;font-size:15px;border:1px solid transparent}
.btn.primary{background:var(--primary);color:var(--primary-fg)}
.btn.secondary{border-color:var(--line);color:var(--fg)}
.btn.small{padding:7px 13px;font-size:14px}
h2{font-size:23px;letter-spacing:-.01em;margin:44px 0 12px;line-height:1.3}
h3{font-size:16px;margin:0 0 7px}
p{margin:0 0 15px;max-width:70ch}
.intro{color:var(--muted);max-width:66ch}
.stat-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin:32px 0}
.stat{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:18px}
.stat-value{font-size:30px;font-weight:640;margin:0;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.stat-label{color:var(--muted);font-size:14px;margin:4px 0 0}
.source{display:inline-block;margin-top:7px;font-size:11px;color:var(--muted)}
.feature-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:14px;margin-top:18px}
.feature{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:18px}
.feature p{font-size:15px;margin-bottom:0}
.prevents{margin-top:11px;padding-top:11px;border-top:1px solid var(--line);
font-size:13px;color:var(--muted)}
.prevents span{color:var(--warn);font-weight:550}
.table-scroll{overflow-x:auto;border:1px solid var(--line);border-radius:var(--radius);margin-top:16px}
table{width:100%;border-collapse:collapse;font-size:14px;min-width:640px}
th,td{text-align:left;padding:10px 13px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:550}
tr:last-child td{border-bottom:0}
.mark{text-align:center;font-weight:650;width:96px}
.mark.yes{color:var(--good)}.mark.partial{color:var(--warn)}.mark.no{color:var(--bad)}
.note{color:var(--muted);font-size:13px}
.callout{border-left:3px solid var(--primary);background:var(--card);padding:16px 18px;
border-radius:0 var(--radius) var(--radius) 0;margin:28px 0}
.callout.caution{border-left-color:var(--warn)}
.callout-heading{font-weight:600;margin:0 0 6px}
.callout p:last-child{margin-bottom:0;color:var(--muted)}
details{border:1px solid var(--line);border-radius:var(--radius);padding:13px 16px;margin-bottom:9px;
background:var(--card)}
summary{cursor:pointer;font-weight:550}
details p{margin:11px 0 0;color:var(--muted)}
.cta-block{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);
padding:26px;margin:46px 0 0;text-align:center}
.cta-block h2{margin-top:0}
.cta-block p{margin-left:auto;margin-right:auto;color:var(--muted)}
.cta-block .actions{justify-content:center}
.link-list{list-style:none;padding:0;margin:0}
.link-list li{padding:13px 0;border-bottom:1px solid var(--line)}
.link-list li:last-child{border-bottom:0}
.link-list a{font-weight:550;text-decoration:none;display:block}
.link-list span{display:block;color:var(--muted);font-size:14px;margin-top:3px}
.related{margin-top:52px;padding-top:22px;border-top:1px solid var(--line)}
.related h2{margin-top:0;font-size:13px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}
.related ul{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:8px}
.related a{display:inline-block;padding:6px 12px;border:1px solid var(--line);
border-radius:99px;text-decoration:none;font-size:14px}
.quote blockquote{margin:0;font-size:18px;font-style:italic}
.quote figcaption{color:var(--muted);font-size:14px;margin-top:8px}
.site-footer{border-top:1px solid var(--line);margin-top:64px;padding:28px 20px 48px;
max-width:1100px;margin-left:auto;margin-right:auto;color:var(--muted);font-size:14px}
.site-footer nav{display:flex;flex-wrap:wrap;gap:16px;margin:10px 0 16px}
.site-footer a{color:var(--muted)}
.disclaimer{font-size:12px;max-width:78ch;line-height:1.6}
`;

/**
 * The public 404.
 *
 * Deliberately a real page rather than the SPA shell: a visitor who mistyped a
 * URL should be told so and handed somewhere useful, and a crawler should get
 * an honest status code.
 */
export function renderNotFound(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Page not found — ${esc(SITE.name)}</title>
    <meta name="robots" content="noindex">
    <style>${STYLES}</style>
  </head>
  <body>
    ${renderHeader()}
    <main id="main">
      <h1 class="page-title">That page does not exist</h1>
      <section class="prose">
        <p>The link may be out of date, or the address may have a typo in it.</p>
      </section>
      <nav class="related">
        <h2>Try one of these</h2>
        <ul>
          <li><a href="/">Home</a></li>
          <li><a href="/claims-integrity">Claims integrity</a></li>
          <li><a href="/need-response-intelligence">Need Response Intelligence</a></li>
          <li><a href="/how-it-works">How it works</a></li>
          <li><a href="/guides">Guides</a></li>
        </ul>
      </nav>
    </main>
    ${renderFooter()}
  </body>
</html>`;
}
