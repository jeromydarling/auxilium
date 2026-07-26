/**
 * HTML escaping, in its own module.
 *
 * Extracted from the renderer so the mockup and brand modules can use it
 * without importing the renderer — which imports them. Small file, but it is
 * the one function every interpolated value in the entire public site passes
 * through, so it should not be reachable only via a cycle.
 */
export function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
