import { esc } from './esc';
import { brandCss, type ResolvedBrand } from '../../src/lib/brand/tokens';
import {
  resolveSite, siteNav, type ResolvedBlock, type SiteContext, type SitePage,
} from '../../src/lib/cms/blocks';

/**
 * The ministry's own public site.
 *
 * Server-rendered from the same Worker as Auxilium's marketing site, for the
 * same reasons and with the same rule: **the page is complete without
 * JavaScript**. This audience reads these pages on a phone in a hospital car
 * park deciding whether to join something, and a page that paints itself after
 * a bundle loads is a page some of them never see.
 *
 * Two things make this different from the marketing renderer:
 *
 * **Every colour comes from `brandCss`.** Not a copy of the ministry's palette
 * — the same `resolveBrand` output the studio previews and the member portal
 * applies. A ministry that picks a colour once should not find its website is
 * the one surface that got it wrong, and a second implementation of "what
 * colour is this ministry" would drift within a release.
 *
 * **Live blocks are resolved before rendering, and a live block with no data
 * behind it never reaches here.** See `resolveBlock`. What that means for this
 * file is that it never has to render a fallback for a missing number — there
 * is no "—" branch, because a missing number means a missing section.
 */

export interface MinistrySite {
  org: { name: string; slug: string };
  brand: ResolvedBrand;
  pages: SitePage[];
  ctx: SiteContext;
}

/**
 * The stylesheet.
 *
 * Deliberately not the marketing site's. Auxilium's design system is Auxilium's
 * — reusing it would make every ministry's site look like a Auxilium page with
 * a different accent colour, which is the opposite of a white label. This is a
 * plain, quiet, readable layout that takes its whole character from the brand
 * tokens, so two ministries with different palettes produce genuinely different
 * looking sites.
 */
const STYLES = `
*,*::before,*::after{box-sizing:border-box}
body{margin:0;font-family:var(--brand-font);color:var(--brand-on-surface);
  background:var(--brand-surface);line-height:1.6;-webkit-font-smoothing:antialiased}
img{max-width:100%;height:auto}
a{color:var(--brand-primary)}
.skip{position:absolute;left:-9999px}
.skip:focus{left:1rem;top:1rem;z-index:10;padding:.5rem .75rem;background:var(--brand-primary);
  color:var(--brand-on-primary);border-radius:var(--brand-radius)}
.wrap{max-width:64rem;margin:0 auto;padding:0 1.25rem}
header.site{border-bottom:1px solid var(--brand-border);position:sticky;top:0;
  background:var(--brand-surface);z-index:5}
header.site .wrap{display:flex;align-items:center;justify-content:space-between;
  gap:1rem;min-height:4.25rem;flex-wrap:wrap}
.brandmark{display:flex;align-items:center;gap:.6rem;font-weight:650;font-size:1.05rem;
  color:var(--brand-on-surface);text-decoration:none}
.brandmark .dot{width:1.75rem;height:1.75rem;border-radius:var(--brand-radius);
  background:var(--brand-primary);color:var(--brand-on-primary);display:grid;place-items:center;
  font-size:.9rem;font-weight:700;flex:none}
nav.site{display:flex;align-items:center;gap:1.25rem;flex-wrap:wrap}
nav.site a{color:var(--brand-on-surface);text-decoration:none;font-size:.95rem}
nav.site a:hover,nav.site a[aria-current=page]{color:var(--brand-primary);text-decoration:underline}
section{padding:3.5rem 0;border-bottom:1px solid var(--brand-border)}
section:last-of-type{border-bottom:0}
section.hero{padding:5rem 0 4rem;background:var(--brand-primary-soft)}
h1,h2,h3{line-height:1.2;margin:0 0 .75rem;letter-spacing:-.015em}
h1{font-size:clamp(2rem,5vw,3rem);font-weight:700}
h2{font-size:clamp(1.5rem,3vw,2rem);font-weight:650}
h3{font-size:1.1rem;font-weight:650}
p{margin:0 0 1rem;max-width:44rem}
.lede{font-size:1.15rem;color:var(--brand-on-surface)}
.muted{color:var(--brand-muted)}
.btn{display:inline-block;padding:.7rem 1.35rem;border-radius:var(--brand-radius);
  background:var(--brand-primary);color:var(--brand-on-primary);text-decoration:none;
  font-weight:600;border:0}
.btn:hover{filter:brightness(1.08)}
.btn.ghost{background:transparent;color:var(--brand-primary);
  box-shadow:inset 0 0 0 1px var(--brand-border)}
.grid{display:grid;gap:1.5rem;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));margin-top:2rem}
.card{padding:1.25rem;border:1px solid var(--brand-border);border-radius:var(--brand-radius);
  background:var(--brand-surface)}
.card h3{margin-bottom:.35rem}
.card p{margin:0;font-size:.95rem;color:var(--brand-muted)}
ol.steps{list-style:none;padding:0;margin:2rem 0 0;display:grid;gap:1.25rem;
  grid-template-columns:repeat(auto-fit,minmax(14rem,1fr));counter-reset:step}
ol.steps li{counter-increment:step;padding-top:2.5rem;position:relative}
ol.steps li::before{content:counter(step);position:absolute;top:0;left:0;width:2rem;height:2rem;
  border-radius:999px;background:var(--brand-primary);color:var(--brand-on-primary);
  display:grid;place-items:center;font-weight:700;font-size:.9rem}
dl.faq{margin:2rem 0 0}
dl.faq dt{font-weight:650;margin-top:1.5rem}
dl.faq dd{margin:.35rem 0 0;color:var(--brand-muted);max-width:44rem}
.figure{display:grid;gap:.25rem}
.figure .value{font-size:2.25rem;font-weight:700;color:var(--brand-primary);line-height:1.1}
.figure .label{font-size:.95rem}
.figure .src{font-size:.8rem;color:var(--brand-muted)}
.ratio{display:flex;align-items:baseline;gap:.75rem;flex-wrap:wrap;margin-bottom:1rem}
.ratio .value{font-size:3.5rem;font-weight:700;color:var(--brand-primary);line-height:1}
footer.site{padding:2.5rem 0 3.5rem;border-top:1px solid var(--brand-border);
  color:var(--brand-muted);font-size:.9rem}
footer.site p{max-width:46rem}
footer.site a{color:var(--brand-muted)}
.notice{margin-top:1.25rem;padding:1rem 1.15rem;border-radius:var(--brand-radius);
  border:1px solid var(--brand-border);background:var(--brand-primary-soft);
  color:var(--brand-on-surface);font-size:.9rem}
@media (max-width:40rem){
  header.site .wrap{min-height:0;padding-top:.85rem;padding-bottom:.85rem}
  nav.site{gap:.9rem}
  section{padding:2.5rem 0}
  section.hero{padding:3rem 0 2.5rem}
}
`;

export function renderMinistryPage(
  site: MinistrySite,
  page: SitePage,
  origin: string,
): string {
  const blocks = resolveSite(page, site.ctx);
  const nav = siteNav(site.pages);
  const base = `/${site.org.slug}`;
  const isHome = page.slug === 'home';

  // The page's own title first, the ministry second — a browser tab that reads
  // "Cedar Ridge | Cedar Ridge" on the home page is nobody's intent.
  const title = isHome ? site.org.name : `${page.title} — ${site.org.name}`;
  const canonical = `${origin}${base}${isHome ? '' : `/${page.slug}`}`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${esc(title)}</title>
    <link rel="canonical" href="${esc(canonical)}">
    <meta name="description" content="${esc(description(site, blocks))}">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${esc(canonical)}">
    <meta name="theme-color" content="${esc(site.brand.palette.primary)}">
    <style>${brandCss(site.brand)}${STYLES}</style>
  </head>
  <body>
    <a class="skip" href="#main">Skip to content</a>
    <header class="site">
      <div class="wrap">
        <a class="brandmark" href="${esc(base)}">
          <span class="dot" aria-hidden="true">${esc(initial(site.org.name))}</span>
          <span>${esc(site.org.name)}</span>
        </a>
        ${
          nav.length
            ? `<nav class="site" aria-label="Site">${nav
                .map(
                  (n) =>
                    `<a href="${esc(base)}/${esc(n.slug)}"${
                      n.slug === page.slug ? ' aria-current="page"' : ''
                    }>${esc(n.title)}</a>`,
                )
                .join('')}</nav>`
            : ''
        }
      </div>
    </header>
    <main id="main">
      ${blocks.map((b, i) => renderBlock(b, site, i === 0)).join('\n')}
    </main>
    <!-- The sentence every state that legislated on this insisted on, on every
         page rather than only the pages that happen to mention it. It lives in
         the renderer rather than in the template because a ministry can edit a
         template — not as a legal shield for Auxilium, but because a visitor
         who misses it is the person this whole product exists to stop being
         blindsided. -->
    <footer class="site">
      <div class="wrap">
        <p>
          <strong>${esc(site.org.name)}</strong> is a health care sharing ministry. Membership is
          not insurance, sharing is not guaranteed, and you remain personally responsible for your
          own medical bills.
        </p>
        <p>Members: <a href="/app/portal">sign in to your account</a>.</p>
      </div>
    </footer>
  </body>
</html>`;
}

function initial(name: string): string {
  return (name.trim()[0] ?? 'M').toUpperCase();
}

/** The first real sentence on the page, for search results and link previews. */
function description(site: MinistrySite, blocks: ResolvedBlock[]): string {
  const text = blocks.map((b) => b.body ?? b.live?.body ?? '').find((t) => t.trim().length > 40);
  const raw = text?.trim() ?? `${site.org.name} is a health care sharing ministry.`;
  return raw.length > 300 ? `${raw.slice(0, 297)}…` : raw;
}

function renderBlock(block: ResolvedBlock, site: MinistrySite, first: boolean): string {
  const heading = block.live?.heading ?? block.heading;
  const body = block.live?.body ?? block.body;
  const items = block.live?.items ?? block.items;

  switch (block.type) {
    case 'hero':
      return `<section class="hero">
        <div class="wrap">
          ${heading ? `<h1>${esc(heading)}</h1>` : ''}
          ${body ? `<p class="lede">${esc(body)}</p>` : ''}
          ${
            block.actionHref
              ? `<p><a class="btn" href="${esc(block.actionHref)}">${esc(block.actionLabel ?? 'Apply')}</a></p>`
              : ''
          }
        </div>
      </section>`;

    case 'apply':
      return `<section>
        <div class="wrap">
          ${headingTag(heading, first)}
          ${body ? `<p>${esc(body)}</p>` : ''}
          <p><a class="btn" href="${esc(block.actionHref ?? '#')}">${esc(
            block.actionLabel ?? `Apply to ${site.org.name}`,
          )}</a></p>
        </div>
      </section>`;

    case 'share_ratio':
      return `<section>
        <div class="wrap">
          ${headingTag(heading, first)}
          ${body ? `<p>${esc(body)}</p>` : ''}
        </div>
      </section>`;

    case 'steps':
      return `<section>
        <div class="wrap">
          ${headingTag(heading, first)}
          ${body ? `<p>${esc(body)}</p>` : ''}
          <ol class="steps">${(items ?? [])
            .map((i) => `<li><h3>${esc(i.title)}</h3><p class="muted">${esc(i.body)}</p></li>`)
            .join('')}</ol>
        </div>
      </section>`;

    case 'faq':
    case 'guidelines':
      return `<section>
        <div class="wrap">
          ${headingTag(heading, first)}
          ${body ? `<p>${esc(body)}</p>` : ''}
          <dl class="faq">${(items ?? [])
            .map((i) => `<dt>${esc(i.title)}</dt><dd>${esc(i.body)}</dd>`)
            .join('')}</dl>
        </div>
      </section>`;

    case 'stats':
      return `<section>
        <div class="wrap">
          ${headingTag(heading, first)}
          <div class="grid">${(block.stats ?? [])
            .map(
              (s) => `<div class="figure">
                <span class="value">${esc(s.value)}</span>
                <span class="label">${esc(s.label)}</span>
                ${s.source ? `<span class="src">${esc(s.source)}</span>` : ''}
              </div>`,
            )
            .join('')}</div>
        </div>
      </section>`;

    case 'cta':
      return `<section>
        <div class="wrap">
          ${headingTag(heading, first)}
          ${body ? `<p>${esc(body)}</p>` : ''}
          ${
            block.actionHref && block.actionLabel
              ? `<p><a class="btn" href="${esc(block.actionHref)}">${esc(block.actionLabel)}</a></p>`
              : ''
          }
        </div>
      </section>`;

    default:
      return `<section>
        <div class="wrap">
          ${headingTag(heading, first)}
          ${body ? paragraphs(body) : ''}
        </div>
      </section>`;
  }
}

/**
 * Exactly one h1 per page, and it is the first block's heading.
 *
 * A page whose every section is an h1 is a page a screen reader cannot be
 * navigated by, and it is the most common way a block-based editor produces
 * inaccessible output.
 */
function headingTag(heading: string | undefined, first: boolean): string {
  if (!heading) return '';
  return first ? `<h1>${esc(heading)}</h1>` : `<h2>${esc(heading)}</h2>`;
}

/** Blank lines in a prose block become paragraphs, which is what people expect. */
function paragraphs(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join('');
}

/** A ministry site that exists but has no page at this address. */
export function renderMinistryNotFound(site: MinistrySite): string {
  return renderMinistryPage(
    site,
    {
      slug: '404',
      title: 'Page not found',
      blocks: [
        {
          id: '404',
          type: 'prose',
          heading: 'That page is not here',
          body:
            `The link may be out of date. Everything on ${site.org.name}'s site is reachable ` +
            'from the menu at the top.',
        },
      ],
    },
    '',
  );
}
