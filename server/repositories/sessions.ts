import type Database from 'better-sqlite3';

export type SessionRow = {
  token_hash: string;
  created_at: number;
  expires_at: number;
  user_agent: string | null;
};

export function insertSession(db: Database.Database, tokenHash: string, expiresAt: number, userAgent: string | null): void {
  db.prepare('INSERT OR REPLACE INTO sessions (token_hash, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?)').run(
    tokenHash,
    Date.now(),
    expiresAt,
    userAgent,
  );
}

/** Valida la sesión y purga las caducadas que se encuentra por el camino. */
export function findValidSession(db: Database.Database, tokenHash: string, now = Date.now()): SessionRow | undefined {
  const row = db.prepare('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?').get(tokenHash, now) as SessionRow | undefined;
  if (!row) {
    const stale = db.prepare('SELECT 1 FROM sessions WHERE token_hash = ?').get(tokenHash);
    if (stale) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  }
  return row;
}

export function deleteSession(db: Database.Database, tokenHash: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}

export function purgeExpiredSessions(db: Database.Database, now = Date.now()): number {
  return db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now).changes;
}
