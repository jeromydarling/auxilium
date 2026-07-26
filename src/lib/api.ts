/**
 * The API client.
 *
 * Thin on purpose: one `request` that handles JSON, cookies, and errors, and
 * a set of typed wrappers. There is no client-side cache layer here — React
 * Query owns that, and two caches disagreeing is a bug generator.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public requestId?: string | null,
    /**
     * The whole error payload.
     *
     * Some endpoints answer with structure rather than a sentence — the
     * application form returns per-field validation issues, and collapsing
     * those into "Request failed (422)" would leave an applicant staring at a
     * form with no idea which field is wrong.
     */
    public payload?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    // Session cookie is HttpOnly; it must ride along on every call.
    credentials: 'same-origin',
    headers:
      init.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json', ...init.headers }
        : init.headers,
    ...init,
  });

  // The error shape is the only part of a response this function reads, so it
  // is the only part worth typing here; the success payload is the caller's `T`.
  type ErrorPayload = { error?: string; request_id?: string | null; issues?: unknown[] };

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson
    ? ((await response.json().catch(() => null)) as ErrorPayload | null)
    : null;

  if (!response.ok) {
    throw new ApiError(
      payload?.error ??
        (payload?.issues?.length
          ? 'Some answers need another look.'
          : `Request failed (${response.status}).`),
      response.status,
      payload?.request_id,
      payload,
    );
  }

  return payload as T;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
const patch = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
const put = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
const del = <T>(path: string) => request<T>(path, { method: 'DELETE' });

export const api = {
  health: () => get<HealthResponse>('/health'),

  auth: {
    me: () => get<MeResponse>('/auth/me'),
    login: (email: string, password: string) => post<MeResponse>('/auth/login', { email, password }),
    demo: () => post<MeResponse>('/auth/demo'),
    logout: () => post<{ ok: true }>('/auth/logout'),
    bootstrap: (body: { org_name: string; name: string; email: string; password: string }) =>
      post<MeResponse>('/auth/bootstrap', body),
  },

  members: {
    invitePortal: (id: string, email?: string) =>
      post<PortalInvite>(`/members/${id}/invite`, email ? { email } : {}),
    suspendPortal: (id: string) => post<{ ok: true }>(`/members/${id}/suspend-portal`),
    list: (params: { q?: string; status?: string; cursor?: string } = {}) =>
      get<{ items: MemberListItem[]; nextCursor: string | null }>(`/members${query(params)}`),
    get: (id: string) => get<MemberDetail>(`/members/${id}`),
    create: (body: Record<string, unknown>) => post<{ id: string }>('/members', body),
    update: (id: string, body: Record<string, unknown>) => patch<{ ok: true }>(`/members/${id}`, body),
    logContact: (id: string, body: { responded?: boolean; note?: string }) =>
      post<{ ok: true }>(`/members/${id}/contact`, body),
  },

  households: {
    list: (params: { q?: string } = {}) => get<{ items: HouseholdListItem[] }>(`/households${query(params)}`),
    get: (id: string) => get<HouseholdDetail>(`/households/${id}`),
    create: (body: Record<string, unknown>) => post<{ id: string }>('/households', body),
    addMember: (id: string, body: Record<string, unknown>) =>
      post<{ ok: true }>(`/households/${id}/members`, body),
  },

  needs: {
    list: (params: { status?: string; assigned_to?: string } = {}) =>
      get<{ items: NeedListItem[] }>(`/needs${query(params)}`),
    get: (id: string) => get<{ need: NeedListItem; updates: NeedUpdateItem[] }>(`/needs/${id}`),
    create: (body: Record<string, unknown>) => post<{ id: string }>('/needs', body),
    update: (id: string, body: Record<string, unknown>) => patch<{ ok: true }>(`/needs/${id}`, body),
    addUpdate: (id: string, body: { kind?: string; body?: string; meta?: Record<string, unknown> }) =>
      post<{ id: string }>(`/needs/${id}/updates`, body),
  },

  prayer: {
    list: (params: { status?: string; category?: string } = {}) =>
      get<{ items: PrayerListItem[] }>(`/prayer${query(params)}`),
    create: (body: Record<string, unknown>) => post<{ id: string }>('/prayer', body),
    update: (id: string, body: Record<string, unknown>) => patch<{ ok: true }>(`/prayer/${id}`, body),
    followUp: (id: string, body: { note?: string; next_followup_days?: number }) =>
      post<{ ok: true }>(`/prayer/${id}/followup`, body),
    pray: (id: string) => post<{ ok: true }>(`/prayer/${id}/pray`),
  },

  imports: {
    list: () => get<{ items: ImportListItem[] }>('/imports'),
    get: (id: string) => get<ImportDetail>(`/imports/${id}`),
    upload: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return request<ImportUploadResponse>('/imports', { method: 'POST', body: form });
    },
    remap: (id: string, mapping: Record<string, string | null>) =>
      post<Omit<ImportUploadResponse, 'import_id' | 'filename' | 'columns' | 'warnings'>>(
        `/imports/${id}/remap`, { mapping },
      ),
    commit: (id: string) => post<{ status: string; created?: number; updated?: number }>(`/imports/${id}/commit`),
  },

  nri: {
    summary: () => get<NriSummary>('/nri/summary'),
    triage: (params: { direction?: string; min_score?: number; limit?: number } = {}) =>
      get<{ items: TriageItem[]; directions: Record<string, DirectionMeta> }>(`/nri/triage${query(params)}`),
    signals: (subjectId: string) =>
      get<{ compass: Compass | null; explanations: Explanation[]; source: string }>(`/nri/signals/${subjectId}`),
    dismiss: (subjectId: string, direction: string) =>
      post<{ ok: true }>(`/nri/signals/${subjectId}/${direction}/dismiss`),
    restore: (subjectId: string, direction: string) =>
      post<{ ok: true }>(`/nri/signals/${subjectId}/${direction}/restore`),
    session: () => get<NriSessionResponse>('/nri/session'),
    saveState: (body: Record<string, unknown>) => post<{ ok: true }>('/nri/state', body),
    rules: () => get<{ version: string; rules: RuleReference[] }>('/nri/rules'),
    recompute: (memberId?: string) => post<{ recomputed?: number; status?: string }>('/nri/recompute', { member_id: memberId }),
  },

  admin: {
    onboarding: () => get<OnboardingSummary>('/admin/onboarding'),
    dismissOnboarding: () => post<{ ok: true }>('/admin/onboarding/dismiss'),
    users: () => get<{ items: TeamMember[] }>('/admin/users'),
    createUser: (body: Record<string, unknown>) => post<{ id: string }>('/admin/users', body),
    removeUser: (id: string) => del<{ ok: true }>(`/admin/users/${id}`),
    org: () => get<{ org: OrgRecord }>('/admin/org'),
    updateOrg: (body: Record<string, unknown>) => patch<{ ok: true }>('/admin/org', body),
    audit: (params: { subject_id?: string; action?: string } = {}) =>
      get<{ items: AuditEntry[] }>(`/admin/audit${query(params)}`),
  },

  integrity: {
    report: () => get<IntegrityResponse>('/integrity'),
    denials: () => get<{ findings: DenialFinding[]; total_at_stake_cents: number }>('/integrity/denials'),
    history: () => get<{ items: IntegritySnapshot[] }>('/integrity/history'),
    rules: () => get<{ version: string; rules: IntegrityRuleRef[] }>('/integrity/rules'),
    recompute: () => post<{ report: IntegrityReport }>('/integrity/recompute'),
    guidelines: () => get<{ items: GuidelineVersion[] }>('/integrity/guidelines'),
    recordContribution: (body: Record<string, unknown>) => post<{ id: string }>('/integrity/contributions', body),
    recordDisbursement: (body: Record<string, unknown>) => post<{ id: string }>('/integrity/disbursements', body),
  },

  claims: {
    validate: (body: Record<string, unknown>) =>
      post<{ issues: IntakeIssue[]; accepted: boolean; missing: string | null }>('/claims/validate', body),
    submit: (body: Record<string, unknown>) => post<{ id: string; sla_due_at: string }>('/claims', body),
    escalations: () => get<EscalationsResponse>('/claims/escalations'),
    tracker: (id: string) => get<TrackerResponse>(`/claims/${id}/tracker`),
    acknowledge: (id: string) => post<{ ok: true }>(`/claims/${id}/acknowledge`),
    deny: (id: string, body: { reason_code: string; guideline_ref: string; note?: string }) =>
      post<{ ok: true; warnings: string[] }>(`/claims/${id}/deny`, body),
    reprice: (id: string, body: { medicare_cents: number; multiplier_bps?: number }) =>
      post<{ id: string; result: RepricingResult }>(`/claims/${id}/reprice`, body),
    repricingSummary: () => get<{ summary: RepricingSummary }>('/claims/repricing/summary'),
    eligibility: (body: Record<string, unknown>) =>
      post<{ assessment: EligibilityAssessment }>('/claims/eligibility', body),
    appeals: (params: { status?: string } = {}) => get<{ items: AppealRecord[] }>(`/claims/appeals${query(params)}`),
    appeal: (needId: string, body: { member_statement: string }) =>
      post<{ id: string; due_at: string }>(`/claims/${needId}/appeal`, body),
    decideAppeal: (appealId: string, body: { outcome: string; decision_note: string; guideline_ref?: string }) =>
      post<{ ok: true }>(`/claims/appeals/${appealId}/decide`, body),
  },

  member: {
    login: (email: string, password: string) =>
      post<{ member: MemberIdentity }>('/member/login', { email, password }),
    logout: () => post<{ ok: true }>('/member/logout'),
    me: () => get<{ member: MemberIdentity; org: MemberOrg }>('/member/me'),
    invite: (token: string) =>
      get<{ email: string; name: string; org_name: string }>(`/member/invite/${token}`),
    acceptInvite: (token: string, password: string) =>
      post<{ ok: true; email: string }>(`/member/invite/${token}`, { password }),
    changePassword: (current: string, next: string) =>
      post<{ ok: true }>('/member/password', { current, next }),
    claims: () => get<{ claims: MemberClaim[] }>('/member/claims'),
    claim: (id: string) => get<MemberClaimDetail>(`/member/claims/${id}`),
  },

  /**
   * Unauthenticated. Reachable with no session at all, which is the point —
   * somebody applying to a ministry does not have an account yet.
   */
  public: {
    applicationForm: (slug: string) => get<PublicApplicationForm>(`/apply/${slug}`),
    apply: (slug: string, body: Record<string, unknown>) =>
      post<{ ok: true; reference: string }>(`/apply/${slug}`, body),
  },

  applications: {
    list: (params: { status?: string; suspicious?: boolean } = {}) =>
      get<{ items: ApplicationSummary[] }>(`/applications${query(params)}`),
    get: (id: string) =>
      get<{ application: ApplicationRecord; form: { version: number; sections: FormSection[] }; stale_form: boolean }>(
        `/applications/${id}`,
      ),
    setStatus: (id: string, body: { status: string; note?: string }) =>
      post<{ ok: true }>(`/applications/${id}/status`, body),
    accept: (id: string, note?: string) =>
      post<{ household_id: string; member_ids: string[] }>(`/applications/${id}/accept`, { note }),
    form: () =>
      get<{ form: PublishedForm; public_path: string; default_sections: FormSection[] }>(
        '/applications/form/current',
      ),
    saveForm: (body: { intro?: string; sections: FormSection[]; publish?: boolean }) =>
      put<{ ok: true; version: number; published: boolean }>('/applications/form/current', body),
  },

  knowledge: {
    index: () => get<KnowledgeIndex>('/knowledge'),
    article: (slug: string) => get<{ article: KbArticle }>(`/knowledge/article/${slug}`),
    search: (q: string) => get<{ results: KnowledgeHit[] }>(`/knowledge/search${query({ q })}`),
    ask: (question: string, memberId?: string) =>
      post<KnowledgeAnswer>('/knowledge/ask', { question, member_id: memberId }),
    unhelpful: (question: string, slug?: string) =>
      post<{ recorded: true }>('/knowledge/unhelpful', { question, slug }),
    gaps: () => get<{ items: KnowledgeGap[] }>('/knowledge/gaps'),
  },

  cms: {
    pages: () => get<{ items: CmsPageSummary[] }>('/cms/pages'),
    page: (id: string) => get<{ page: CmsPageRecord }>(`/cms/pages/${id}`),
    createPage: (body: Record<string, unknown>) => post<{ id: string; slug: string }>('/cms/pages', body),
    updatePage: (id: string, body: Record<string, unknown>) => patch<{ ok: true }>(`/cms/pages/${id}`, body),
  },
};

function query(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (entries.length === 0) return '';
  return `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}`;
}

// ── Response shapes ──────────────────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  app: string;
  env: string;
  checks: Record<string, string>;
  time: string;
}

export interface SessionUser {
  id: string;
  org_id: string;
  email: string;
  name: string;
  role: string;
}

export interface OrgRecord {
  id: string;
  name: string;
  slug: string;
  kind: string;
  timezone?: string;
  brand: Record<string, string | undefined>;
}

export interface MeResponse {
  user: SessionUser | null;
  org?: OrgRecord | null;
  demo?: boolean;
}

export type Direction = 'cura' | 'onus' | 'familia' | 'fides';
export type Band = 'clear' | 'watch' | 'attend' | 'urgent';

export interface ReasonCode {
  code: string;
  label: string;
  weight: number;
  detail?: string;
}

export interface Explanation {
  direction: Direction;
  label: string;
  score: number;
  band: Band;
  summary: string;
  reasons: ReasonCode[];
  recommended_response: string;
  source: string;
  updated_at: string;
  dismissed: boolean;
}

export interface Compass {
  subject_type: string;
  subject_id: string;
  scores: Record<Direction, number>;
  dominant: Direction;
  peak: number;
  band: Band;
  explanations: Explanation[];
}

export interface DirectionMeta {
  key: Direction;
  label: string;
  description: string;
  response: string;
  token: string;
}

export interface MemberListItem {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  member_number: string | null;
  household_id: string | null;
  last_contact_at: string | null;
  onboarding_complete: boolean;
  compass: Compass | null;
}

export interface MemberDetail {
  member: Record<string, unknown> & {
    id: string; first_name: string; last_name: string;
    email: string | null; phone: string | null; status: string;
  };
  household: Record<string, unknown> | null;
  needs: NeedListItem[];
  prayer_requests: PrayerListItem[];
  documents: { id: string; filename: string; size_bytes: number; created_at: string }[];
  compass: Compass | null;
}

export interface HouseholdListItem {
  id: string;
  name: string;
  member_count: number;
  dependent_count: number;
  city: string | null;
  state: string | null;
  share_amount_cents: number;
}

export interface HouseholdDetail {
  household: HouseholdListItem & Record<string, unknown>;
  members: (MemberListItem & { relationship: string; is_caregiver: number; is_dependent: number })[];
  needs: NeedListItem[];
}

export interface NeedListItem {
  id: string;
  member_id: string;
  first_name?: string;
  last_name?: string;
  title: string;
  description?: string | null;
  category: string;
  status: string;
  urgency: string;
  amount_requested_cents: number;
  amount_approved_cents: number;
  amount_shared_cents: number;
  assigned_to: string | null;
  assignee_name?: string | null;
  last_status_change_at: string | null;
  created_at: string;
}

export interface NeedUpdateItem {
  id: string;
  kind: string;
  body: string | null;
  author_name: string | null;
  created_at: string;
}

export interface PrayerListItem {
  id: string;
  member_id: string | null;
  first_name?: string | null;
  last_name?: string | null;
  title: string;
  body: string | null;
  category: string;
  status: string;
  is_urgent: number;
  prayer_count: number;
  assigned_to: string | null;
  assignee_name?: string | null;
  followup_due_at: string | null;
  followup_overdue?: number;
  created_at: string;
}

export interface ImportListItem {
  id: string;
  filename: string;
  status: string;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  duplicate_rows: number;
  created_count: number;
  updated_count: number;
  created_by_name: string | null;
  created_at: string;
}

export interface InferredColumn {
  header: string;
  field: string | null;
  confidence: number;
  basis: string;
  samples: string[];
}

export interface RowIssue {
  code: string;
  field: string | null;
  message: string;
  severity: 'error' | 'warning';
}

export interface PreviewRow {
  row_number: number;
  raw: Record<string, string>;
  normalized: Record<string, unknown> | null;
  action: 'create' | 'update' | 'skip' | 'error';
  issues: RowIssue[];
  matched_member_id: string | null;
  match_reason: string | null;
}

export interface ImportSummary {
  total: number; create: number; update: number; skip: number; error: number;
  with_warnings?: number;
}

export interface ImportUploadResponse {
  import_id: string;
  filename: string;
  columns: InferredColumn[];
  mapping: Record<string, string | null>;
  missing_required: string[];
  warnings: string[];
  summary: ImportSummary;
  households: string[];
  preview: PreviewRow[];
}

export interface ImportDetail {
  import: ImportListItem & { detected_headers: string[] };
  mapping: Record<string, string | null>;
  rows: PreviewRow[];
  summary: ImportSummary;
}

export interface NriSummary {
  members: number;
  households: number;
  open_needs: number;
  open_prayer_requests: number;
  open_need_amount_cents: number;
  directions: {
    direction: Direction;
    label: string;
    description: string;
    urgent: number;
    attend: number;
    watch: number;
  }[];
  source: string;
  computed_at: string;
}

export interface TriageItem {
  member: {
    id: string; first_name: string; last_name: string;
    email: string | null; phone: string | null; status: string;
    household_id: string | null; household_name: string | null;
    last_contact_at: string | null;
  };
  compass: Compass;
}

export interface Nudge {
  id: string;
  direction: Direction;
  kind: 'action' | 'awareness' | 'reflection';
  confidence: number;
  message: string;
  action?: { label: string; route: string };
}

export interface NriSessionResponse {
  nudges: Nudge[];
  inputs: Record<string, number>;
  state: {
    dismissed_nudge_ids: string[];
    last_auto_open_at: string | null;
    guide_sections_seen: string[];
    guide_completed_at: string | null;
    can_auto_open: boolean;
  };
}

export interface RuleReference {
  code: string;
  direction: Direction;
  label: string;
  weight: number;
  severity: string;
  rationale: string;
}

export interface TeamMember {
  id: string; email: string; name: string; role: string;
  last_seen_at: string | null; created_at: string;
}

export interface AuditEntry {
  id: string; action: string; actor_name: string | null; actor_kind: string;
  subject_type: string | null; subject_id: string | null;
  meta: Record<string, unknown>; created_at: string;
}

export interface CmsPageSummary {
  id: string; slug: string; title: string; status: string;
  published_at: string | null; updated_at: string;
}

export interface CmsPageRecord extends CmsPageSummary {
  blocks: Record<string, unknown>[];
}

// ── Integrity and claims shapes ──────────────────────────────────────────────

export type IntegrityBand = 'healthy' | 'watch' | 'concern' | 'critical';

export interface PeriodLedger {
  period: string;
  contributions_cents: number;
  fees_cents: number;
  shared_cents: number;
  administrative_cents: number;
  marketing_cents: number;
  related_party_cents: number;
  members_shared_with: number;
  top_payee_name: string | null;
  top_payee_cents: number;
}

export interface IntegrityReport {
  org_id: string;
  period: string;
  score: number;
  band: IntegrityBand;
  share_ratio_bps: number;
  trailing_share_ratio_bps: number;
  totals: PeriodLedger;
  reason_codes: ReasonCode[];
  summary: string;
  recommended_actions: string[];
  benchmark: {
    aca_individual_bps: number;
    aca_large_group_bps: number;
    ministry_target_bps: number;
    meets_ministry_target: boolean;
    meets_aca_individual: boolean;
  };
  computed_at: string;
}

export interface IntegrityResponse {
  report: IntegrityReport;
  ledger: PeriodLedger[];
  rules_version: string;
}

export interface IntegritySnapshot {
  period: string;
  contributions_cents: number;
  shared_cents: number;
  share_ratio_bps: number;
  integrity_score: number;
  band: IntegrityBand;
}

export interface IntegrityRuleRef {
  code: string;
  label: string;
  weight: number;
  provenance: string;
}

export interface DenialFinding {
  need_id: string;
  member_id: string;
  severity: 'info' | 'warning' | 'serious';
  code: string;
  message: string;
  amount_requested_cents: number;
  need: { first_name: string; last_name: string; title: string } | null;
}

export interface GuidelineVersion {
  version: string;
  effective_from: string;
  effective_to: string | null;
  provisions: {
    code: string;
    statement: string;
    supports_denial_codes: string[];
    waiting_period_days?: number;
    annual_limit_cents?: number;
    category?: string;
  }[];
}

export interface IntakeIssue {
  field: string;
  code: string;
  severity: 'blocking' | 'warning';
  message: string;
}

export interface SlaState {
  status: 'on_track' | 'due_soon' | 'breached' | 'severely_breached' | 'closed';
  days_over: number;
  days_remaining: number;
  due_at: string | null;
  acknowledged: boolean;
  days_unacknowledged: number;
  member_message: string;
  needs_escalation: boolean;
}

export interface EscalationItem {
  claim: {
    id: string; status: string; title: string; amount_requested_cents: number;
    member_id: string; first_name: string; last_name: string;
    assignee_name: string | null; submitted_at: string | null;
  };
  sla: SlaState;
}

export interface EscalationsResponse {
  items: EscalationItem[];
  total_at_stake_cents: number;
  sla_days: number;
}

export interface TrackerStep {
  key: string;
  label: string;
  state: 'done' | 'current' | 'upcoming' | 'failed';
  at: string | null;
}

export interface TrackerResponse {
  claim: {
    id: string; status: string; title: string; amount_requested_cents: number;
    denial_reason_code: string | null; denial_note: string | null;
  };
  sla: SlaState;
  steps: TrackerStep[];
}

export interface RepricingResult {
  billed_cents: number;
  medicare_cents: number;
  multiplier_bps: number;
  repriced_cents: number;
  savings_cents: number;
  savings_bps: number;
  billed_multiple_bps: number;
  worthwhile: boolean;
  explanation: string;
}

export interface RepricingSummary {
  claims: number;
  billed_cents: number;
  repriced_cents: number;
  savings_cents: number;
  savings_bps: number;
  worthwhile_claims: number;
}

export interface EligibilityAssessment {
  verdict: 'likely_shared' | 'uncertain' | 'likely_denied' | 'excluded';
  confidence: number;
  factors: { code: string; label: string; detail: string; direction: 'supports' | 'against' }[];
  member_guidance: string;
  guideline_version: string | null;
  next_steps: string[];
}

export interface AppealRecord {
  id: string;
  need_id: string;
  member_id: string;
  status: string;
  member_statement: string;
  decision_note: string | null;
  submitted_at: string;
  due_at: string | null;
  overdue: number;
  first_name: string;
  last_name: string;
  claim_title: string;
  amount_requested_cents: number;
  denial_reason_code: string | null;
}

// ── Knowledge base ───────────────────────────────────────────────────────────

export interface KbSource {
  label: string;
  url: string;
  authority?: 'law' | 'regulator' | 'court' | 'research' | 'industry' | 'reporting';
}

export interface KbStep {
  title: string;
  body: string;
  because?: string;
}

export interface KbArticle {
  slug: string;
  audience: 'staff' | 'member' | 'both';
  category: string;
  title: string;
  summary: string;
  body: { heading?: string; paragraphs: string[] }[];
  steps?: KbStep[];
  synonyms?: string[];
  sources?: KbSource[];
  related?: string[];
  appPath?: string;
  updated: string;
}

export interface KnowledgeIndex {
  audience: 'staff' | 'member';
  categories: { category: string; articles: { slug: string; title: string; summary: string }[] }[];
  suggested: string[];
}

export interface KnowledgeHit {
  slug: string;
  title: string;
  summary: string;
  category: string;
  /** Which query terms matched — this is what makes a result explainable. */
  matched: string[];
}

/**
 * An answer.
 *
 * `confidence` is about retrieval, not truth: "none" means say so rather than
 * assembling a plausible paragraph out of the nearest three articles. `limits`
 * is never decoration — it carries the disclaimers that keep an answer about a
 * future sharing decision from reading as a decision.
 */
export interface KnowledgeAnswer {
  question: string;
  lead: string;
  aboutYourAccount: string[];
  steps: KbStep[];
  articles: { slug: string; title: string; summary: string; appPath?: string }[];
  sources: KbSource[];
  limits: string[];
  confidence: 'high' | 'partial' | 'none';
}

export interface KnowledgeGap {
  question: string;
  asked_count: number;
  last_asked_at: string;
}

// ── Member portal ────────────────────────────────────────────────────────────

export interface MemberIdentity {
  id: string;
  member_id: string;
  org_id: string;
  email: string;
  name: string;
  role: 'member';
}

export interface MemberOrg {
  name: string;
  slug: string;
  brand: string;
}

export interface PortalInvite {
  invite_url: string;
  invite_path: string;
  email: string;
  expires_at: string;
  name: string;
}

export interface MemberClaimRecord {
  id: string;
  status: string;
  title: string;
  submitted_at: string | null;
  created_at: string;
  sla_due_at: string | null;
  first_response_at: string | null;
  last_status_change_at: string | null;
  amount_requested_cents: number;
  denial_reason_code: string | null;
  denial_guideline_ref: string | null;
  denial_note: string | null;
}

export interface MemberClaimSla {
  status: 'on_track' | 'due_soon' | 'breached' | 'severely_breached' | 'closed';
  days_over: number;
  days_remaining: number;
  due_at: string | null;
  acknowledged: boolean;
  days_unacknowledged: number;
  member_message: string;
  needs_escalation: boolean;
}

export interface MemberClaim {
  claim: MemberClaimRecord;
  sla: MemberClaimSla;
}

export interface MemberClaimDetail extends MemberClaim {
  steps: { key: string; label: string; state: 'done' | 'current' | 'upcoming' | 'failed'; at: string | null }[];
}

// ── Ministry setup ───────────────────────────────────────────────────────────

export interface OnboardingStep {
  key: string;
  title: string;
  body: string;
  /** What actually breaks while this is undone. Never "recommended". */
  consequence: string;
  status: 'done' | 'todo';
  weight: 'blocking' | 'important' | 'optional';
  route: string;
  actionLabel: string;
}

export interface OnboardingSummary {
  steps: OnboardingStep[];
  done: number;
  total: number;
  blocking: OnboardingStep[];
  complete: boolean;
  visible: boolean;
}

// ── Applications ─────────────────────────────────────────────────────────────

export interface FormField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'email' | 'phone' | 'date' | 'number' | 'select' | 'checkbox' | 'attestation';
  help?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  statement?: string;
  maxLength?: number;
}

export interface FormSection {
  key: string;
  title: string;
  description?: string;
  fields: FormField[];
}

export interface PublishedForm {
  version: number;
  intro?: string;
  sections: FormSection[];
  published: boolean;
}

export interface HouseholdApplicant {
  first_name: string;
  last_name: string;
  date_of_birth?: string;
  relationship?: string;
}

export interface ApplicationSummary {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  status: string;
  submitted_at: string;
  first_opened_at: string | null;
  requested_start_date: string | null;
  household: HouseholdApplicant[];
  spam_score: number;
  decided_at: string | null;
}

export interface ApplicationRecord extends ApplicationSummary {
  date_of_birth: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  answers: Record<string, Record<string, string | boolean>>;
  form_version: number;
  guideline_version_id: string | null;
  decision_note: string | null;
  spam_reasons: string[];
  created_household_id: string | null;
  created_member_id: string | null;
}

/** The public form. Fetched without a session, so it carries nothing identifying. */
export interface PublicApplicationForm {
  org_name: string;
  version: number;
  intro?: string;
  sections: FormSection[];
  health_note: string;
}

export interface ApplicationIssue {
  path: string;
  message: string;
}
