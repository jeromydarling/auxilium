import { useEffect } from 'react';
import { resolveBrand, brandCss, type BrandIntent } from '@/lib/brand/tokens';

/**
 * Apply a ministry's brand to whatever is rendering.
 *
 * Writes the resolved palette to a `<style>` element rather than inline styles
 * on a wrapper, so brand tokens are available to everything on the page —
 * including portals, dialogs, and anything else that escapes the React tree.
 *
 * The same `resolveBrand` runs here and on the server. A member moving between
 * the portal and the ministry's public site must not see two slightly different
 * greens, and two implementations of "what colour is this ministry" would drift
 * until somebody noticed.
 */
export function useBrand(intent: Partial<BrandIntent> | undefined | null, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const id = 'auxilium-brand';
    const style = document.getElementById(id) ?? document.createElement('style');
    style.id = id;
    style.textContent = brandCss(resolveBrand(intent ?? {}));
    if (!style.parentNode) document.head.appendChild(style);

    return () => {
      // Removed on unmount so a staff member who signs out of the portal does
      // not keep somebody else's brand on the login screen.
      document.getElementById(id)?.remove();
    };
  }, [intent, enabled]);
}
