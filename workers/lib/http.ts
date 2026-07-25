import type { AppContext } from './auth';

/**
 * Read a route parameter.
 *
 * Hono types `c.req.param()` as `string | undefined` once middleware sits in
 * the handler chain, because it can no longer infer the path literal. The
 * router only dispatches to a handler when every segment matched, so a param
 * named in the route is always present — this helper states that once, here,
 * instead of scattering non-null assertions through every handler.
 */
export function param(c: AppContext, name: string): string {
  return c.req.param(name) as string;
}
