import type { Env, ImportJob } from '../lib/env';
import { commitImport, failImport, hasPendingRows } from '../lib/import-service';

/**
 * The auxilium-imports consumer.
 *
 * Committing a large roster is thousands of D1 statements and a signal
 * recompute for every new member — far past what belongs on a request. The
 * upload handler enqueues; this does the work.
 *
 * Retry posture: commitImport marks each row committed in the same batch that
 * writes its member, so a redelivered message resumes rather than duplicating.
 * A message is only acked once the import genuinely has no pending rows left.
 */
export async function handleImportBatch(batch: MessageBatch<ImportJob>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    const job = message.body;
    try {
      switch (job.kind) {
        case 'commit': {
          const result = await commitImport(env, job.org_id, job.import_id, job.user_id);
          console.log(
            `[queue:imports] committed ${job.import_id}: ` +
            `${result.created} created, ${result.updated} updated, ` +
            `${result.households_created} households`,
          );
          message.ack();
          break;
        }
        case 'analyze':
          // Analysis happens synchronously at upload so the user sees a preview
          // immediately. Kept in the union for the future streaming path.
          console.log(`[queue:imports] analyze is handled at upload; acking ${job.import_id}`);
          message.ack();
          break;
        default:
          message.ack();
      }
    } catch (error) {
      console.error('[queue:imports] job failed:', error);

      // If nothing is left to commit, the work actually landed and the error
      // came afterwards — acking avoids reprocessing a finished import.
      const pending = await hasPendingRows(env, job.org_id, job.import_id).catch(() => true);
      if (!pending) {
        message.ack();
        continue;
      }

      if (message.attempts >= 3) {
        await failImport(
          env, job.org_id, job.import_id,
          error instanceof Error ? error.message : 'The import could not be completed.',
        ).catch(() => {});
        message.ack(); // Recorded as failed; retrying further would not help.
      } else {
        message.retry({ delaySeconds: 10 * message.attempts });
      }
    }
  }
}
