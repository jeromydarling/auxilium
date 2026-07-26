/**
 * Product mockups: the real interface, rendered as HTML.
 *
 * These are not screenshots and not React. They are server-rendered replicas of
 * the application's actual screens, built from the same tokens, sitting inside
 * a chromeless browser frame.
 *
 * Rendering them rather than shipping PNGs buys four things that matter more
 * here than fidelity to a pixel:
 *
 *   • They are real text. A crawler and an assistant summarizing this category
 *     read "Okonkwo household · Familia 78 · attend", not alt text on an image.
 *   • They reflow. A screenshot of a dashboard is unreadable on a phone; this
 *     collapses.
 *   • They inherit light and dark mode from the visitor's system.
 *   • They cost a few kilobytes of markup instead of a few hundred of image,
 *     and they never go stale against a redesign the way a screenshot does.
 *
 * The data shown is the demo ministry's — the same five personas in
 * schema/seed.sql — so what a visitor sees here is what they get when they
 * click through to the demo, rather than an invented best case.
 */

import { esc } from './esc';

/** The chromeless frame everything sits in. */
export function browserFrame(label: string, body: string, extraClass = ''): string {
  return `<div class="bframe ${extraClass}">
    <div class="bframe-bar">
      <span class="bdot"></span><span class="bdot"></span><span class="bdot"></span>
      <span class="bframe-url">${esc(label)}</span>
    </div>
    <div class="bframe-body">${body}</div>
  </div>`;
}

type Band = 'clear' | 'watch' | 'attend' | 'urgent';

interface TriageRow {
  name: string;
  household: string;
  direction: string;
  score: number;
  band: Band;
  reason: string;
}

const TRIAGE: TriageRow[] = [
  {
    name: 'Grace Okonkwo',
    household: 'Okonkwo household',
    direction: 'Cura',
    score: 88,
    band: 'urgent',
    reason: 'Hospitalization logged · no contact in 21 days',
  },
  {
    name: 'Daniel Reyes',
    household: 'Reyes household',
    direction: 'Onus',
    score: 74,
    band: 'attend',
    reason: 'Claim past its 17-day due date · never acknowledged',
  },
  {
    name: 'Marta Kowalski',
    household: 'Kowalski household',
    direction: 'Familia',
    score: 61,
    band: 'attend',
    reason: '7 people in the household · new dependent added',
  },
  {
    name: 'Samuel Boone',
    household: 'Boone household',
    direction: 'Fides',
    score: 42,
    band: 'watch',
    reason: 'Two outreach attempts unanswered · renewal in 38 days',
  },
];

/** The triage board — the screen staff actually live in. */
export function triageBoard(): string {
  const rows = TRIAGE.map(
    (r) => `<div class="tr-row">
      <div class="tr-who">
        <span class="tr-name">${esc(r.name)}</span>
        <span class="tr-house">${esc(r.household)}</span>
      </div>
      <div class="tr-sig">
        <span class="chip chip-${r.direction.toLowerCase()}">${esc(r.direction)}</span>
        <span class="tr-score band-${r.band}">${r.score}</span>
        <span class="tr-band band-${r.band}">${esc(r.band)}</span>
      </div>
      <p class="tr-reason">${esc(r.reason)}</p>
    </div>`,
  ).join('');

  return browserFrame(
    'auxilium.app/triage',
    `<div class="mk mk-triage">
      <div class="mk-head">
        <div><p class="mk-title">Who needs attention today</p>
        <p class="mk-sub">4 of 128 members · ranked by band, then by direction</p></div>
        <span class="mk-pill">Live</span>
      </div>
      ${rows}
    </div>`,
  );
}

/**
 * The NRI compass.
 *
 * Four directions on one dial. The point of the visual is that a member can
 * carry several at once — "high Onus, low Cura" is a billing problem, "high
 * Onus and high Cura" is a family in crisis — so the four arms are shown
 * together rather than as a single headline number.
 */
export function nriCompass(): string {
  const arms = [
    { key: 'cura', label: 'Cura', value: 88, meaning: 'Someone is hurting' },
    { key: 'onus', label: 'Onus', value: 64, meaning: 'The case has stalled' },
    { key: 'familia', label: 'Familia', value: 41, meaning: 'Household complexity' },
    { key: 'fides', label: 'Fides', value: 22, meaning: 'Still in touch' },
  ];

  return browserFrame(
    'auxilium.app/members/grace-okonkwo',
    `<div class="mk mk-compass">
      <div class="mk-head">
        <div><p class="mk-title">Grace Okonkwo</p>
        <p class="mk-sub">Okonkwo household · primary contact</p></div>
        <span class="mk-pill pill-urgent">Urgent</span>
      </div>
      <div class="cmp-grid">
        ${arms.map((a) => `<div class="cmp-arm">
          <div class="cmp-arm-top">
            <span class="chip chip-${a.key}">${esc(a.label)}</span>
            <span class="cmp-val">${a.value}</span>
          </div>
          <div class="cmp-bar"><i class="cmp-fill fill-${a.key}" style="--w:${a.value}%"></i></div>
          <p class="cmp-meaning">${esc(a.meaning)}</p>
        </div>`).join('')}
      </div>
      <div class="cmp-why">
        <p class="cmp-why-h">Why 88, exactly</p>
        <ul>
          <li><span>+40</span> Hospitalization logged in the last 30 days</li>
          <li><span>+30</span> No contact recorded in 21 days</li>
          <li><span>+18</span> Open prayer request past its follow-up date</li>
        </ul>
        <p class="cmp-why-f">A score is the sum of the rules that matched. Add it up yourself.</p>
      </div>
    </div>`,
  );
}

/** The integrity report — the share ratio against a floor nobody makes them meet. */
export function integrityCard(): string {
  return browserFrame(
    'auxilium.app/integrity',
    `<div class="mk mk-integrity">
      <div class="mk-head">
        <div><p class="mk-title">Share ratio, trailing 12 months</p>
        <p class="mk-sub">Of every dollar members contributed, what reached medical costs</p></div>
        <span class="mk-pill pill-good">89.0%</span>
      </div>
      <div class="ratio">
        <div class="ratio-track">
          <i class="ratio-fill" style="--w:89%"></i>
          <i class="ratio-mark" style="--at:80%"><span>ACA floor 80.0%</span></i>
        </div>
        <p class="ratio-note">Health care sharing ministries are not held to this floor.
        Clearing a bar you are not held to is the point.</p>
      </div>
      <div class="mk-rows">
        <div class="mk-row"><span>Contributions received</span><b>$4,182,900</b></div>
        <div class="mk-row"><span>Shared to medical costs</span><b>$3,722,781</b></div>
        <div class="mk-row"><span>Related-party payments</span><b class="flagged">$0 · disclosed</b></div>
        <div class="mk-row warn"><span>Months with money in, nothing out</span><b>0</b></div>
      </div>
    </div>`,
  );
}

/** The import preview — the messy-spreadsheet moment. */
export function importPreview(): string {
  return browserFrame(
    'auxilium.app/imports/new',
    `<div class="mk mk-import">
      <div class="mk-head">
        <div><p class="mk-title">members-export-final(2).csv</p>
        <p class="mk-sub">412 rows · 11 of 11 columns matched automatically</p></div>
        <span class="mk-pill">Preview</span>
      </div>
      <div class="imp-cols">
        <span class="imp-col ok">Mbr # → member_id</span>
        <span class="imp-col ok">Last, First → name</span>
        <span class="imp-col ok">DOB → date_of_birth</span>
        <span class="imp-col ok">Ph → phone</span>
        <span class="imp-col ok">HH → household</span>
      </div>
      <div class="mk-rows">
        <div class="mk-row"><span>Ready to import</span><b>396</b></div>
        <div class="mk-row"><span>Matched to an existing member</span><b>12 · will update</b></div>
        <div class="mk-row warn"><span>Imported with a warning</span><b>3</b></div>
        <div class="mk-row bad"><span>Blocked — no name on the row</span><b>1</b></div>
      </div>
      <p class="imp-foot">Nothing is written until you commit. A blank cell means
      &ldquo;not provided&rdquo;, never &ldquo;delete what you know&rdquo;.</p>
    </div>`,
  );
}

/** The claims tracker — what the member sees. */
export function claimsTracker(): string {
  const steps = [
    { label: 'Submitted', state: 'done', when: 'Mar 4' },
    { label: 'Acknowledged', state: 'done', when: 'Mar 5' },
    { label: 'In review', state: 'active', when: 'Mar 9' },
    { label: 'Shared', state: 'todo', when: 'due Mar 21' },
  ];

  return browserFrame(
    'auxilium.app/claims/need_8fk2',
    `<div class="mk mk-claims">
      <div class="mk-head">
        <div><p class="mk-title">Claim #need_8fk2</p>
        <p class="mk-sub">Mercy General · outpatient procedure · $14,280 billed</p></div>
        <span class="mk-pill">Day 5 of 17</span>
      </div>
      <ol class="track">
        ${steps.map((s) => `<li class="track-step ${s.state}">
          <span class="track-dot"></span>
          <span class="track-label">${esc(s.label)}</span>
          <span class="track-when">${esc(s.when)}</span>
        </li>`).join('')}
      </ol>
      <div class="mk-rows">
        <div class="mk-row"><span>Repriced against Medicare allowable</span><b>$8,940</b></div>
        <div class="mk-row good"><span>Proposed saving</span><b>$5,340 · 37%</b></div>
      </div>
      <p class="imp-foot">Every proposal records its basis, so it reads as a negotiation
      rather than a refusal to pay.</p>
    </div>`,
  );
}
