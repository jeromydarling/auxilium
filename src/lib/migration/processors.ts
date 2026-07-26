/**
 * Processor migration: moving a ministry's existing payers onto Stripe without
 * asking five thousand households to re-enter a bank account.
 *
 * This is the single biggest thing standing between a ministry and switching,
 * and it is almost entirely solved infrastructure — Stripe runs a data
 * migrations team that imports cards, ACH mandates, and network transaction IDs
 * from a prior processor with no customer re-entry and no billing downtime.
 *
 * **Auxilium never touches a card number.** That is the load-bearing decision
 * in this whole module, and it is worth being explicit about why. Stripe's PAN
 * import is processor-to-Stripe: Stripe publishes a PGP key, the *losing*
 * processor encrypts the export and uploads it over SFTP, and the merchant
 * coordinates the request without ever handling the file. Routing it through
 * Auxilium instead would put primary account numbers inside this system and
 * drag it into full PCI DSS scope — which is precisely what fails the security
 * review of the large, risk-averse ministry this feature exists to win.
 *
 * So Auxilium is the orchestration layer, not the courier: it works out who to
 * ask and for what, validates the *metadata* manifest before anyone spends a
 * ten-day round trip on a malformed file, reconciles Stripe's returned mapping
 * against the roster, rebuilds the subscriptions, and shows the ministry
 * exactly who is safely across and who still needs a phone call.
 *
 * Pure. No network, no database, no clock except what is passed in.
 */

export type ProcessorKey =
  | 'authorize_net'
  | 'braintree'
  | 'recurly'
  | 'paypal'
  | 'square'
  | 'chargify'
  | 'bank_ach'
  | 'in_house'
  | 'other';

export interface ProcessorProfile {
  key: ProcessorKey;
  label: string;
  /** What the ministry is likely to be able to get out of them. */
  supports: {
    cardPanExport: boolean;
    achMandateExport: boolean;
    /** Network transaction IDs let Stripe request an SCA exemption on the first charge. */
    networkTransactionIds: boolean;
  };
  /** Roughly how long this processor takes to produce an export, in business days. */
  typicalExportDays: number;
  /** What to say when asking. Ministries do not know the vocabulary; this is the point. */
  requestNotes: string[];
}

/**
 * What each processor can realistically hand over.
 *
 * Deliberately conservative. Telling a ministry a migration will be painless
 * and then discovering their processor will not release network transaction
 * IDs is worse than saying up front that the first charge may prompt for
 * re-authentication.
 */
export const PROCESSORS: ProcessorProfile[] = [
  {
    key: 'authorize_net',
    label: 'Authorize.net',
    supports: { cardPanExport: true, achMandateExport: true, networkTransactionIds: false },
    typicalExportDays: 10,
    requestNotes: [
      'Ask specifically for a "full PAN export for migration to another processor", not a settlement report.',
      'Customer Information Manager (CIM) profile IDs are the join key — ask for them in the same file.',
      'They generally will not release original network transaction IDs, so expect some first charges to prompt for authentication.',
    ],
  },
  {
    key: 'braintree',
    label: 'Braintree',
    supports: { cardPanExport: true, achMandateExport: true, networkTransactionIds: true },
    typicalExportDays: 7,
    requestNotes: [
      'Braintree runs a standard data-portability process; ask their support for a "vault export to another PCI-compliant processor".',
      'Request network transaction IDs explicitly — they will include them, and it is what keeps members from being re-prompted.',
    ],
  },
  {
    key: 'recurly',
    label: 'Recurly',
    supports: { cardPanExport: true, achMandateExport: true, networkTransactionIds: true },
    typicalExportDays: 7,
    requestNotes: [
      'Recurly exports the vault, but the subscription schedules come out separately — ask for both.',
      'Their export uses their own account codes; keep them, they are how members get matched afterwards.',
    ],
  },
  {
    key: 'paypal',
    label: 'PayPal / Payflow',
    supports: { cardPanExport: true, achMandateExport: false, networkTransactionIds: false },
    typicalExportDays: 14,
    requestNotes: [
      'Cards stored in Payflow can be exported; PayPal *wallet* agreements cannot be moved and those members must re-authorize.',
      'Expect this one to take longer than the others. Start it first.',
    ],
  },
  {
    key: 'square',
    label: 'Square',
    supports: { cardPanExport: true, achMandateExport: false, networkTransactionIds: false },
    typicalExportDays: 10,
    requestNotes: [
      'Square will transfer cards on file to another PCI-compliant processor on request.',
      'Square does not hold ACH mandates in a portable form; any bank-draft members will need to re-authorize.',
    ],
  },
  {
    key: 'chargify',
    label: 'Chargify / Maxio',
    supports: { cardPanExport: true, achMandateExport: true, networkTransactionIds: true },
    typicalExportDays: 10,
    requestNotes: [
      'Ask for the vault export and the subscription export together; the billing anchors matter as much as the cards.',
    ],
  },
  {
    key: 'bank_ach',
    label: 'A bank or ACH-only processor',
    supports: { cardPanExport: false, achMandateExport: true, networkTransactionIds: false },
    typicalExportDays: 14,
    requestNotes: [
      'Bank-draft members are usually the easiest to move and the least likely to churn — the mandate is already verified.',
      'Stripe can accept already-verified bank accounts without re-verification, so members are not asked to microdeposit again.',
      'You will need routing and account numbers transferred to Stripe directly, never through Auxilium or by email.',
    ],
  },
  {
    key: 'in_house',
    label: 'In-house or manual (spreadsheets, paper authorizations)',
    supports: { cardPanExport: false, achMandateExport: false, networkTransactionIds: false },
    typicalExportDays: 0,
    requestNotes: [
      'There is nothing to import: no vault exists to move.',
      'This is the one case where members do have to provide payment details, and it is worth being straightforward with them about why.',
      'Auxilium can still stage everyone as a Stripe customer first, so the ask is a single link rather than a form.',
    ],
  },
  {
    key: 'other',
    label: 'Something else',
    supports: { cardPanExport: true, achMandateExport: true, networkTransactionIds: false },
    typicalExportDays: 14,
    requestNotes: [
      'Most PCI-compliant processors will release a vault export on request; the phrase that opens the door is "PCI-compliant data portability".',
      'If they refuse outright, that refusal is itself worth knowing about — a processor that will not let you leave is a business risk beyond this migration.',
    ],
  },
];

export function processorByKey(key: string): ProcessorProfile | undefined {
  return PROCESSORS.find((p) => p.key === key);
}

/**
 * The letter a ministry sends its current processor.
 *
 * Generated rather than written, because the wording is the part that decides
 * whether the request is understood or bounced. Ministry staff should not have
 * to learn the phrase "PAN export" to leave a vendor.
 */
export function requestTemplate(input: {
  processor: ProcessorProfile;
  ministryName: string;
  merchantId?: string;
  contactName?: string;
}): string {
  const { processor, ministryName } = input;
  const lines: string[] = [];

  lines.push(`Subject: PCI-compliant data portability request — ${ministryName}`);
  lines.push('');
  lines.push(`To ${processor.label} support,`);
  lines.push('');
  lines.push(
    `${ministryName} is migrating recurring payment processing to Stripe. We are requesting a ` +
      `PCI-compliant transfer of our stored payment data directly to Stripe. We are not asking ` +
      `for this data to be sent to us.`,
  );
  lines.push('');

  if (input.merchantId) lines.push(`Our merchant/account ID: ${input.merchantId}`);
  lines.push('');
  lines.push('Please transfer the following directly to Stripe:');

  if (processor.supports.cardPanExport) {
    lines.push('  • Stored card numbers, expiration dates, and default-payment flags');
  }
  if (processor.supports.achMandateExport) {
    lines.push('  • Verified bank account details and their existing authorizations');
  }
  if (processor.supports.networkTransactionIds) {
    lines.push(
      '  • Original network transaction IDs for each stored card (these prevent our members ' +
        'from being asked to re-authenticate on their first charge)',
    );
  }
  lines.push('  • Your customer/profile identifier for each record, so we can match them to our roster');
  lines.push('');
  lines.push(
    'Stripe will provide the encrypted transfer details and their PGP key on request; their ' +
      'data migrations team can be reached directly to coordinate. The data should go from you ' +
      'to Stripe — it should not pass through us or any third party.',
  );
  lines.push('');
  lines.push(
    'We intend to continue billing through your platform until the transfer is confirmed ' +
      'complete, so there should be no interruption to either side.',
  );
  lines.push('');
  lines.push(`Thank you,`);
  lines.push(input.contactName ?? `${ministryName}`);

  return lines.join('\n');
}

/**
 * Plain expectations for a given processor.
 *
 * Every number here is presented as an estimate, because it is one. A migration
 * plan that quotes a confident date it cannot control is how a ministry ends up
 * telling its members something that turns out to be untrue.
 */
export function expectations(processor: ProcessorProfile): {
  estimatedDays: { low: number; high: number };
  warnings: string[];
} {
  const warnings: string[] = [];

  if (!processor.supports.networkTransactionIds && processor.supports.cardPanExport) {
    warnings.push(
      'This processor is unlikely to release original network transaction IDs. Some members may ' +
        'be asked by their bank to confirm the first charge — worth mentioning in advance rather ' +
        'than letting it be a surprise.',
    );
  }

  if (!processor.supports.cardPanExport && processor.key !== 'in_house' && processor.key !== 'bank_ach') {
    warnings.push('Card data cannot be exported from this processor; card-paying members will need to re-enter details.');
  }

  if (!processor.supports.achMandateExport && processor.key !== 'in_house') {
    warnings.push('Bank-draft authorizations cannot be transferred; those members will need to re-authorize.');
  }

  if (processor.key === 'in_house') {
    warnings.push('There is no vault to migrate — every paying member will need to provide details once.');
  }

  // Stripe's own stated turnaround once it has a correctly formatted file,
  // plus however long this processor takes to produce one.
  const stripeDays = 10;
  return {
    estimatedDays: {
      low: processor.typicalExportDays + 5,
      high: processor.typicalExportDays + stripeDays + 5,
    },
    warnings,
  };
}
