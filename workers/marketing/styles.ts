/**
 * Component styles for the public site.
 *
 * Split from brand.ts (tokens + motion) so the visual language and the
 * components that use it can be changed independently. Concatenated and inlined
 * into every document: one request, no flash of unstyled text, nothing
 * render-blocking from a third party.
 */

export const LAYOUT = `
/* ── Header ─────────────────────────────────────────────────────────────── */
.site-header{position:sticky;top:0;z-index:50;backdrop-filter:saturate(1.6) blur(14px);
  -webkit-backdrop-filter:saturate(1.6) blur(14px);
  background:color-mix(in srgb,var(--bg) 82%,transparent);
  border-bottom:1px solid transparent;transition:border-color .3s var(--ease-soft),background .3s}
.site-header.stuck{border-bottom-color:var(--line)}
.hdr{max-width:var(--maxw);margin:0 auto;padding:13px 22px;display:flex;align-items:center;gap:20px}
.lockup{display:inline-flex;align-items:center;gap:9px;text-decoration:none;color:var(--fg);
  font-weight:660;font-size:18.5px;letter-spacing:-.02em;flex-shrink:0}
.lockup-mark{transition:transform .5s var(--ease)}
.lockup:hover .lockup-mark{transform:rotate(90deg)}
.hdr-nav{display:flex;align-items:center;gap:3px;margin-left:auto}
.hdr-nav a{color:var(--muted);text-decoration:none;font-size:14.5px;font-weight:500;
  padding:8px 12px;border-radius:8px;transition:color .18s,background .18s;white-space:nowrap}
.hdr-nav a:hover{color:var(--fg);background:var(--card-2)}
.hdr-cta{margin-left:8px}
.navtoggle{display:none;background:none;border:1px solid var(--line);border-radius:9px;
  padding:8px 10px;cursor:pointer;color:var(--fg);margin-left:auto}
.navtoggle svg{display:block}

/* ── Mobile drawer ──────────────────────────────────────────────────────── */
.drawer{position:fixed;inset:0;z-index:60;display:none}
.drawer[data-open="true"]{display:block}
.drawer-scrim{position:absolute;inset:0;background:rgba(4,8,12,.55);
  animation:fade-in .25s var(--ease-soft)}
.drawer-panel{position:absolute;right:0;top:0;bottom:0;width:min(86vw,340px);
  background:var(--bg);border-left:1px solid var(--line);padding:18px;
  display:flex;flex-direction:column;gap:4px;overflow-y:auto;
  animation:drawer-in .32s var(--ease)}
@keyframes drawer-in{from{transform:translateX(100%)}to{transform:none}}
.drawer-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.drawer-close{background:none;border:1px solid var(--line);border-radius:9px;padding:8px 10px;
  cursor:pointer;color:var(--fg)}
.drawer-panel a{color:var(--fg);text-decoration:none;font-size:16.5px;font-weight:520;
  padding:13px 12px;border-radius:10px}
.drawer-panel a:hover,.drawer-panel a:focus-visible{background:var(--card-2)}
.drawer-label{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--faint);
  margin:16px 12px 4px;font-weight:600}
.drawer-panel .btn{margin-top:14px;text-align:center}
@media(max-width:900px){
  .hdr-nav{display:none}
  .navtoggle{display:block}
}

/* ── Footer ─────────────────────────────────────────────────────────────── */
.site-footer{border-top:1px solid var(--line);margin-top:96px;background:var(--bg-2)}
.foot{max-width:var(--maxw);margin:0 auto;padding:56px 22px 40px;
  display:grid;grid-template-columns:1.7fr repeat(3,1fr);gap:36px}
.foot-brand p{color:var(--muted);font-size:14px;margin:14px 0 0;max-width:34ch}
.foot h4{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--faint);
  margin:0 0 14px;font-weight:600}
.foot ul{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:9px}
.foot a{color:var(--muted);text-decoration:none;font-size:14.5px;transition:color .18s}
.foot a:hover{color:var(--fg)}
.foot-base{max-width:var(--maxw);margin:0 auto;padding:0 22px 52px}
.disclaimer{font-size:12.5px;color:var(--faint);max-width:88ch;line-height:1.65;
  border-top:1px solid var(--line);padding-top:22px;margin:0}
@media(max-width:820px){.foot{grid-template-columns:1fr 1fr;gap:30px}}
@media(max-width:520px){.foot{grid-template-columns:1fr}}
`;

export const COMPONENTS = `
/* ── Type ───────────────────────────────────────────────────────────────── */
main{display:block}
.page-title{font-size:clamp(32px,5.2vw,52px);line-height:1.06;letter-spacing:-.033em;
  margin:0 0 20px;font-weight:680;max-width:20ch}
h2{font-size:clamp(24px,3.4vw,34px);letter-spacing:-.025em;line-height:1.18;
  margin:0 0 14px;font-weight:660}
h3{font-size:17px;margin:0 0 8px;font-weight:620;letter-spacing:-.01em}
p{margin:0 0 16px;max-width:68ch}
section{margin:0}
.band{padding:clamp(44px,5.5vw,68px) 0}
.band-tint{background:var(--bg-2);border-block:1px solid var(--line)}
/* Consecutive plain bands would otherwise stack 136px of air between two
   paragraphs. Halve the seam where two untinted bands meet. */
.band+.band{padding-top:0}
.band+.band-tint,.band-tint+.band{padding-top:clamp(44px,5.5vw,68px)}
.eyebrow{display:inline-flex;align-items:center;gap:8px;text-transform:uppercase;
  letter-spacing:.13em;font-size:11.5px;color:var(--primary);margin:0 0 18px;font-weight:640}
.eyebrow::before{content:"";width:22px;height:1px;background:currentColor;opacity:.6}
.lead{font-size:clamp(17px,2.1vw,20px);color:var(--muted);max-width:60ch;line-height:1.62}
.intro{color:var(--muted);max-width:64ch;font-size:16.5px}

/* ── Buttons ────────────────────────────────────────────────────────────── */
.actions{display:flex;flex-wrap:wrap;gap:11px;margin:30px 0 0;max-width:none}
.btn{display:inline-flex;align-items:center;gap:8px;padding:12px 22px;border-radius:10px;
  text-decoration:none;font-weight:570;font-size:15px;border:1px solid transparent;
  transition:transform .2s var(--ease),box-shadow .2s var(--ease),background .2s;position:relative}
.btn.primary{background:linear-gradient(135deg,var(--primary),var(--primary-2));
  color:var(--primary-fg);box-shadow:0 1px 2px rgba(0,0,0,.18),0 8px 20px -8px var(--primary)}
.btn.primary:hover{transform:translateY(-2px);
  box-shadow:0 2px 4px rgba(0,0,0,.2),0 14px 30px -10px var(--primary)}
.btn.secondary{border-color:var(--line-2);color:var(--fg);background:var(--card)}
.btn.secondary:hover{border-color:var(--muted);transform:translateY(-2px)}
.btn.small{padding:9px 16px;font-size:14px}
.btn .arr{transition:transform .25s var(--ease)}
.btn:hover .arr{transform:translateX(3px)}

/* ── Hero ───────────────────────────────────────────────────────────────── */
.hero{position:relative;padding:clamp(42px,6vw,76px) 0 clamp(30px,3.5vw,44px);overflow:hidden}
.aurora{position:absolute;inset:-30% -10% auto;height:130%;pointer-events:none;z-index:0;
  filter:blur(80px);opacity:.5}
.aurora i{position:absolute;display:block;border-radius:50%}
.aurora i:nth-child(1){width:44vw;height:44vw;left:-4%;top:-6%;
  background:radial-gradient(circle,var(--primary),transparent 68%);
  animation:drift 22s var(--ease-soft) infinite}
.aurora i:nth-child(2){width:36vw;height:36vw;right:2%;top:6%;
  background:radial-gradient(circle,var(--warm),transparent 68%);opacity:.55;
  animation:drift 27s var(--ease-soft) infinite reverse}
.aurora i:nth-child(3){width:30vw;height:30vw;left:38%;top:32%;
  background:radial-gradient(circle,var(--primary-2),transparent 70%);
  animation:drift 33s var(--ease-soft) infinite}
@media(prefers-color-scheme:light){.aurora{opacity:.3}}
.hero-inner{position:relative;z-index:1}
.hero-split{display:grid;grid-template-columns:1.12fr .88fr;gap:clamp(30px,4vw,52px);
  align-items:center}
@media(max-width:940px){.hero-split{grid-template-columns:1fr;gap:34px}}
/* The caption sits under the image rather than over it. Overlaid, it depended
   on a scrim that could not stay legible against both a light and a dark
   photograph in both colour schemes. */
.hero-photo{margin:0;border-radius:var(--r-xl);overflow:hidden;border:1px solid var(--line);
  box-shadow:var(--shadow-lg);background:var(--card)}
.hero-photo img{width:100%;aspect-ratio:16/10;object-fit:cover}
.hero-caption{font-size:13px;color:var(--faint);margin:0;max-width:none;
  padding:12px 18px;border-top:1px solid var(--line)}
.trustline{display:flex;flex-wrap:wrap;gap:8px 22px;margin:34px 0 0;padding:0;list-style:none}
.trustline li{color:var(--faint);font-size:13.5px;display:flex;align-items:center;gap:7px}
.trustline li::before{content:"";width:5px;height:5px;border-radius:50%;background:var(--primary)}

/* ── Stats ──────────────────────────────────────────────────────────────── */
.stat-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);padding:24px;
  transition:transform .3s var(--ease),border-color .3s}
.stat:hover{transform:translateY(-3px);border-color:var(--line-2)}
.stat-value{font-size:clamp(30px,4.4vw,42px);font-weight:680;margin:0;letter-spacing:-.035em;
  font-variant-numeric:tabular-nums;
  background:linear-gradient(120deg,var(--fg),var(--primary));
  -webkit-background-clip:text;background-clip:text;color:transparent}
.stat-label{color:var(--muted);font-size:14.5px;margin:8px 0 0;max-width:32ch}
.source{display:inline-block;margin-top:10px;font-size:11.5px;color:var(--faint)}

/* ── Features ───────────────────────────────────────────────────────────── */
.feature-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:16px;
  margin-top:34px}
.feature{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);padding:24px;
  position:relative;overflow:hidden;transition:transform .3s var(--ease),border-color .3s}
.feature::before{content:"";position:absolute;inset:0 0 auto;height:2px;
  background:linear-gradient(90deg,var(--primary),transparent);opacity:0;transition:opacity .3s}
.feature:hover{transform:translateY(-3px);border-color:var(--line-2)}
.feature:hover::before{opacity:1}
.feature p{font-size:15px;margin-bottom:0;color:var(--muted)}
.prevents{margin-top:14px;padding-top:14px;border-top:1px solid var(--line);font-size:13.5px}
.prevents span{color:var(--warm);font-weight:580}

/* ── Tables ─────────────────────────────────────────────────────────────── */
.table-scroll{overflow-x:auto;border:1px solid var(--line);border-radius:var(--r-lg);
  margin-top:24px;background:var(--card)}
table{width:100%;border-collapse:collapse;font-size:14.5px;min-width:640px}
th,td{text-align:left;padding:13px 16px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:var(--faint);font-weight:640;
  background:var(--card-2)}
tr:last-child td{border-bottom:0}
.mark{text-align:center;font-weight:680;width:104px;font-size:16px}
.mark.yes{color:var(--good)}.mark.partial{color:var(--warn)}.mark.no{color:var(--bad)}
.note{color:var(--muted);font-size:13.5px}
/* Figures line up digit-for-digit; a pricing table that does not is unreadable. */
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
tbody tr:hover td{background:var(--card-2)}
.table-foot{color:var(--faint);font-size:13.5px;margin:18px 0 0;max-width:78ch}

/* ── Callout / FAQ / quote ──────────────────────────────────────────────── */
.callout{border-left:3px solid var(--primary);background:var(--card);padding:20px 24px;
  border-radius:0 var(--r) var(--r) 0;margin:32px 0}
.callout.caution{border-left-color:var(--warm)}
.callout-heading{font-weight:620;margin:0 0 7px}
.callout p:last-child{margin-bottom:0;color:var(--muted)}
details{border:1px solid var(--line);border-radius:var(--r);padding:16px 20px;margin-bottom:10px;
  background:var(--card);transition:border-color .2s}
details[open]{border-color:var(--line-2)}
summary{cursor:pointer;font-weight:570;list-style:none;display:flex;justify-content:space-between;
  align-items:center;gap:16px}
summary::-webkit-details-marker{display:none}
summary::after{content:"+";color:var(--muted);font-size:20px;font-weight:400;flex-shrink:0;
  transition:transform .25s var(--ease)}
details[open] summary::after{transform:rotate(45deg)}
details p{margin:13px 0 0;color:var(--muted)}
.quote{margin:36px 0;padding:28px;background:var(--card);border:1px solid var(--line);
  border-radius:var(--r-lg)}
.quote blockquote{margin:0;font-size:19px;line-height:1.55;letter-spacing:-.01em}
.quote figcaption{color:var(--muted);font-size:14px;margin-top:14px}

/* ── CTA ────────────────────────────────────────────────────────────────── */
.cta-block{position:relative;overflow:hidden;background:var(--card);border:1px solid var(--line);
  border-radius:var(--r-xl);padding:clamp(34px,5vw,60px);text-align:center;margin:0}
.cta-block::before{content:"";position:absolute;inset:-60% -20% auto;height:200%;
  background:radial-gradient(ellipse at 50% 0%,var(--primary),transparent 62%);
  opacity:.13;pointer-events:none}
.cta-block>*{position:relative}
.cta-block h2{margin-top:0}
.cta-block p{margin-left:auto;margin-right:auto;color:var(--muted)}
.cta-block .actions{justify-content:center}

/* ── Split sections ─────────────────────────────────────────────────────── */
.split{display:grid;grid-template-columns:1fr 1.08fr;gap:clamp(32px,5vw,64px);align-items:center}
.split.flip .split-copy{order:2}
.split.flip .split-visual{order:1}
@media(max-width:940px){
  .split{grid-template-columns:1fr;gap:34px}
  .split.flip .split-copy,.split.flip .split-visual{order:initial}
}
.split-copy h2{margin-bottom:16px}
.center{text-align:center;margin-left:auto;margin-right:auto}
.mk-caption{text-align:center;color:var(--faint);font-size:14px;margin:18px auto 0;max-width:56ch}
.split-photo,.wide-photo{margin:0;border-radius:var(--r-xl);overflow:hidden;border:1px solid var(--line);
  box-shadow:var(--shadow-lg)}
.split-photo img,.wide-photo img{width:100%;object-fit:cover}
.wide-photo img{aspect-ratio:21/9}
.split-photo figcaption,.wide-photo figcaption{padding:14px 18px;font-size:13.5px;color:var(--faint);
  background:var(--card);border-top:1px solid var(--line)}

/* Tick lists */
.ticks{list-style:none;padding:0;margin:22px 0 0;display:flex;flex-direction:column;gap:11px}
.ticks li{position:relative;padding-left:29px;color:var(--muted);font-size:15.5px;max-width:60ch}
.ticks li::before{content:"";position:absolute;left:0;top:7px;width:16px;height:16px;border-radius:50%;
  background:color-mix(in srgb,var(--primary) 18%,transparent)}
.ticks li::after{content:"";position:absolute;left:5px;top:11px;width:5px;height:8px;
  border:solid var(--primary);border-width:0 1.8px 1.8px 0;transform:rotate(42deg)}

/* ── Steps ──────────────────────────────────────────────────────────────── */
.steps{list-style:none;padding:0;margin:38px 0 0;display:grid;
  grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:20px;counter-reset:step}
.step{position:relative;padding-top:8px}
.step-n{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;
  border-radius:50%;background:var(--card);border:1px solid var(--line-2);color:var(--primary);
  font-weight:680;font-size:14px;margin-bottom:14px;font-variant-numeric:tabular-nums}
.step h3{margin-bottom:7px}
.step p{color:var(--muted);font-size:14.5px;margin:0}

/* ── Pricing ────────────────────────────────────────────────────────────── */
.tiers{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:18px;margin-top:34px}
.tier{position:relative;background:var(--card);border:1px solid var(--line);
  border-radius:var(--r-xl);padding:28px;display:flex;flex-direction:column}
.tier.featured{border-color:var(--primary);box-shadow:0 0 0 1px var(--primary),var(--shadow-lg)}
.tier-flag{position:absolute;top:-11px;left:28px;background:var(--primary);color:var(--primary-fg);
  font-size:11px;font-weight:640;padding:4px 11px;border-radius:99px;letter-spacing:.03em}
.tier h3{font-size:20px;margin-bottom:5px}
.tier-who{color:var(--faint);font-size:13.5px;margin:0 0 16px}
.tier-price{font-size:16px;font-weight:600;color:var(--fg);margin:0 0 4px;
  padding-bottom:18px;border-bottom:1px solid var(--line)}
.tier .ticks{margin-top:18px;flex:1}
.tier .ticks li{font-size:14.5px}
.tier .actions{margin-top:24px}
.tier .btn{width:100%;justify-content:center}
.tier-foot{color:var(--faint);font-size:13.5px;margin:26px auto 0;max-width:68ch;text-align:center}

/* ── Lists / related ────────────────────────────────────────────────────── */
.link-list{list-style:none;padding:0;margin:0;display:grid;
  grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}
.link-list li{background:var(--card);border:1px solid var(--line);border-radius:var(--r);
  transition:transform .25s var(--ease),border-color .25s}
.link-list li:hover{transform:translateY(-2px);border-color:var(--line-2)}
.link-list a{font-weight:570;text-decoration:none;display:block;padding:18px 20px 6px;color:var(--fg)}
.link-list span{display:block;color:var(--muted);font-size:14px;padding:0 20px 18px}
.related{margin-top:72px;padding-top:28px;border-top:1px solid var(--line)}
.related h2{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--faint);
  margin-bottom:14px}
.related ul{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:9px}
.related a{display:inline-block;padding:8px 15px;border:1px solid var(--line);background:var(--card);
  border-radius:99px;text-decoration:none;font-size:14px;color:var(--fg);transition:border-color .2s}
.related a:hover{border-color:var(--primary)}
`;

export const MOCKUPS = `
/* ── Chromeless browser frame ───────────────────────────────────────────── */
.bframe{border:1px solid var(--line-2);border-radius:14px;overflow:hidden;background:var(--card);
  box-shadow:var(--shadow-lg);transition:transform .5s var(--ease)}
.bframe-tilt{transform:perspective(1400px) rotateY(-7deg) rotateX(2.5deg)}
.bframe-tilt:hover{transform:perspective(1400px) rotateY(-2deg) rotateX(1deg) translateY(-4px)}
.bframe-bar{display:flex;align-items:center;gap:7px;padding:11px 14px;background:var(--card-2);
  border-bottom:1px solid var(--line)}
.bdot{width:9px;height:9px;border-radius:50%;background:var(--line-2);flex-shrink:0}
.bframe-url{margin-left:12px;font-size:12px;color:var(--faint);font-family:ui-monospace,
  SFMono-Regular,Menlo,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bframe-body{padding:20px}
@media(max-width:640px){.bframe-body{padding:14px}.bframe-tilt{transform:none}}

.mk-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;
  margin-bottom:18px}
.mk-title{font-size:15.5px;font-weight:620;margin:0;letter-spacing:-.01em}
.mk-sub{font-size:12.5px;color:var(--faint);margin:3px 0 0;max-width:none}
.mk-pill{font-size:11px;font-weight:620;padding:4px 10px;border-radius:99px;flex-shrink:0;
  background:var(--card-2);border:1px solid var(--line);color:var(--muted);white-space:nowrap}
.mk-pill.pill-urgent{background:color-mix(in srgb,var(--bad) 16%,transparent);
  border-color:color-mix(in srgb,var(--bad) 34%,transparent);color:var(--bad)}
.mk-pill.pill-good{background:color-mix(in srgb,var(--good) 16%,transparent);
  border-color:color-mix(in srgb,var(--good) 34%,transparent);color:var(--good)}

/* Direction chips — same four colours the application uses. */
.chip{font-size:10.5px;font-weight:660;padding:3px 8px;border-radius:5px;letter-spacing:.03em;
  text-transform:uppercase}
.chip-cura{background:color-mix(in srgb,var(--warm) 20%,transparent);color:var(--warm)}
.chip-onus{background:color-mix(in srgb,var(--bad) 18%,transparent);color:var(--bad)}
.chip-familia{background:color-mix(in srgb,var(--primary) 20%,transparent);color:var(--primary)}
.chip-fides{background:color-mix(in srgb,var(--warn) 20%,transparent);color:var(--warn)}

/* Triage rows */
.tr-row{padding:13px 0;border-top:1px solid var(--line)}
.tr-row:first-of-type{border-top:0}
.tr-who{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap}
.tr-name{font-weight:590;font-size:14.5px}
.tr-house{font-size:12px;color:var(--faint)}
.tr-sig{display:flex;align-items:center;gap:8px;margin-top:6px}
.tr-score{font-variant-numeric:tabular-nums;font-weight:680;font-size:15px}
.tr-band{font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:600}
.band-urgent{color:var(--bad)}.band-attend{color:var(--warn)}
.band-watch{color:var(--primary)}.band-clear{color:var(--good)}
.tr-reason{font-size:12.5px;color:var(--muted);margin:7px 0 0;max-width:none}

/* Compass */
.cmp-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:520px){.cmp-grid{grid-template-columns:1fr}}
.cmp-arm{background:var(--card-2);border:1px solid var(--line);border-radius:10px;padding:13px}
.cmp-arm-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
.cmp-val{font-weight:680;font-size:17px;font-variant-numeric:tabular-nums}
.cmp-bar{height:5px;border-radius:99px;background:var(--line);margin:10px 0 8px;overflow:hidden}
.cmp-fill{display:block;height:100%;width:var(--w);border-radius:99px;transform-origin:left;
  animation:bar-grow 1.1s var(--ease) both}
.fill-cura{background:linear-gradient(90deg,var(--warm),var(--warm-2))}
.fill-onus{background:var(--bad)}
.fill-familia{background:var(--primary)}
.fill-fides{background:var(--warn)}
.cmp-meaning{font-size:11.5px;color:var(--faint);margin:0;max-width:none}
.cmp-why{margin-top:16px;padding:15px;background:var(--card-2);border:1px solid var(--line);
  border-radius:10px}
.cmp-why-h{font-size:12.5px;font-weight:620;margin:0 0 10px;color:var(--fg)}
.cmp-why ul{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:7px}
.cmp-why li{font-size:12.5px;color:var(--muted);display:flex;gap:10px}
.cmp-why li span{color:var(--primary);font-weight:660;font-variant-numeric:tabular-nums;
  flex-shrink:0;width:32px}
.cmp-why-f{font-size:11.5px;color:var(--faint);margin:12px 0 0;max-width:none;font-style:italic}

/* Ratio bar */
.ratio-track{position:relative;height:34px;border-radius:8px;background:var(--card-2);
  border:1px solid var(--line);overflow:hidden}
.ratio-fill{display:block;height:100%;width:var(--w);transform-origin:left;
  background:linear-gradient(90deg,var(--primary-2),var(--primary));
  animation:bar-grow 1.3s var(--ease) both}
.ratio-mark{position:absolute;top:0;bottom:0;left:var(--at);width:2px;background:var(--fg);
  opacity:.55}
.ratio-mark span{position:absolute;left:8px;top:50%;transform:translateY(-50%);font-size:10.5px;
  color:var(--fg);white-space:nowrap;font-weight:600;opacity:.9}
.ratio-note{font-size:11.5px;color:var(--faint);margin:10px 0 16px;max-width:none}

/* Generic rows */
.mk-rows{display:flex;flex-direction:column;gap:1px;background:var(--line);
  border:1px solid var(--line);border-radius:10px;overflow:hidden}
.mk-row{display:flex;justify-content:space-between;align-items:center;gap:14px;
  padding:11px 14px;background:var(--card);font-size:13px}
.mk-row span{color:var(--muted)}
.mk-row b{font-variant-numeric:tabular-nums;font-weight:620}
.mk-row.warn b{color:var(--warn)}.mk-row.bad b{color:var(--bad)}.mk-row.good b{color:var(--good)}
.mk-row b.flagged{color:var(--muted);font-weight:560}

/* Import */
.imp-cols{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:16px}
.imp-col{font-size:11.5px;padding:5px 10px;border-radius:6px;background:var(--card-2);
  border:1px solid var(--line);color:var(--muted);font-family:ui-monospace,SFMono-Regular,
  Menlo,monospace}
.imp-col.ok{border-color:color-mix(in srgb,var(--good) 30%,transparent);color:var(--good)}
.imp-foot{font-size:11.5px;color:var(--faint);margin:14px 0 0;max-width:none}

/* Claims tracker */
.track{list-style:none;padding:0;margin:0 0 16px;display:flex;gap:0;counter-reset:s}
.track-step{flex:1;position:relative;padding-top:22px;text-align:center}
.track-step::before{content:"";position:absolute;top:6px;left:0;right:50%;height:2px;
  background:var(--line)}
.track-step::after{content:"";position:absolute;top:6px;left:50%;right:0;height:2px;
  background:var(--line)}
.track-step:first-child::before,.track-step:last-child::after{display:none}
.track-step.done::before,.track-step.done::after,.track-step.active::before{background:var(--primary)}
.track-dot{position:absolute;top:0;left:50%;transform:translateX(-50%);width:13px;height:13px;
  border-radius:50%;background:var(--card);border:2px solid var(--line);z-index:1}
.track-step.done .track-dot{background:var(--primary);border-color:var(--primary)}
.track-step.active .track-dot{border-color:var(--primary);background:var(--card)}
.track-step.active .track-dot::after{content:"";position:absolute;inset:-6px;border-radius:50%;
  border:2px solid var(--primary);animation:pulse-ring 2s var(--ease-soft) infinite}
.track-label{display:block;font-size:12px;font-weight:570}
.track-step.todo .track-label{color:var(--faint)}
.track-when{display:block;font-size:10.5px;color:var(--faint);margin-top:2px}
`;

/**
 * The features index.
 *
 * Filtering is CSS-only: the radio inputs are visually hidden and the `:has()`
 * selector on the container hides non-matching cards. No JavaScript, so it
 * works before hydration would have finished, and every card stays in the DOM
 * where a crawler can read it regardless of which filter is selected.
 */
export const FEATURES_INDEX = `
.fx-filters{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 28px}
.fx-filters input{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}
.fx-filters label{display:inline-block;padding:8px 15px;border:1px solid var(--line);
  background:var(--card);border-radius:99px;font-size:14px;cursor:pointer;color:var(--muted);
  transition:all .2s var(--ease-soft);user-select:none}
.fx-filters label:hover{border-color:var(--line-2);color:var(--fg)}
.fx-filters input:checked+label{background:var(--primary);border-color:var(--primary);
  color:var(--primary-fg);font-weight:570}
.fx-filters input:focus-visible+label{outline:2px solid var(--primary);outline-offset:3px}
.fx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.fx-card{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);padding:22px;
  transition:transform .25s var(--ease),border-color .25s;
  display:flex;flex-direction:column}
.fx-card:hover{transform:translateY(-3px);border-color:var(--line-2)}
.fx-card h3{margin-bottom:8px}
.fx-card p{font-size:14.5px;color:var(--muted);margin:0}
/* Grid rows stretch to the tallest card, so without this the tag row floats
   wherever the copy happens to end and the grid reads as ragged. */
.fx-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:auto;padding-top:16px;align-items:center}
.fx-tag{font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;
  padding:3px 8px;border-radius:5px;background:var(--card-2);border:1px solid var(--line);
  color:var(--faint)}
.fx-count{font-size:13.5px;color:var(--faint);margin:0 0 20px}
.fx-shipped{font-size:11px;font-weight:620;color:var(--good)}
.fx-planned{font-size:11px;font-weight:620;color:var(--faint)}
`;
