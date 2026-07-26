import type { MarketingPage, Block, Cta, Photo } from '../../src/content/types';
import { marketingMeta, structuredData, SITE } from '../../src/content/meta';
import { pathFor, guides, comparisons } from '../../src/content/registry';
import { FEATURES, FEATURE_CATEGORIES, shippedCount } from '../../src/content/features';
import { esc } from './esc';
import { TOKENS, MOTION, logoMark, logoLockup, faviconDataUri } from './brand';
import { LAYOUT, COMPONENTS, MOCKUPS, FEATURES_INDEX } from './styles';
import { browserFrame, triageBoard, nriCompass, integrityCard, importPreview, claimsTracker } from './mockups';

/**
 * The marketing renderer.
 *
 * Server-rendered HTML. The pages exist to be read by search crawlers and by
 * assistants summarizing this category, and both do dramatically better with
 * real markup than with an app that paints itself after a bundle loads. It also
 * means the site is fast on a bad connection in a hospital car park, which for
 * this audience is not hypothetical.
 *
 * **On the script tag.** This used to ship literally zero JavaScript. It now
 * ships roughly a kilobyte, inline, for two things HTML cannot do: a mobile
 * navigation drawer with correct focus and escape handling, and scroll-reveal
 * animation. The rule that replaced "no JavaScript" is stricter and more
 * useful: *the page is complete without it*. Reveal animations are armed by a
 * class the script adds to <html>, so with the script blocked, failed, or not
 * yet parsed, every element renders exactly as authored — visible. The mobile
 * drawer degrades to a link to the sitemap-ish footer. Nothing is hydrated,
 * nothing is fetched, and no content exists only in JavaScript.
 */

export { esc };

/** JSON-LD needs to survive </script> in content. */
function escJsonLd(json: unknown): string {
  return JSON.stringify(json).replace(/</g, '\\u003c');
}

const STYLES = TOKENS + MOTION + LAYOUT + COMPONENTS + MOCKUPS + FEATURES_INDEX;

export function renderPage(page: MarketingPage, origin: string): string {
  const meta = marketingMeta(page, origin);
  const graphs = structuredData(page, origin);

  const metaTags = meta.tags
    .map((t) => `<meta ${t.attr}="${esc(t.key)}" content="${esc(t.value)}">`)
    .join('\n    ');

  const jsonLd = graphs
    .map((g) => `<script type="application/ld+json">${escJsonLd(g)}</script>`)
    .join('\n    ');

  // The first block is a hero on most pages; it renders its own title, so the
  // generic page title is suppressed to avoid two competing h1-scale headings.
  const leadsWithHero = page.blocks[0]?.type === 'hero';

  const body =
    page.slug === 'guides'
      ? page.blocks.map((b) => renderBlock(b, page)).join('\n') + renderGuideIndex()
      : page.blocks.map((b) => renderBlock(b, page)).join('\n');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${esc(meta.title)}</title>
    <link rel="canonical" href="${esc(meta.canonical)}">
    <link rel="icon" href="${faviconDataUri()}">
    <meta name="theme-color" content="#0b0f14" media="(prefers-color-scheme: dark)">
    <meta name="theme-color" content="#fcfdfe" media="(prefers-color-scheme: light)">
    ${metaTags}
    ${jsonLd}
    <style>${STYLES}</style>
  </head>
  <body>
    <a class="skip" href="#main">Skip to content</a>
    ${renderHeader()}
    ${renderDrawer()}
    <main id="main">
      ${leadsWithHero ? '' : `<div class="wrap band"><h1 class="page-title reveal">${esc(page.h1)}</h1></div>`}
      ${body}
      ${renderRelated(page)}
    </main>
    ${renderFooter()}
    <script>${SCRIPT}</script>
  </body>
</html>`;
}

// ── Blocks ───────────────────────────────────────────────────────────────────

function renderBlock(block: Block, page: MarketingPage): string {
  switch (block.type) {
    case 'hero':
      return renderHero(block, page);

    case 'split': {
      const visual = block.mockup
        ? mockupFor(block.mockup)
        : block.photo
          ? renderPhoto(block.photo, 'split-photo')
          : '';
      return `<section class="band">
        <div class="wrap split ${block.flip ? 'flip' : ''}">
          <div class="split-copy reveal">
            ${block.eyebrow ? `<p class="eyebrow">${esc(block.eyebrow)}</p>` : ''}
            <h2>${esc(block.heading)}</h2>
            ${block.paragraphs.map((p) => `<p class="intro">${esc(p)}</p>`).join('')}
            ${
              block.bullets?.length
                ? `<ul class="ticks">${block.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`
                : ''
            }
            ${block.cta ? `<p class="actions">${renderCta(block.cta, 'secondary')}</p>` : ''}
          </div>
          <div class="split-visual reveal reveal-2">${visual}</div>
        </div>
      </section>`;
    }

    case 'mockup':
      return `<section class="band">
        <div class="wrap">
          ${block.heading ? `<h2 class="reveal center">${esc(block.heading)}</h2>` : ''}
          <div class="reveal reveal-1">${mockupFor(block.kind)}</div>
          ${block.caption ? `<p class="mk-caption reveal reveal-2">${esc(block.caption)}</p>` : ''}
        </div>
      </section>`;

    case 'photo':
      return `<section class="band"><div class="wrap reveal">${renderPhoto(block.photo, 'wide-photo')}</div></section>`;

    case 'steps':
      return `<section class="band band-tint">
        <div class="wrap">
          <h2 class="reveal">${esc(block.heading)}</h2>
          ${block.intro ? `<p class="intro reveal">${esc(block.intro)}</p>` : ''}
          <ol class="steps">
            ${block.steps.map((s, i) => `<li class="step reveal reveal-${Math.min(i + 1, 5)}">
              <span class="step-n">${i + 1}</span>
              <h3>${esc(s.title)}</h3>
              <p>${esc(s.body)}</p>
            </li>`).join('')}
          </ol>
        </div>
      </section>`;

    case 'featureIndex':
      return renderFeatureIndex();

    case 'pricing':
      return `<section class="band">
        <div class="wrap">
          <h2 class="reveal">${esc(block.heading)}</h2>
          ${block.intro ? `<p class="intro reveal">${esc(block.intro)}</p>` : ''}
          <div class="tiers">
            ${block.tiers.map((t, i) => `<article class="tier ${t.featured ? 'featured' : ''} reveal reveal-${Math.min(i + 1, 5)}">
              ${t.featured && t.flag ? `<span class="tier-flag">${esc(t.flag)}</span>` : ''}
              <h3>${esc(t.name)}</h3>
              <p class="tier-who">${esc(t.forWho)}</p>
              <p class="tier-price">${esc(t.priceNote)}</p>
              <ul class="ticks">${t.includes.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
              <p class="actions">${renderCta(t.cta, t.featured ? 'primary' : 'secondary')}</p>
            </article>`).join('')}
          </div>
          ${block.footnote ? `<p class="tier-foot reveal">${esc(block.footnote)}</p>` : ''}
        </div>
      </section>`;

    case 'table':
      return `<section class="band">
        <div class="wrap">
          ${block.heading ? `<h2 class="reveal">${esc(block.heading)}</h2>` : ''}
          ${block.intro ? `<p class="intro reveal">${esc(block.intro)}</p>` : ''}
          <div class="table-scroll reveal">
            <table>
              <thead><tr>${block.columns
                .map((c) => `<th${c.numeric ? ' class="num"' : ''}>${esc(c.label)}</th>`)
                .join('')}</tr></thead>
              <tbody>
                ${block.rows.map((row) => `<tr>${row
                  .map((cell, i) => `<td${block.columns[i]?.numeric ? ' class="num"' : ''}>${esc(cell)}</td>`)
                  .join('')}</tr>`).join('')}
              </tbody>
            </table>
          </div>
          ${block.footnote ? `<p class="table-foot reveal">${esc(block.footnote)}</p>` : ''}
        </div>
      </section>`;

    case 'stat':
      return `<section class="band"><div class="wrap"><div class="stat reveal">
        <p class="stat-value">${esc(block.value)}</p>
        <p class="stat-label">${esc(block.label)}</p>
        ${block.source ? renderSource(block.source) : ''}
      </div></div></section>`;

    case 'statRow':
      return `<section class="band"><div class="wrap"><div class="stat-row">
        ${block.stats.map((s, i) => `<div class="stat reveal reveal-${Math.min(i + 1, 5)}">
          <p class="stat-value">${esc(s.value)}</p>
          <p class="stat-label">${esc(s.label)}</p>
          ${s.source ? renderSource(s.source) : ''}
        </div>`).join('')}
      </div></div></section>`;

    case 'prose':
      return `<section class="band"><div class="wrap narrow prose reveal">
        ${block.heading ? `<h2>${esc(block.heading)}</h2>` : ''}
        ${block.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
      </div></section>`;

    case 'featureList':
      return `<section class="band">
        <div class="wrap">
          <h2 class="reveal">${esc(block.heading)}</h2>
          ${block.intro ? `<p class="intro reveal">${esc(block.intro)}</p>` : ''}
          <div class="feature-grid">
            ${block.features.map((f, i) => `<article class="feature reveal reveal-${Math.min(i + 1, 5)}">
              <h3>${esc(f.title)}</h3>
              <p>${esc(f.body)}</p>
              ${f.prevents ? `<p class="prevents"><span>Pattern this addresses:</span> ${esc(f.prevents)}</p>` : ''}
            </article>`).join('')}
          </div>
        </div>
      </section>`;

    case 'comparison':
      return `<section class="band">
        <div class="wrap">
          <h2 class="reveal">${esc(block.heading)}</h2>
          ${block.intro ? `<p class="intro reveal">${esc(block.intro)}</p>` : ''}
          <div class="table-scroll reveal">
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
        </div>
      </section>`;

    case 'faq':
      return `<section class="band">
        <div class="wrap narrow">
          <h2 class="reveal">${esc(block.heading)}</h2>
          ${block.items.map((item) => `<details class="reveal">
            <summary>${esc(item.question)}</summary>
            <p>${esc(item.answer)}</p>
          </details>`).join('')}
        </div>
      </section>`;

    case 'callout':
      return `<section class="band"><div class="wrap narrow">
        <aside class="callout ${block.tone} reveal">
          ${block.heading ? `<p class="callout-heading">${esc(block.heading)}</p>` : ''}
          <p>${esc(block.body)}</p>
        </aside>
      </div></section>`;

    case 'quote':
      return `<section class="band"><div class="wrap narrow">
        <figure class="quote reveal">
          <blockquote>${esc(block.body)}</blockquote>
          <figcaption>${esc(block.attribution)}${block.source ? ` — ${renderSource(block.source)}` : ''}</figcaption>
        </figure>
      </div></section>`;

    case 'cta':
      return `<section class="band"><div class="wrap">
        <div class="cta-block reveal">
          <h2>${esc(block.heading)}</h2>
          ${block.body ? `<p class="lead">${esc(block.body)}</p>` : ''}
          <p class="actions">
            ${renderCta(block.cta, 'primary')}
            ${block.secondaryCta ? renderCta(block.secondaryCta, 'secondary') : ''}
          </p>
        </div>
      </div></section>`;
  }
}

function renderHero(
  block: Extract<Block, { type: 'hero' }>,
  page: MarketingPage,
): string {
  const visual = block.mockup
    ? mockupFor(block.mockup, 'bframe-tilt')
    : block.photo
      ? `<figure class="hero-photo">
          <img src="${esc(block.photo.src)}" alt="${esc(block.photo.alt)}" width="1376" height="860" fetchpriority="high">
          ${block.photo.caption ? `<figcaption class="hero-caption">${esc(block.photo.caption)}</figcaption>` : ''}
        </figure>`
      : '';

  const copy = `<div class="hero-copy">
    ${block.kicker ? `<p class="eyebrow">${esc(block.kicker)}</p>` : ''}
    <h1 class="page-title">${esc(page.h1)}</h1>
    <p class="lead">${esc(block.subheading)}</p>
    <p class="actions">
      ${block.cta ? renderCta(block.cta, 'primary') : ''}
      ${block.secondaryCta ? renderCta(block.secondaryCta, 'secondary') : ''}
    </p>
    ${
      block.trust?.length
        ? `<ul class="trustline">${block.trust.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`
        : ''
    }
  </div>`;

  return `<section class="hero">
    <div class="aurora" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="wrap hero-inner">
      ${visual ? `<div class="hero-split">${copy}<div class="hero-visual">${visual}</div></div>` : copy}
    </div>
  </section>`;
}

function mockupFor(kind: string, extra = ''): string {
  switch (kind) {
    case 'triage':
      return withClass(triageBoard(), extra);
    case 'compass':
      return withClass(nriCompass(), extra);
    case 'integrity':
      return withClass(integrityCard(), extra);
    case 'import':
      return withClass(importPreview(), extra);
    case 'claims':
      return withClass(claimsTracker(), extra);
    default:
      return '';
  }
}

/** The mockups return a frame with a known class; add a modifier onto it. */
function withClass(html: string, extra: string): string {
  return extra ? html.replace('class="bframe ', `class="bframe ${extra} `) : html;
}

function renderPhoto(photo: Photo, className: string): string {
  return `<figure class="${className}">
    <img src="${esc(photo.src)}" alt="${esc(photo.alt)}" loading="lazy" width="1264" height="848">
    ${photo.caption ? `<figcaption>${esc(photo.caption)}</figcaption>` : ''}
  </figure>`;
}

const MARK = { yes: '✓', partial: '~', no: '✗' } as const;

function renderCta(cta: Cta, variant: 'primary' | 'secondary'): string {
  return `<a class="btn ${variant}" href="${esc(cta.href)}">${esc(cta.label)}<span class="arr" aria-hidden="true">→</span></a>`;
}

function renderSource(source: { label: string; url: string }): string {
  return `<a class="source" href="${esc(source.url)}" rel="nofollow noopener" target="_blank">${esc(source.label)}</a>`;
}

/**
 * The feature index.
 *
 * Filtering is CSS-only — radio inputs plus `:has()` on the grid. Every card
 * stays in the DOM whatever is selected, so a crawler reads the whole feature
 * set rather than whichever slice happened to be default.
 */
function renderFeatureIndex(): string {
  const cats = FEATURE_CATEGORIES;

  const filters = `<div class="fx-filters" role="group" aria-label="Filter features by area">
    <input type="radio" name="fx" id="fx-all" value="all" checked>
    <label for="fx-all">Everything</label>
    ${cats.map((c, i) => `<input type="radio" name="fx" id="fx-${i}" value="${esc(c)}">
      <label for="fx-${i}">${esc(c)}</label>`).join('')}
  </div>`;

  const cards = FEATURES.map((f) => {
    const cat = cats.indexOf(f.category);
    return `<article class="fx-card" data-cat="${cat}">
      <h3>${esc(f.title)}</h3>
      <p>${esc(f.body)}</p>
      <div class="fx-tags">
        <span class="${f.status === 'shipped' ? 'fx-shipped' : 'fx-planned'}">${
          f.status === 'shipped' ? '● Shipped' : '○ Planned'
        }</span>
        ${f.tags.map((t) => `<span class="fx-tag">${esc(t)}</span>`).join('')}
      </div>
    </article>`;
  }).join('');

  // One rule per category: when that radio is checked, hide everything whose
  // data-cat is not it. Generated rather than hand-written so a new category
  // cannot be added without its filter working.
  const rules = cats
    .map(
      (_, i) =>
        `.fx:has(#fx-${i}:checked) .fx-card:not([data-cat="${i}"]){display:none}`,
    )
    .join('');

  const planned = FEATURES.length - shippedCount();

  return `<section class="band">
    <div class="wrap">
      <div class="fx">
        <p class="fx-count reveal">${shippedCount()} shipped · ${planned} on the roadmap · everything below is
          marked either way, because a features page that lists intentions as capabilities is
          exactly the kind of unsupported promise this product exists to catch.</p>
        ${filters}
        <style>${rules}</style>
        <div class="fx-grid">${cards}</div>
      </div>
    </div>
  </section>`;
}

function renderGuideIndex(): string {
  const allGuides = guides();
  const byCategory = new Map<string, MarketingPage[]>();
  for (const guide of allGuides) {
    const key = guide.category ?? 'General';
    byCategory.set(key, [...(byCategory.get(key) ?? []), guide]);
  }

  const sections = [...byCategory.entries()]
    .map(([category, entries]) => `<section class="band">
      <div class="wrap">
        <h2 class="reveal">${esc(category)}</h2>
        <ul class="link-list reveal">
          ${entries.map((g) => `<li>
            <a href="${esc(pathFor(g.slug))}">${esc(g.h1)}</a>
            <span>${esc(g.description)}</span>
          </li>`).join('')}
        </ul>
      </div>
    </section>`).join('');

  return sections + `<section class="band">
    <div class="wrap">
      <h2 class="reveal">Comparisons</h2>
      <ul class="link-list reveal">
        ${comparisons().map((c) => `<li>
          <a href="${esc(pathFor(c.slug))}">${esc(c.h1)}</a>
          <span>${esc(c.description)}</span>
        </li>`).join('')}
      </ul>
    </div>
  </section>`;
}

function renderRelated(page: MarketingPage): string {
  if (!page.related?.length) return '';
  return `<div class="wrap"><nav class="related">
    <h2>Related</h2>
    <ul>
      ${page.related.map((slug) => `<li><a href="${esc(pathFor(slug))}">${esc(titleize(slug))}</a></li>`).join('')}
    </ul>
  </nav></div>`;
}

function titleize(slug: string): string {
  const last = slug.split('/').pop() ?? slug;
  const words = last.split('-').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// ── Shell ────────────────────────────────────────────────────────────────────

/** The primary navigation, in one place so header, drawer, and footer agree. */
const NAV = [
  { href: '/features', label: 'Features' },
  { href: '/claims-integrity', label: 'Claims integrity' },
  { href: '/need-response-intelligence', label: 'NRI' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/guides', label: 'Guides' },
];

function renderHeader(): string {
  return `<header class="site-header" id="hdr">
    <div class="hdr">
      ${logoLockup()}
      <nav class="hdr-nav" aria-label="Primary">
        ${NAV.map((n) => `<a href="${n.href}">${esc(n.label)}</a>`).join('')}
        <a class="btn primary small hdr-cta" href="/app/login">Open the demo</a>
      </nav>
      <button class="navtoggle" type="button" aria-label="Open menu" aria-expanded="false"
        aria-controls="drawer" data-open-drawer>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" stroke-width="1.7"
            stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  </header>`;
}

/**
 * The mobile drawer.
 *
 * Rendered into the document rather than created by script, so its links are in
 * the markup a crawler sees and so it costs nothing to open. `data-open` is the
 * only thing the script toggles.
 */
function renderDrawer(): string {
  return `<div class="drawer" id="drawer" data-open="false">
    <div class="drawer-scrim" data-close-drawer></div>
    <nav class="drawer-panel" aria-label="Mobile">
      <div class="drawer-top">
        ${logoLockup()}
        <button class="drawer-close" type="button" aria-label="Close menu" data-close-drawer>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" stroke-width="1.8"
              stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <p class="drawer-label">Product</p>
      ${NAV.map((n) => `<a href="${n.href}">${esc(n.label)}</a>`).join('')}
      <p class="drawer-label">Company</p>
      <a href="/security">Security</a>
      <a href="/about">About</a>
      <a href="/faq">FAQ</a>
      <a class="btn primary" href="/app/login">Open the demo</a>
    </nav>
  </div>`;
}

function renderFooter(): string {
  return `<footer class="site-footer">
    <div class="foot">
      <div class="foot-brand">
        ${logoLockup()}
        <p>${esc(SITE.tagline)}</p>
      </div>
      <div>
        <h4>Product</h4>
        <ul>
          <li><a href="/features">Features</a></li>
          <li><a href="/claims-integrity">Claims integrity</a></li>
          <li><a href="/need-response-intelligence">Need Response Intelligence</a></li>
          <li><a href="/how-it-works">How it works</a></li>
          <li><a href="/pricing">Pricing</a></li>
        </ul>
      </div>
      <div>
        <h4>Learn</h4>
        <ul>
          <li><a href="/guides">Guides</a></li>
          <li><a href="/compare/spreadsheets">vs. spreadsheets</a></li>
          <li><a href="/compare/generic-crm">vs. a generic CRM</a></li>
          <li><a href="/compare/legacy-administration-systems">vs. legacy platforms</a></li>
          <li><a href="/faq">FAQ</a></li>
        </ul>
      </div>
      <div>
        <h4>Company</h4>
        <ul>
          <li><a href="/about">About</a></li>
          <li><a href="/security">Security</a></li>
          <li><a href="/who-its-for">Who it is for</a></li>
          <li><a href="/llms.txt">llms.txt</a></li>
        </ul>
      </div>
    </div>
    <div class="foot-base">
      <p class="disclaimer">
        Auxilium is software for health care sharing ministries. It is not insurance, not a health
        plan, and not a compliance certification. Health care sharing ministries are exempt from
        state insurance regulation; no software changes that.
      </p>
    </div>
  </footer>`;
}

/**
 * The whole client-side runtime.
 *
 * Three jobs and nothing else: arm the reveal animations, run the drawer, and
 * shade the header once the page has scrolled. It adds `.js` to <html> as its
 * first act — that class is what makes `.reveal` start hidden, so if this
 * script never runs, never parses, or is blocked, the page is simply fully
 * visible rather than blank.
 */
const SCRIPT = `
(function(){
  var d=document, r=d.documentElement;
  r.className+=' js';

  // Reveal on scroll. Anything still off-screen when the observer is
  // unavailable is shown immediately rather than left hidden.
  var els=d.querySelectorAll('.reveal');
  if(!('IntersectionObserver' in window)){
    for(var i=0;i<els.length;i++) els[i].classList.add('in');
  } else {
    var io=new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); }
      });
    },{rootMargin:'0px 0px -8% 0px',threshold:.06});
    els.forEach(function(el){ io.observe(el); });

    // Failsafe. Adding .js is what makes .reveal start hidden, so any situation
    // where the observer never delivers — a headless renderer that does not
    // paint, an aggressive extension, a bug in a browser we have not tested —
    // would otherwise leave the page permanently blank. After two seconds,
    // everything is shown regardless. A missed animation is a rounding error;
    // invisible content is the whole site.
    setTimeout(function(){
      for(var j=0;j<els.length;j++) els[j].classList.add('in');
    },2000);
  }

  // Header shade.
  var hdr=d.getElementById('hdr');
  if(hdr){
    var onScroll=function(){ hdr.classList.toggle('stuck', window.scrollY>8); };
    onScroll();
    window.addEventListener('scroll',onScroll,{passive:true});
  }

  // Drawer. Focus moves in on open and back to the trigger on close, and Escape
  // closes — the three things a hand-rolled menu usually gets wrong.
  var drawer=d.getElementById('drawer'), trigger=d.querySelector('[data-open-drawer]');
  function setDrawer(open){
    if(!drawer) return;
    drawer.setAttribute('data-open', open?'true':'false');
    if(trigger) trigger.setAttribute('aria-expanded', open?'true':'false');
    d.body.style.overflow = open?'hidden':'';
    if(open){ var f=drawer.querySelector('a,button'); if(f) f.focus(); }
    else if(trigger) trigger.focus();
  }
  if(trigger) trigger.addEventListener('click',function(){ setDrawer(true); });
  d.querySelectorAll('[data-close-drawer]').forEach(function(el){
    el.addEventListener('click',function(){ setDrawer(false); });
  });
  if(drawer){
    drawer.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click',function(){ setDrawer(false); });
    });
  }
  d.addEventListener('keydown',function(e){
    if(e.key==='Escape' && drawer && drawer.getAttribute('data-open')==='true') setDrawer(false);
  });
})();
`.trim();

/**
 * The public 404.
 *
 * A real page rather than the SPA shell: a visitor who mistyped a URL should be
 * told so and handed somewhere useful, and a crawler should get an honest
 * status code.
 */
export function renderNotFound(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Page not found — ${esc(SITE.name)}</title>
    <meta name="robots" content="noindex">
    <link rel="icon" href="${faviconDataUri()}">
    <style>${STYLES}</style>
  </head>
  <body>
    ${renderHeader()}
    ${renderDrawer()}
    <main id="main">
      <section class="hero">
        <div class="aurora" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="wrap hero-inner">
          <div class="hero-copy">
            <p class="eyebrow">404</p>
            <h1 class="page-title">That page does not exist</h1>
            <p class="lead">The link may be out of date, or the address may have a typo in it.</p>
            <p class="actions">
              <a class="btn primary" href="/">Back to the start<span class="arr">→</span></a>
              <a class="btn secondary" href="/features">See every feature<span class="arr">→</span></a>
            </p>
          </div>
        </div>
      </section>
    </main>
    ${renderFooter()}
    <script>${SCRIPT}</script>
  </body>
</html>`;
}

export { logoMark, browserFrame };
