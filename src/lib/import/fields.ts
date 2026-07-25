/**
 * The canonical member fields an import can populate, and the header aliases
 * that map onto them.
 *
 * Real ministry rosters arrive as whatever the last system exported: "Mbr #",
 * "PRIMARY EMAIL ADDRESS", "DOB", "Household Name", "Home Phone". The alias
 * list is the accumulated knowledge of what those columns are actually called.
 * Adding an alias is a one-line change and should be the first thing you do
 * when a ministry's file doesn't auto-map.
 */

export const CANONICAL_FIELDS = [
  'first_name', 'last_name', 'email', 'phone', 'date_of_birth',
  'member_number', 'status', 'joined_at',
  'address_line1', 'address_line2', 'city', 'state', 'postal_code',
  'household_name', 'relationship', 'is_dependent', 'is_caregiver',
  'share_amount', 'notes',
] as const;

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

export interface FieldSpec {
  key: CanonicalField;
  label: string;
  required: boolean;
  /** Lowercased, punctuation-stripped header forms that map to this field. */
  aliases: string[];
  hint?: string;
}

export const FIELD_SPECS: FieldSpec[] = [
  {
    key: 'first_name',
    label: 'First name',
    required: true,
    aliases: ['first name', 'firstname', 'fname', 'given name', 'first', 'member first name'],
  },
  {
    key: 'last_name',
    label: 'Last name',
    required: true,
    aliases: ['last name', 'lastname', 'lname', 'surname', 'family name', 'last', 'member last name'],
  },
  {
    key: 'email',
    label: 'Email',
    required: false,
    aliases: ['email', 'email address', 'e mail', 'primary email', 'primary email address',
              'member email', 'contact email', 'home email'],
    hint: 'Used as the strongest duplicate match.',
  },
  {
    key: 'phone',
    label: 'Phone',
    required: false,
    aliases: ['phone', 'phone number', 'mobile', 'cell', 'cell phone', 'home phone',
              'primary phone', 'telephone', 'contact number'],
  },
  {
    key: 'date_of_birth',
    label: 'Date of birth',
    required: false,
    aliases: ['dob', 'date of birth', 'birth date', 'birthdate', 'birthday', 'born'],
    hint: 'Combined with the name for duplicate matching when there is no email or phone.',
  },
  {
    key: 'member_number',
    label: 'Member number',
    required: false,
    aliases: ['member number', 'member id', 'member no', 'mbr', 'mbr #', 'mbr no',
              'membership number', 'id', 'external id', 'account number'],
  },
  {
    key: 'status',
    label: 'Status',
    required: false,
    aliases: ['status', 'member status', 'membership status', 'active', 'state of membership'],
  },
  {
    key: 'joined_at',
    label: 'Join date',
    required: false,
    aliases: ['joined', 'join date', 'joined at', 'member since', 'start date',
              'enrollment date', 'effective date'],
  },
  {
    key: 'address_line1',
    label: 'Address',
    required: false,
    aliases: ['address', 'address 1', 'address line 1', 'street', 'street address', 'addr1'],
  },
  {
    key: 'address_line2',
    label: 'Address line 2',
    required: false,
    aliases: ['address 2', 'address line 2', 'apt', 'unit', 'suite', 'addr2'],
  },
  { key: 'city', label: 'City', required: false, aliases: ['city', 'town'] },
  { key: 'state', label: 'State', required: false, aliases: ['state', 'province', 'st', 'region'] },
  {
    key: 'postal_code',
    label: 'Postal code',
    required: false,
    aliases: ['zip', 'zip code', 'postal', 'postal code', 'postcode'],
  },
  {
    key: 'household_name',
    label: 'Household',
    required: false,
    aliases: ['household', 'household name', 'family', 'family name', 'household id',
              'family unit', 'sharing unit'],
    hint: 'Rows sharing a household name are grouped into one household.',
  },
  {
    key: 'relationship',
    label: 'Relationship',
    required: false,
    aliases: ['relationship', 'relation', 'role', 'household role', 'member type'],
  },
  {
    key: 'is_dependent',
    label: 'Dependent',
    required: false,
    aliases: ['dependent', 'is dependent', 'child', 'is child'],
  },
  {
    key: 'is_caregiver',
    label: 'Caregiver',
    required: false,
    aliases: ['caregiver', 'is caregiver', 'carer'],
  },
  {
    key: 'share_amount',
    label: 'Monthly share',
    required: false,
    aliases: ['share', 'share amount', 'monthly share', 'monthly amount', 'contribution',
              'monthly contribution', 'premium'],
    hint: 'Parsed into integer cents.',
  },
  {
    key: 'notes',
    label: 'Notes',
    required: false,
    aliases: ['notes', 'note', 'comments', 'comment', 'remarks'],
  },
];

export const FIELD_BY_KEY: Record<CanonicalField, FieldSpec> = Object.fromEntries(
  FIELD_SPECS.map((f) => [f.key, f]),
) as Record<CanonicalField, FieldSpec>;

export const REQUIRED_FIELDS: CanonicalField[] = FIELD_SPECS.filter((f) => f.required).map((f) => f.key);

/** A mapping from source header → canonical field. Unmapped headers are dropped. */
export type ColumnMapping = Record<string, CanonicalField | null>;

/** The canonical shape a mapped row is normalized into. */
export interface NormalizedRow {
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  member_number: string | null;
  status: string | null;
  joined_at: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  household_name: string | null;
  relationship: string | null;
  is_dependent: boolean;
  is_caregiver: boolean;
  share_amount_cents: number | null;
  notes: string | null;
}
