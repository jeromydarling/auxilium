import type { Env, SignalJob } from '../lib/env';
import { all } from '../lib/db';
import { recomputeMembers } from '../lib/nri-service';

/**
 * The auxilium-signals consumer.
 *
 * Scoring never sits on the request path: any write that could change a score
 * enqueues here instead. Two job shapes:
 *
 *   member — one member changed. Coalesced across the batch, because a busy
 *            case generates several messages for the same member in seconds
 *            and scoring them four times produces the identical result.
 *   org    — recompute everyone. Chunked so no single batch is enormous.
 */
export async function handleSignalBatch(batch: MessageBatch<SignalJob>, env: Env): Promise<void> {
  // Coalesce member jobs by org — one recompute per member per batch.
  const memberJobs = new Map<string, Set<string>>();
  const orgJobs: { org_id: string; reason: string }[] = [];

  for (const message of batch.messages) {
    const job = message.body;
    if (job.kind === 'member') {
      const set = memberJobs.get(job.org_id) ?? new Set<string>();
      set.add(job.member_id);
      memberJobs.set(job.org_id, set);
    } else if (job.kind === 'org') {
      orgJobs.push({ org_id: job.org_id, reason: job.reason });
    }
  }

  let failed = false;

  for (const [orgId, memberIds] of memberJobs) {
    try {
      const count = await recomputeMembers(env, orgId, [...memberIds], 'queue');
      console.log(`[queue:signals] recomputed ${count} members for ${orgId}`);
    } catch (error) {
      console.error(`[queue:signals] member recompute failed for ${orgId}:`, error);
      failed = true;
    }
  }

  for (const { org_id: orgId, reason } of orgJobs) {
    try {
      const members = await all<{ id: string }>(
        env.DB,
        'SELECT id FROM members WHERE org_id = ? AND deleted_at IS NULL',
        orgId,
      );
      const CHUNK = 100;
      for (let i = 0; i < members.length; i += CHUNK) {
        await recomputeMembers(env, orgId, members.slice(i, i + CHUNK).map((m) => m.id), reason);
      }
      console.log(`[queue:signals] full recompute for ${orgId}: ${members.length} members`);
    } catch (error) {
      console.error(`[queue:signals] org recompute failed for ${orgId}:`, error);
      failed = true;
    }
  }

  // Signals are derived data — a failed recompute leaves the previous scores in
  // place, which is stale but never wrong-shaped. Retry the batch; the next
  // write on the same member will re-enqueue regardless.
  if (failed) {
    batch.retryAll({ delaySeconds: 30 });
  } else {
    batch.ackAll();
  }
}
