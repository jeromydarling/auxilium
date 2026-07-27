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
  /**
   * Cloudflare Email Sending. Optional at the type level like every other
   * degradable dependency — an environment without the binding still raises and
   * stores alerts, it just cannot deliver them.
   */
  EMAIL?: SendEmail;

  // Non-secret vars
  APP_ENV: 'development' | 'preview' | 'production';
  APP_NAME: string;
  /**
   * The platform's own hostname. Anything else arriving on a Host header is a
   * candidate custom domain — which is why this is configured rather than
   * inferred: guessing from the request would make every request to an
   * unrecognised host a database lookup, and would make the *platform's* own
   * site resolvable as a ministry the moment somebody claimed the hostname.
   */
  APP_HOST?: string;

  /**
   * Operational alert delivery.
   *
   * All optional. With none of them set, alerts are still raised and stored —
   * they simply are not delivered, and `/api/health` says so. An unconfigured
   * mail path must mean an undelivered alert, never a lost one.
   */
  /**
   * The From address. Must be on a domain in this Cloudflare account: a
   * routing domain at minimum, and an onboarded *sending* domain before mail
   * can reach an address that has not been verified in the account — which is
   * every ministry owner. See workers/lib/email.ts.
   */
  ALERT_FROM_EMAIL?: string;
  /** Where operator alerts go. Comma-separated for more than one. */
  ALERT_EMAIL?: string;
  NRI_SIGNAL_TTL_SECONDS: string;
  IMPORT_MAX_ROWS: string;

  // Secrets — every one of these is optional at the type level on purpose.
  // Auxilium runs fully without them; see .dev.vars.example for what each
  // unlocks and how the product degrades when it is absent.
  JWT_SECRET?: string;
  SESSION_SECRET?: string;
  ANTHROPIC_API_KEY?: string;
  /**
   * Stripe. Absent means billing is switched off, not broken: onboarding and
   * invoicing report "not configured" and every other part of the product —
   * including the contributions ledger and the share ratio — works untouched.
   */
  STRIPE_SECRET_KEY?: string;
  /** Required for the webhook to accept anything. Unsigned events are refused. */
  STRIPE_WEBHOOK_SECRET?: string;
  /** Where Stripe returns a ministry after onboarding. Falls back to the request origin. */
  STRIPE_RETURN_URL?: string;
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
