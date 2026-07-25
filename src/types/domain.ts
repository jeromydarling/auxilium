/**
 * Auxilium domain types. These mirror the D1 schema closely but are the shape
 * the app actually passes around: JSON columns are already parsed, integer
 * booleans are already booleans.
 *
 * The naming is deliberate and consistent everywhere in the product:
 *   • a *member* is a person
 *   • a *household* is the sharing unit those people belong to
 *   • a *need* is a request for the community to share a medical cost
 *   • a *signal* is one directional NRI reading about one subject
 */

export type OrgKind = 'ministry' | 'demo';
export type UserRole = 'owner' | 'admin' | 'staff' | 'care' | 'readonly';
export type MemberStatus = 'active' | 'pending' | 'lapsed' | 'inactive';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  brand: OrgBrand;
  kind: OrgKind;
  timezone: string;
  created_at: string;
  updated_at: string;
}

/** White-label CMS shell settings. All optional — an unbranded org renders the Auxilium defaults. */
export interface OrgBrand {
  primaryColor?: string;
  wordmark?: string;
  logoUrl?: string;
  supportEmail?: string;
  supportPhone?: string;
  tagline?: string;
}

export interface User {
  id: string;
  org_id: string;
  email: string;
  name: string;
  role: UserRole;
  last_seen_at: string | null;
  created_at: string;
}

export interface Member {
  id: string;
  org_id: string;
  household_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  status: MemberStatus;
  member_number: string | null;
  joined_at: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  last_contact_at: string | null;
  last_response_at: string | null;
  onboarding_complete: boolean;
  financial_stress: boolean;
  notes: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface Household {
  id: string;
  org_id: string;
  name: string;
  member_count: number;
  dependent_count: number;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  share_amount_cents: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type HouseholdRelationship = 'primary' | 'spouse' | 'dependent' | 'member' | 'other';

export interface HouseholdMember {
  id: string;
  org_id: string;
  household_id: string;
  member_id: string;
  relationship: HouseholdRelationship;
  is_caregiver: boolean;
  is_dependent: boolean;
  joined_at: string | null;
}

export type NeedCategory =
  | 'medical' | 'surgical' | 'maternity' | 'emergency'
  | 'chronic' | 'dental' | 'vision' | 'mental_health' | 'other';

export type NeedStatus =
  | 'submitted' | 'in_review' | 'needs_info' | 'approved'
  | 'sharing' | 'completed' | 'declined' | 'withdrawn';

export type NeedUrgency = 'low' | 'normal' | 'high' | 'critical';

export interface Need {
  id: string;
  org_id: string;
  member_id: string;
  household_id: string | null;
  title: string;
  description: string | null;
  category: NeedCategory;
  status: NeedStatus;
  amount_requested_cents: number;
  amount_approved_cents: number;
  amount_shared_cents: number;
  incident_date: string | null;
  submitted_at: string | null;
  last_status_change_at: string | null;
  assigned_to: string | null;
  urgency: NeedUrgency;
  created_at: string;
  updated_at: string;
}

export type NeedUpdateKind = 'note' | 'status_change' | 'document' | 'payment' | 'outreach';

export interface NeedUpdate {
  id: string;
  need_id: string;
  author_id: string | null;
  kind: NeedUpdateKind;
  body: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export type PrayerCategory =
  | 'general' | 'health' | 'hospitalization' | 'bereavement'
  | 'birth' | 'financial' | 'family' | 'spiritual';

export type PrayerStatus = 'open' | 'praying' | 'answered' | 'closed';

export interface PrayerRequest {
  id: string;
  org_id: string;
  member_id: string | null;
  household_id: string | null;
  need_id: string | null;
  title: string;
  body: string | null;
  category: PrayerCategory;
  status: PrayerStatus;
  visibility: 'staff' | 'members' | 'public';
  is_urgent: boolean;
  prayer_count: number;
  assigned_to: string | null;
  followup_due_at: string | null;
  last_followup_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentRecord {
  id: string;
  org_id: string;
  subject_type: 'member' | 'household' | 'need' | 'import' | 'org';
  subject_id: string | null;
  r2_key: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
}

export interface CmsPage {
  id: string;
  org_id: string;
  slug: string;
  title: string;
  blocks: CmsBlock[];
  status: 'draft' | 'published';
  published_at: string | null;
  updated_at: string;
}

export type CmsBlock =
  | { type: 'hero'; heading: string; subheading?: string; ctaLabel?: string; ctaHref?: string }
  | { type: 'richText'; body: string }
  | { type: 'faq'; items: { question: string; answer: string }[] }
  | { type: 'contact'; email?: string; phone?: string; note?: string };

/** Paginated list envelope used by every list endpoint. Keyset, not offset. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
