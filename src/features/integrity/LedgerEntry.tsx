import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { parseCents, formatCents } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

/**
 * Recording money in and money out, by hand.
 *
 * This closed a real hole rather than adding a convenience. Contributions
 * arrive on their own through the Stripe webhook, but **disbursements had no
 * writer at all** outside the seed file — and disbursements are the numerator
 * of the share ratio. The integrity report was reading a ledger that nothing in
 * the product could write the important half of, which meant every ministry not
 * already carrying historical data saw a ratio of zero and no way to fix it.
 *
 * Cheques, cash and bank transfers need the same door on the way in: a ministry
 * whose members do not all pay by card would otherwise under-report its own
 * contributions and score itself worse than it deserves.
 *
 * Two decisions worth keeping:
 *
 * **Amounts are typed as dollars and stored as cents.** `parseCents` is the
 * only converter, and the field shows the parsed value back as currency while
 * you type, so "1,250.00" and "1250" and "$1,250" all land the same and you can
 * see that they did before pressing anything.
 *
 * **The related-party relationship is required in the form, not just at the
 * API.** The endpoint already refuses a related-party payment with no stated
 * relationship — that rule is the one piece of policy enforced in the API
 * rather than the schema — and a form that lets somebody fill everything in and
 * then bounces them is a form that teaches people to avoid the category.
 */

const CONTRIBUTION_METHODS = [
  { value: 'check', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
  { value: 'ach', label: 'Bank transfer' },
  { value: 'card', label: 'Card (recorded by hand)' },
  { value: 'other', label: 'Other' },
];

/**
 * Categories, with what each does to the ratio said out loud.
 *
 * The category is not a filing decision — it decides which side of the share
 * ratio the money lands on, and somebody entering a payment should be told that
 * at the moment they choose rather than discovering it in a report.
 */
const DISBURSEMENT_CATEGORIES = [
  { value: 'share', label: 'Shared to a medical cost', effect: 'Counts toward the share ratio' },
  { value: 'administrative', label: 'Administrative', effect: 'Does not count toward sharing' },
  { value: 'marketing', label: 'Marketing', effect: 'Does not count toward sharing' },
  { value: 'related_party', label: 'Related party', effect: 'Reported separately, and requires the relationship' },
  { value: 'refund', label: 'Refund to a member', effect: 'Nets against contributions' },
  { value: 'other', label: 'Other', effect: 'Does not count toward sharing' },
];

const PAYEE_TYPES = ['provider', 'member', 'vendor', 'staff', 'other'];

type Mode = 'contribution' | 'disbursement';

export function LedgerEntry() {
  const [mode, setMode] = useState<Mode | null>(null);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Record money by hand</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          Card contributions record themselves once Stripe is connected. Everything else — cheques,
          cash, bank transfers, and every payment your ministry makes out — is entered here.
        </p>
        {mode === null ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setMode('contribution')}>
              <Plus /> Money in
            </Button>
            <Button size="sm" variant="outline" onClick={() => setMode('disbursement')}>
              <Plus /> Money out
            </Button>
          </div>
        ) : mode === 'contribution' ? (
          <ContributionForm onDone={() => setMode(null)} />
        ) : (
          <DisbursementForm onDone={() => setMode(null)} />
        )}
      </CardContent>
    </Card>
  );
}

/** Shared: the amount field, which shows what it parsed to before you commit. */
function AmountField({
  value, onChange, id,
}: {
  value: string;
  onChange: (next: string) => void;
  id: string;
}) {
  const cents = parseCents(value);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Amount</Label>
      <Input
        id={id}
        inputMode="decimal"
        placeholder="1,250.00"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {/* Echoed back rather than left to trust. Money is stored in integer
          cents and a share amount that drifts by a cent is a member ringing up
          to ask why their statement is wrong — so the parse is shown, not
          assumed. */}
      <p className={cn('text-xs', cents === null && value ? 'text-destructive' : 'text-muted-foreground')}>
        {value === ''
          ? 'Dollars. Commas and a leading $ are fine.'
          : cents === null
            ? 'That is not an amount we can read.'
            : `Will be recorded as ${formatCents(cents)}`}
      </p>
    </div>
  );
}

function ContributionForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('check');
  const [receivedAt, setReceivedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);

  const cents = parseCents(amount);

  async function submit() {
    if (!cents) return;
    setBusy(true);
    try {
      await api.integrity.recordContribution({
        amount_cents: cents,
        method,
        kind: 'share',
        // Sent as a full timestamp because the column is an ISO-8601 string and
        // the period is derived from its first seven characters.
        received_at: `${receivedAt}T12:00:00.000Z`,
        reference: reference.trim() || undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ['integrity'] });
      toast.success(`${formatCents(cents)} recorded.`, 'The share ratio has been recalculated.');
      onDone();
    } catch (error) {
      toast.error(error, { onRetry: submit });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <AmountField id="c-amount" value={amount} onChange={setAmount} />
        <div className="space-y-1.5">
          <Label htmlFor="c-method">How it arrived</Label>
          <select
            id="c-method"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            {CONTRIBUTION_METHODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-date">Received</Label>
          <Input id="c-date" type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-ref">Reference <span className="text-muted-foreground">(optional)</span></Label>
          <Input id="c-ref" placeholder="Cheque 1042" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || !cents} onClick={submit}>
          {busy ? 'Recording…' : 'Record it'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={busy}>Cancel</Button>
      </div>
    </div>
  );
}

function DisbursementForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [payee, setPayee] = useState('');
  const [payeeType, setPayeeType] = useState('provider');
  const [category, setCategory] = useState('share');
  const [relationship, setRelationship] = useState('');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const cents = parseCents(amount);
  const chosen = DISBURSEMENT_CATEGORIES.find((c) => c.value === category)!;
  const needsRelationship = category === 'related_party';
  const ready = Boolean(cents && payee.trim() && (!needsRelationship || relationship.trim()));

  async function submit() {
    if (!ready || !cents) return;
    setBusy(true);
    try {
      await api.integrity.recordDisbursement({
        amount_cents: cents,
        payee_name: payee.trim(),
        payee_type: payeeType,
        category,
        relationship: needsRelationship ? relationship.trim() : undefined,
        paid_at: `${paidAt}T12:00:00.000Z`,
      });
      await queryClient.invalidateQueries({ queryKey: ['integrity'] });
      toast.success(
        `${formatCents(cents)} to ${payee.trim()} recorded.`,
        category === 'share'
          ? 'It counts toward the share ratio.'
          : 'It does not count toward the share ratio.',
      );
      onDone();
    } catch (error) {
      toast.error(error, { onRetry: submit });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <AmountField id="d-amount" value={amount} onChange={setAmount} />
        <div className="space-y-1.5">
          <Label htmlFor="d-payee">Paid to</Label>
          <Input id="d-payee" placeholder="Mercy General Hospital" value={payee} onChange={(e) => setPayee(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="d-cat">What kind of payment</Label>
          <select
            id="d-cat"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {DISBURSEMENT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          {/* Said at the moment of choosing. The category decides which side of
              the ratio this lands on, which is not obvious from its name. */}
          <p className="text-xs text-muted-foreground">{chosen.effect}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="d-type">Who they are</Label>
          <select
            id="d-type"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={payeeType}
            onChange={(e) => setPayeeType(e.target.value)}
          >
            {PAYEE_TYPES.map((t) => (
              <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="d-date">Paid</Label>
          <Input id="d-date" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </div>
      </div>

      {needsRelationship && (
        // Asked in the form rather than refused at the API. The endpoint
        // already rejects a related-party payment with no relationship; a form
        // that lets somebody fill everything in and *then* bounces them teaches
        // people to file it under something else instead, which is the outcome
        // the rule exists to prevent.
        <div className="space-y-1.5 rounded-md border border-onus/40 bg-onus/5 p-3">
          <Label htmlFor="d-rel">What is the relationship?</Label>
          <Textarea
            id="d-rel"
            rows={2}
            placeholder="The vendor is owned by a board member's spouse."
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Required. Related-party payments are reported separately because undisclosed ones are
            the mechanism in every diversion case on record — disclosing one is not an admission,
            it is the thing that keeps it defensible.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <Button size="sm" disabled={busy || !ready} onClick={submit}>
          {busy ? 'Recording…' : 'Record it'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={busy}>Cancel</Button>
      </div>
    </div>
  );
}
