/**
 * The Worker's bindings, mirroring wrangler.toml.
 *
 * Keep this in sync by hand rather than relying on `wrangler types` output —
 * a generated file that nobody reads is where binding drift hides.
 */

export interface Env {
  // Data plane
  DB: D1Database;
  DOCUMENTS: R2Bucket;
  CACHE: KVNamespace;
  CONFIG: KVNamespace;
  IMPORT_QUEUE: Queue<ImportJob>;
  SIGNAL_QUEUE: Queue<SignalJob>;
  ASSETS: Fetcher;

  // Non-secret vars
  APP_ENV: 'development' | 'preview' | 'production';
  APP_NAME: string;
  NRI_SIGNAL_TTL_SECONDS: string;
  IMPORT_MAX_ROWS: string;

  // Secrets — every one of these is optional at the type level on purpose.
  // Auxilium runs fully without them; see .dev.vars.example for what each
  // unlocks and how the product degrades when it is absent.
  JWT_SECRET?: string;
  SESSION_SECRET?: string;
  ANTHROPIC_API_KEY?: string;
}

/** Queue message: work to do on an import after the file lands. */
export type ImportJob =
  | { kind: 'analyze'; org_id: string; import_id: string; user_id: string | null }
  | { kind: 'commit'; org_id: string; import_id: string; user_id: string | null };

/** Queue message: recompute NRI signals. */
export type SignalJob =
  | { kind: 'member'; org_id: string; member_id: string; reason: string }
  | { kind: 'org'; org_id: string; reason: string };

export function intVar(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
