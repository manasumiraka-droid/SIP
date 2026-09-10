const cutoff = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString();

export async function runImportRetention(db: D1Database) {
  const now = new Date().toISOString();
  const expired = await db
    .prepare(
      "SELECT id,organization_id FROM import_batches WHERE status IN ('uploaded','validating','needs_review','ready') AND expires_at<? LIMIT 100",
    )
    .bind(now)
    .all<{ id: string; organization_id: string }>();
  for (const item of expired.results) {
    await db.batch([
      db
        .prepare(
          "UPDATE import_batches SET status='expired',version=version+1,updated_at=? WHERE organization_id=? AND id=?",
        )
        .bind(now, item.organization_id, item.id),
      db
        .prepare(
          "INSERT INTO audit_logs(id,organization_id,actor_type,actor_id,action,entity_type,entity_id,request_id,metadata_redacted_json,created_at) VALUES(?,?,'system',NULL,'import.expire','import_batch',?,?,'{}',?)",
        )
        .bind(
          crypto.randomUUID(),
          item.organization_id,
          item.id,
          crypto.randomUUID(),
          now,
        ),
      db
        .prepare(
          "DELETE FROM import_action_receipts WHERE organization_id=? AND import_row_id IN (SELECT id FROM import_rows WHERE organization_id=? AND batch_id=?)",
        )
        .bind(item.organization_id, item.organization_id, item.id),
      db
        .prepare(
          "DELETE FROM import_link_receipts WHERE organization_id=? AND import_row_id IN (SELECT id FROM import_rows WHERE organization_id=? AND batch_id=?)",
        )
        .bind(item.organization_id, item.organization_id, item.id),
      db
        .prepare(
          "DELETE FROM import_pending_receipts WHERE organization_id=? AND import_row_id IN (SELECT id FROM import_rows WHERE organization_id=? AND batch_id=?)",
        )
        .bind(item.organization_id, item.organization_id, item.id),
      db
        .prepare(
          "DELETE FROM import_resolution_receipts WHERE organization_id=? AND import_row_id IN (SELECT id FROM import_rows WHERE organization_id=? AND batch_id=?)",
        )
        .bind(item.organization_id, item.organization_id, item.id),
      db
        .prepare(
          "DELETE FROM import_resolutions WHERE organization_id=? AND import_row_id IN (SELECT id FROM import_rows WHERE organization_id=? AND batch_id=?)",
        )
        .bind(item.organization_id, item.organization_id, item.id),
      db
        .prepare(
          "UPDATE import_rows SET raw_json='{}',normalized_json='{}',error_codes_json='[]',warning_codes_json='[]',override_starts_at=NULL,updated_at=? WHERE organization_id=? AND batch_id=?",
        )
        .bind(now, item.organization_id, item.id),
    ]);
  }
  const stale = await db
    .prepare(
      "SELECT id,organization_id FROM import_batches WHERE status IN ('committed','failed','rolled_back','expired') AND updated_at<? LIMIT 100",
    )
    .bind(cutoff(30))
    .all<{ id: string; organization_id: string }>();
  for (const item of stale.results) {
    const retainedUntil = new Date(
      Date.now() + 5 * 365 * 86_400_000,
    ).toISOString();
    await db.batch([
      db
        .prepare(
          "INSERT INTO import_batch_summaries(batch_id,organization_id,summary_json,retained_until,created_at,updated_at) SELECT ?,?,json_object('rows',COUNT(*),'committed',SUM(CASE WHEN status='committed' THEN 1 ELSE 0 END),'skipped',SUM(CASE WHEN status='skipped' THEN 1 ELSE 0 END),'excluded',SUM(CASE WHEN status='excluded' THEN 1 ELSE 0 END)),?,?,? FROM import_rows WHERE organization_id=? AND batch_id=? ON CONFLICT(batch_id) DO UPDATE SET summary_json=excluded.summary_json,retained_until=excluded.retained_until,updated_at=excluded.updated_at",
        )
        .bind(
          item.id,
          item.organization_id,
          retainedUntil,
          now,
          now,
          item.organization_id,
          item.id,
        ),
      db
        .prepare(
          "DELETE FROM import_action_receipts WHERE organization_id=? AND import_row_id IN (SELECT id FROM import_rows WHERE organization_id=? AND batch_id=?)",
        )
        .bind(item.organization_id, item.organization_id, item.id),
      db
        .prepare(
          "DELETE FROM import_link_receipts WHERE organization_id=? AND import_row_id IN (SELECT id FROM import_rows WHERE organization_id=? AND batch_id=?)",
        )
        .bind(item.organization_id, item.organization_id, item.id),
      db
        .prepare(
          "DELETE FROM import_pending_receipts WHERE organization_id=? AND import_row_id IN (SELECT id FROM import_rows WHERE organization_id=? AND batch_id=?)",
        )
        .bind(item.organization_id, item.organization_id, item.id),
      db
        .prepare(
          "DELETE FROM import_resolution_receipts WHERE organization_id=? AND import_row_id IN (SELECT id FROM import_rows WHERE organization_id=? AND batch_id=?)",
        )
        .bind(item.organization_id, item.organization_id, item.id),
      db
        .prepare(
          "DELETE FROM import_resolutions WHERE organization_id=? AND import_row_id IN (SELECT id FROM import_rows WHERE organization_id=? AND batch_id=?)",
        )
        .bind(item.organization_id, item.organization_id, item.id),
      db
        .prepare(
          "UPDATE import_rows SET raw_json='{}',normalized_json='{}',error_codes_json='[]',warning_codes_json='[]',override_starts_at=NULL,updated_at=? WHERE organization_id=? AND batch_id=?",
        )
        .bind(now, item.organization_id, item.id),
    ]);
  }
  return { expired: expired.results.length, scrubbed: stale.results.length };
}
