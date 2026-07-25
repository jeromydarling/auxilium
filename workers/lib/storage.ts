import { newId } from '../../src/lib/ids';
import { nowIso } from '../../src/lib/utils';
import type { Env } from './env';
import { run } from './db';

/**
 * R2 object key strategy.
 *
 * Two properties matter and both are structural rather than conventional:
 *
 *   Collision-proof — every key contains a fresh document ID, so two people
 *   uploading "scan.pdf" for the same member in the same second cannot
 *   overwrite each other. The documents table has a UNIQUE index on r2_key as
 *   a belt-and-braces guarantee.
 *
 *   Prefix-scoped — the org ID is the first path segment of every key, so an
 *   org's entire object set can be listed, exported, or deleted with one
 *   prefix, and a bug in one tenant's code path cannot enumerate another's.
 */

export type StoragePrefix = 'imports' | 'documents' | 'member-files';

/** Strip anything that would make a key ambiguous or a URL awkward. */
export function slugifyFilename(filename: string): string {
  const trimmed = filename.trim().slice(0, 120);
  const dot = trimmed.lastIndexOf('.');
  const stem = dot > 0 ? trimmed.slice(0, dot) : trimmed;
  const ext = dot > 0 ? trimmed.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const safeStem = stem.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
  return ext ? `${safeStem}.${ext}` : safeStem;
}

/** imports/<org>/<import_id>/source.csv — one canonical source file per import. */
export function importKey(orgId: string, importId: string, format = 'csv'): string {
  return `imports/${orgId}/${importId}/source.${format}`;
}

/** member-files/<org>/<member_id>/<doc_id>-<slug> */
export function memberFileKey(orgId: string, memberId: string, docId: string, filename: string): string {
  return `member-files/${orgId}/${memberId}/${docId}-${slugifyFilename(filename)}`;
}

/** documents/<org>/<yyyy>/<mm>/<doc_id>-<slug> — date-partitioned for listing. */
export function documentKey(orgId: string, docId: string, filename: string, at = new Date()): string {
  const year = at.getUTCFullYear();
  const month = String(at.getUTCMonth() + 1).padStart(2, '0');
  return `documents/${orgId}/${year}/${month}/${docId}-${slugifyFilename(filename)}`;
}

export interface StoredDocument {
  id: string;
  r2_key: string;
  filename: string;
  content_type: string;
  size_bytes: number;
}

/**
 * Write bytes to R2 and record the metadata in D1.
 *
 * R2 first, then D1: a stored object with no row is recoverable garbage, while
 * a row pointing at a missing object is a broken link in the UI.
 */
export async function storeDocument(
  env: Env,
  params: {
    orgId: string;
    subjectType: 'member' | 'household' | 'need' | 'import' | 'org';
    subjectId: string | null;
    filename: string;
    contentType: string;
    body: ArrayBuffer | ReadableStream | string;
    uploadedBy: string | null;
    /** Overrides the derived key. Used by the import flow. */
    key?: string;
  },
): Promise<StoredDocument> {
  const docId = newId('document');
  const key = params.key
    ?? (params.subjectType === 'member' && params.subjectId
      ? memberFileKey(params.orgId, params.subjectId, docId, params.filename)
      : documentKey(params.orgId, docId, params.filename));

  const object = await env.DOCUMENTS.put(key, params.body, {
    httpMetadata: { contentType: params.contentType },
    customMetadata: { org_id: params.orgId, document_id: docId },
  });

  const size = object?.size ?? 0;

  await run(
    env.DB,
    `INSERT INTO documents (id, org_id, subject_type, subject_id, r2_key, filename,
                            content_type, size_bytes, uploaded_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    docId, params.orgId, params.subjectType, params.subjectId, key, params.filename,
    params.contentType, size, params.uploadedBy, nowIso(),
  );

  return { id: docId, r2_key: key, filename: params.filename, content_type: params.contentType, size_bytes: size };
}

/**
 * Read an object back, refusing any key outside the caller's org. The org
 * prefix check is the actual authorization boundary — do not remove it in
 * favor of trusting the documents row alone.
 */
export async function readDocument(env: Env, orgId: string, key: string): Promise<R2ObjectBody | null> {
  const segments = key.split('/');
  if (segments.length < 2 || segments[1] !== orgId) return null;
  return env.DOCUMENTS.get(key);
}
