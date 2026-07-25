import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useNriSummary } from './useNriSignals';
import { DIRECTION_META, DIRECTION_PRIORITY, type NriDirection } from '@/lib/nri/directions';

/**
 * useNriCompass — the ministry's current posture.
 *
 * WHAT:  Infers which of the four directions the org is actually operating in
 *        right now, from where the user is standing and where the pressure is.
 * WHERE: The compass launcher, the command center header, the dashboard.
 * WHY:   A posture is orientation, not a score. It answers "what kind of work
 *        is this week" — and knowing that a ministry is in an Onus week rather
 *        than a Cura week changes which numbers a director should be reading.
 *
 * Two inputs, in priority order:
 *   1. Live pressure — where the urgent signals actually are. A hospitalized
 *      member outranks whatever page you happen to be on.
 *   2. Route context — a gentler fallback, so the posture stays legible on a
 *      quiet day rather than defaulting to nothing.
 */

const ROUTE_POSTURE: { prefix: string; direction: NriDirection }[] = [
  { prefix: '/prayer', direction: 'cura' },
  { prefix: '/needs', direction: 'onus' },
  { prefix: '/households', direction: 'familia' },
  { prefix: '/imports', direction: 'familia' },
  { prefix: '/members', direction: 'fides' },
];

export interface NriPosture {
  direction: NriDirection;
  label: string;
  description: string;
  response: string;
  /** How the posture was reached — surfaced in the UI so it is never mysterious. */
  basis: 'pressure' | 'route' | 'default';
  /** Urgent + attend counts per direction, for the compass rose. */
  weights: Record<NriDirection, number>;
}

export function useNriCompass(): { posture: NriPosture; isLoading: boolean } {
  const location = useLocation();
  const { summary, isLoading } = useNriSummary();

  const posture = useMemo<NriPosture>(() => {
    const weights: Record<NriDirection, number> = { cura: 0, onus: 0, familia: 0, fides: 0 };

    for (const row of summary?.directions ?? []) {
      // Urgent counts double: three urgent cases is a different week from six
      // that merely need attention.
      weights[row.direction] = row.urgent * 2 + row.attend;
    }

    const totalPressure = Object.values(weights).reduce((sum, n) => sum + n, 0);

    if (totalPressure > 0) {
      const direction = (Object.keys(weights) as NriDirection[]).sort(
        (a, b) => weights[b] - weights[a] || DIRECTION_PRIORITY[b] - DIRECTION_PRIORITY[a],
      )[0];
      return { ...meta(direction), basis: 'pressure', weights };
    }

    const route = ROUTE_POSTURE.find((r) => location.pathname.startsWith(r.prefix));
    if (route) return { ...meta(route.direction), basis: 'route', weights };

    // Nothing pressing and nowhere in particular — care is the default posture.
    return { ...meta('cura'), basis: 'default', weights };
  }, [summary, location.pathname]);

  return { posture, isLoading };
}

function meta(direction: NriDirection) {
  const m = DIRECTION_META[direction];
  return { direction, label: m.label, description: m.description, response: m.response };
}
