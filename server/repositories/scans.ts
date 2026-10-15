import type Database from 'better-sqlite3';

export type ScanRunRow = {
  id: number;
  started_at: string;
  finished_at: string | null;
  total: number;
  processed: number;
  added: number;
  updated: number;
  removed: number;
  error: string | null;
};

export type ScanRunTotals = {
  total: number;
  added: number;
  updated: number;
  removed: number;
  error: string | null;
};

export function startScanRun(db: Database.Database, startedAt: string): number {
  const result = db.prepare('INSERT INTO scan_runs (started_at) VALUES (?)').run(startedAt);
  return Number(result.lastInsertRowid);
}

export function finishScanRun(db: Database.Database, id: number, totals: ScanRunTotals, finishedAt: string): void {
  db.prepare(
    `UPDATE scan_runs
     SET finished_at = ?, total = ?, processed = ?, added = ?, updated = ?, removed = ?, error = ?
     WHERE id = ?`,
  ).run(finishedAt, totals.total, totals.total, totals.added, totals.updated, totals.removed, totals.error, id);
}

export function lastScanRun(db: Database.Database): ScanRunRow | undefined {
  return db.prepare('SELECT * FROM scan_runs ORDER BY id DESC LIMIT 1').get() as ScanRunRow | undefined;
}
