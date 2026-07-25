import { Hono } from 'hono';
import type { Env } from '../lib/env';
import { intVar } from '../lib/env';
import { requireUser, requireWriteAccess, currentUser, type AppEnv } from '../lib/auth';
import { all, first, run, batch, json } from '../lib/db';
import { param } from '../lib/http';
import { audit } from '../lib/audit';
import { importKey, readDocument } from '../lib/storage';
import { commitImport } from '../lib/import-service';
import { analyzeCsv } from '../../src/lib/import/pipeline';
import type { MatchCandidate } from '../../src/lib/import/dedupe';
import { dedupeKeys } from '../../src/lib/import/dedupe';
import type { ColumnMapping } from '../../src/lib/import/fields';
import { newId } from '../../src/lib/ids';
import { nowIso } from '../../src/lib/utils';

const imports = new Hono<AppEnv>();
imports.use('*', requireUser);

/**
 * The import flow, in the order a user experiences it:
 *
 *   POST /            upload the file → R2, infer columns, return a preview
 *   GET  /:id         re-read the analysis (mapping, rows, summary)
 *   POST /:id/remap   change the mapping, re-analyze, new preview
 *   POST /:id/commit  write members and households
 *
 * Nothing before commit touches the members table. The preview is persisted to
 * import_rows so it survives a page reload and so the commit works from the
 * exact rows the human approved — not from a re-parse that might differ.
 */

imports.get('/', async (c) => {
  const user = (await currentUser(c))!;
  const rows = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT i.*, u.name AS created_by_name
       FROM imports i LEFT JOIN users u ON u.id = i.created_by
      WHERE i.org_id = ?
      ORDER BY i.created_at DESC
      LIMIT 100`,
    user.org_id,
  );
  return c.json({ items: rows });
});

/**
 * Upload and analyze. Accepts multipart/form-data with a `file` field, or a
 * raw text/csv body with an `X-Filename` header for scripted use.
 */
imports.post('/', requireWriteAccess, async (c) => {
  const user = (await currentUser(c))!;
  const maxRows = intVar(c.env.IMPORT_MAX_ROWS, 10_000);

  let content: string;
  let filename: string;

  const contentType = c.req.header('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    const form = await c.req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return c.json({ error: 'Please choose a CSV file to upload.' }, 400);
    }
    content = await file.text();
    filename = file.name || 'roster.csv';
  } else {
    content = await c.req.text();
    filename = c.req.header('X-Filename') ?? 'roster.csv';
  }

  if (!content.trim()) {
    return c.json({ error: 'That file is empty.' }, 400);
  }
  if (!filename.toLowerCase().endsWith('.csv')) {
    return c.json({
      error: 'V1 reads CSV files. Export your roster as CSV and try again — XLSX support is coming.',
    }, 415);
  }

  const importId = newId('import');
  const now = nowIso();
  const key = importKey(user.org_id, importId, 'csv');

  // The source file goes to R2 before anything else. If the analysis is wrong,
  // we can always re-run it against the exact bytes the ministry sent.
  await c.env.DOCUMENTS.put(key, content, {
    httpMetadata: { contentType: 'text/csv' },
    customMetadata: { org_id: user.org_id, import_id: importId },
  });

  const analysis = analyzeCsv(content, {
    maxRows,
    candidates: await loadCandidates(c.env, user.org_id, content, maxRows),
  });

  await persistAnalysis(c.env, user.org_id, importId, analysis);

  await batch(c.env.DB, [
    c.env.DB.prepare(
      `INSERT INTO imports (id, org_id, created_by, filename, r2_key, file_size, format, status,
                            detected_headers, total_rows, valid_rows, invalid_rows, duplicate_rows,
                            created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'csv', 'previewing', ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      importId, user.org_id, user.id, filename, key, content.length,
      JSON.stringify(analysis.headers), analysis.summary.total,
      analysis.summary.create + analysis.summary.update, analysis.summary.error,
      analysis.summary.skip, now, now,
    ),
    c.env.DB.prepare(
      `INSERT INTO import_mappings (id, org_id, import_id, mapping, is_template, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
    ).bind(newId('importMapping'), user.org_id, importId, JSON.stringify(analysis.mapping), now, now),
  ]);

  await audit(c.env.DB, {
    orgId: user.org_id, actorId: user.id, actorKind: 'user', action: 'import.uploaded',
    subjectType: 'import', subjectId: importId,
    meta: { filename, rows: analysis.summary.total },
  });

  return c.json({
    import_id: importId,
    filename,
    columns: analysis.columns,
    mapping: analysis.mapping,
    missing_required: analysis.missing_required,
    warnings: analysis.warnings,
    summary: analysis.summary,
    households: analysis.households,
    preview: analysis.rows.slice(0, 50),
  }, 201);
});

/** The persisted analysis for an import. */
imports.get('/:id', async (c) => {
  const user = (await currentUser(c))!;
  const id = param(c, 'id');

  const record = await first<Record<string, unknown>>(
    c.env.DB, 'SELECT * FROM imports WHERE id = ? AND org_id = ?', id, user.org_id,
  );
  if (!record) return c.json({ error: 'That import was not found.' }, 404);

  const [rows, mapping] = await Promise.all([
    all<ImportRowRecord>(
      c.env.DB,
      `SELECT row_number, raw, normalized, action, issues, matched_member_id, match_reason
         FROM import_rows WHERE import_id = ? AND org_id = ?
        ORDER BY row_number LIMIT 500`,
      id, user.org_id,
    ),
    first<{ mapping: string }>(
      c.env.DB,
      'SELECT mapping FROM import_mappings WHERE import_id = ? AND org_id = ? ORDER BY created_at DESC LIMIT 1',
      id, user.org_id,
    ),
  ]);

  const counts = await first<{ create: number; update: number; skip: number; error: number }>(
    c.env.DB,
    `SELECT
       SUM(CASE WHEN action = 'create' THEN 1 ELSE 0 END) AS "create",
       SUM(CASE WHEN action = 'update' THEN 1 ELSE 0 END) AS "update",
       SUM(CASE WHEN action = 'skip'   THEN 1 ELSE 0 END) AS "skip",
       SUM(CASE WHEN action = 'error'  THEN 1 ELSE 0 END) AS "error"
     FROM import_rows WHERE import_id = ? AND org_id = ?`,
    id, user.org_id,
  );

  return c.json({
    import: { ...record, detected_headers: json(record.detected_headers, []) },
    mapping: json(mapping?.mapping, {}),
    rows: rows.map((r) => ({
      ...r,
      raw: json(r.raw, {}),
      normalized: json(r.normalized, null),
      issues: json(r.issues, []),
    })),
    summary: {
      total: (record.total_rows as number) ?? 0,
      create: counts?.create ?? 0,
      update: counts?.update ?? 0,
      skip: counts?.skip ?? 0,
      error: counts?.error ?? 0,
    },
  });
});

/** Re-analyze with a corrected mapping. Replaces the previous preview wholesale. */
imports.post('/:id/remap', requireWriteAccess, async (c) => {
  const user = (await currentUser(c))!;
  const id = param(c, 'id');
  const { mapping } = await c.req.json<{ mapping?: ColumnMapping }>();
  if (!mapping) return c.json({ error: 'Send the corrected column mapping.' }, 400);

  const record = await first<{ r2_key: string; status: string }>(
    c.env.DB, 'SELECT r2_key, status FROM imports WHERE id = ? AND org_id = ?', id, user.org_id,
  );
  if (!record) return c.json({ error: 'That import was not found.' }, 404);
  if (record.status === 'completed') {
    return c.json({ error: 'That import has already been committed.' }, 409);
  }

  const object = await readDocument(c.env, user.org_id, record.r2_key);
  if (!object) return c.json({ error: 'The uploaded file is no longer available.' }, 410);

  const content = await object.text();
  const maxRows = intVar(c.env.IMPORT_MAX_ROWS, 10_000);
  const analysis = analyzeCsv(content, {
    mapping,
    maxRows,
    candidates: await loadCandidates(c.env, user.org_id, content, maxRows, mapping),
  });

  await run(c.env.DB, 'DELETE FROM import_rows WHERE import_id = ? AND org_id = ?', id, user.org_id);
  await persistAnalysis(c.env, user.org_id, id, analysis);

  const now = nowIso();
  await batch(c.env.DB, [
    c.env.DB.prepare(
      `UPDATE imports SET total_rows = ?, valid_rows = ?, invalid_rows = ?, duplicate_rows = ?,
                          status = 'previewing', updated_at = ?
        WHERE id = ? AND org_id = ?`,
    ).bind(
      analysis.summary.total, analysis.summary.create + analysis.summary.update,
      analysis.summary.error, analysis.summary.skip, now, id, user.org_id,
    ),
    c.env.DB.prepare(
      `INSERT INTO import_mappings (id, org_id, import_id, mapping, is_template, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
    ).bind(newId('importMapping'), user.org_id, id, JSON.stringify(mapping), now, now),
  ]);

  return c.json({
    mapping: analysis.mapping,
    missing_required: analysis.missing_required,
    summary: analysis.summary,
    households: analysis.households,
    preview: analysis.rows.slice(0, 50),
  });
});

/**
 * Commit. Enqueues the write so a large roster does not sit on the request, and
 * falls back to committing inline when the queue is unavailable — which is the
 * common case in local development.
 */
imports.post('/:id/commit', requireWriteAccess, async (c) => {
  const user = (await currentUser(c))!;
  const id = param(c, 'id');

  const record = await first<{ status: string }>(
    c.env.DB, 'SELECT status FROM imports WHERE id = ? AND org_id = ?', id, user.org_id,
  );
  if (!record) return c.json({ error: 'That import was not found.' }, 404);
  if (record.status === 'completed') {
    return c.json({ error: 'That import has already been committed.' }, 409);
  }

  await run(
    c.env.DB, "UPDATE imports SET status = 'committing', updated_at = ? WHERE id = ? AND org_id = ?",
    nowIso(), id, user.org_id,
  );

  try {
    await c.env.IMPORT_QUEUE.send({ kind: 'commit', org_id: user.org_id, import_id: id, user_id: user.id });
    return c.json({ status: 'queued' }, 202);
  } catch (error) {
    console.warn('[imports] queue unavailable, committing inline:', error);
    const result = await commitImport(c.env, user.org_id, id, user.id);
    return c.json({ status: 'completed', ...result });
  }
});

/** Download the original file exactly as uploaded. */
imports.get('/:id/source', async (c) => {
  const user = (await currentUser(c))!;
  const id = param(c, 'id');

  const record = await first<{ r2_key: string; filename: string }>(
    c.env.DB, 'SELECT r2_key, filename FROM imports WHERE id = ? AND org_id = ?', id, user.org_id,
  );
  if (!record) return c.json({ error: 'That import was not found.' }, 404);

  const object = await readDocument(c.env, user.org_id, record.r2_key);
  if (!object) return c.json({ error: 'The uploaded file is no longer available.' }, 410);

  return new Response(object.body, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${record.filename}"`,
    },
  });
});

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Narrow the existing-member set to those that could possibly match this file.
 *
 * This is why the dedupe keys are indexed columns: we compute the file's keys
 * in memory, then fetch only members sharing one. A 5,000-row roster against a
 * 50,000-member org fetches a few thousand rows, not fifty thousand.
 */
async function loadCandidates(
  env: Env,
  orgId: string,
  content: string,
  maxRows: number,
  mapping?: ColumnMapping,
): Promise<MatchCandidate[]> {
  const analysis = analyzeCsv(content, { maxRows, mapping });
  const emails: string[] = [];
  const phones: string[] = [];
  const nameDobs: string[] = [];

  for (const row of analysis.rows) {
    if (row.action === 'error') continue;
    const keys = dedupeKeys(row.normalized);
    if (keys.dedupe_email) emails.push(keys.dedupe_email);
    if (keys.dedupe_phone) phones.push(keys.dedupe_phone);
    if (keys.dedupe_name_dob) nameDobs.push(keys.dedupe_name_dob);
  }

  const candidates = new Map<string, MatchCandidate>();

  // SQLite has a bound-parameter ceiling; chunk each key set well under it.
  const CHUNK = 200;
  const fetchBy = async (column: string, values: string[]) => {
    const unique = [...new Set(values)];
    for (let i = 0; i < unique.length; i += CHUNK) {
      const slice = unique.slice(i, i + CHUNK);
      const rows = await all<MatchCandidate>(
        env.DB,
        `SELECT id, last_name, dedupe_email, dedupe_phone, dedupe_name_dob
           FROM members
          WHERE org_id = ? AND deleted_at IS NULL
            AND ${column} IN (${slice.map(() => '?').join(',')})`,
        orgId, ...slice,
      );
      for (const row of rows) candidates.set(row.id, row);
    }
  };

  await Promise.all([
    emails.length ? fetchBy('dedupe_email', emails) : Promise.resolve(),
    phones.length ? fetchBy('dedupe_phone', phones) : Promise.resolve(),
    nameDobs.length ? fetchBy('dedupe_name_dob', nameDobs) : Promise.resolve(),
  ]);

  return [...candidates.values()];
}

/** Write the preview to import_rows so the commit works from approved rows. */
async function persistAnalysis(
  env: Env,
  orgId: string,
  importId: string,
  analysis: ReturnType<typeof analyzeCsv>,
): Promise<void> {
  const now = nowIso();
  const statements = analysis.rows.map((row) =>
    env.DB.prepare(
      `INSERT INTO import_rows (id, org_id, import_id, row_number, raw, normalized, action,
                                issues, matched_member_id, match_reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      newId('importRow'), orgId, importId, row.row_number,
      JSON.stringify(row.raw), JSON.stringify(row.normalized), row.action,
      JSON.stringify(row.issues), row.matched_member_id, row.match_reason, now,
    ),
  );
  await batch(env.DB, statements);
}

interface ImportRowRecord {
  row_number: number; raw: string; normalized: string | null; action: string;
  issues: string; matched_member_id: string | null; match_reason: string | null;
}

export default imports;
