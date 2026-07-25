import { useMemo, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useNriUserState } from './useNriUserState';

/**
 * useNriGuide — contextual orientation for someone new to the product.
 *
 * WHAT:  When a new user reaches a section for the first time, offers a short
 *        plain-language note about what they are looking at.
 * WHERE: The compass drawer.
 * WHY:   Auxilium introduces vocabulary — Cura, Onus, Familia, Fides, "share
 *        need", "sharing unit" — that nobody has seen before. The choice is
 *        between explaining it once, gently, in context, or watching people
 *        quietly avoid the parts they do not understand.
 *
 * Each section is shown once, ever. The guide is finite by construction, and
 * a user can end it permanently at any point.
 */

const GUIDE_WINDOW_DAYS = 14;

export interface GuideEntry {
  section: string;
  title: string;
  body: string;
  /** What to actually do here, so the note ends in an action, not a lecture. */
  tryThis?: string;
}

/**
 * Guide content, keyed by route prefix. Longest prefix wins, so
 * /members/mem_123 matches the member-detail entry rather than the list.
 */
const GUIDE: { prefix: string; entry: GuideEntry }[] = [
  {
    prefix: '/nri',
    entry: {
      section: 'command-center',
      title: 'The command center',
      body:
        'This is the list of people the ministry should look at next, most pressing first. ' +
        'Every score here is a sum of named reasons — open any row and you will see exactly ' +
        'which facts produced the number. Nothing is a black box.',
      tryThis: 'Expand a row to read why that member surfaced.',
    },
  },
  {
    prefix: '/members',
    entry: {
      section: 'members',
      title: 'Members',
      body:
        'Every person the ministry knows about. The coloured chips beside a name are their ' +
        'NRI directions: rose is Cura (care), amber is Onus (case weight), violet is Familia ' +
        '(household), blue-grey is Fides (staying in touch).',
      tryThis: 'Open someone with a chip to see what raised it.',
    },
  },
  {
    prefix: '/households',
    entry: {
      section: 'households',
      title: 'Households',
      body:
        'A household is the sharing unit — the family, not the individual. Eligibility, share ' +
        'amounts, and most care conversations happen at this level, which is why a member who ' +
        'is not linked to a household shows up as a Familia signal.',
      tryThis: 'Check whether any household is missing its dependents.',
    },
  },
  {
    prefix: '/imports',
    entry: {
      section: 'imports',
      title: 'Imports',
      body:
        'Bring a roster in from a spreadsheet. Auxilium guesses which column is which, shows ' +
        'you a full preview, and writes nothing to your member list until you say so. ' +
        'Duplicates are matched on email, then phone and surname, then name and date of birth.',
      tryThis: 'Upload a CSV — you can always discard the preview.',
    },
  },
  {
    prefix: '/needs',
    entry: {
      section: 'needs',
      title: 'Sharing needs',
      body:
        'Cases where the community shares a medical cost. A case that has not changed status ' +
        'in two weeks starts raising Onus on that member, because a stalled case means a ' +
        'family sitting at home with an unpaid bill and no news.',
      tryThis: 'Make sure every open case has an owner.',
    },
  },
  {
    prefix: '/prayer',
    entry: {
      section: 'prayer',
      title: 'The prayer board',
      body:
        'Care requests and pastoral follow-up. Requests are ordered by urgency and then by ' +
        'overdue follow-up rather than by date, so the person who has been waiting longest ' +
        'never gets quietly buried under newer ones.',
      tryThis: 'Log a follow-up and set when to check back.',
    },
  },
];

export function useNriGuide(isOpen: boolean, setOpen: (open: boolean) => void) {
  const location = useLocation();
  const {
    guideSectionsSeen, guideCompletedAt, markGuideSection, completeGuide, isLoading,
  } = useNriUserState();
  const lastTriggeredPath = useRef<string | null>(null);

  const currentEntry = useMemo<GuideEntry | null>(() => {
    // Longest matching prefix wins.
    const matches = GUIDE.filter((g) => location.pathname.startsWith(g.prefix));
    if (matches.length === 0) return null;
    return matches.sort((a, b) => b.prefix.length - a.prefix.length)[0].entry;
  }, [location.pathname]);

  const guideActive = !isLoading && !guideCompletedAt;
  const alreadySeen = currentEntry ? guideSectionsSeen.has(currentEntry.section) : true;

  // Open the drawer the first time someone reaches a section.
  useEffect(() => {
    if (!guideActive || !currentEntry || alreadySeen || isOpen) return;
    if (lastTriggeredPath.current === location.pathname) return;

    lastTriggeredPath.current = location.pathname;
    const timer = setTimeout(() => {
      setOpen(true);
      markGuideSection(currentEntry.section);
    }, 900);

    return () => clearTimeout(timer);
  }, [guideActive, currentEntry, alreadySeen, isOpen, location.pathname, setOpen, markGuideSection]);

  return {
    guideActive,
    /** The note to show now, or null when this section is already covered. */
    currentGuide: guideActive && currentEntry && !alreadySeen ? currentEntry : null,
    /** The note regardless of whether it has been seen — for the "show me again" path. */
    sectionGuide: currentEntry,
    completeGuide,
    markSectionSeen: markGuideSection,
    sectionsRemaining: GUIDE.length - guideSectionsSeen.size,
  };
}

export { GUIDE_WINDOW_DAYS };
