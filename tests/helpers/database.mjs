import { DatabaseSync } from 'node:sqlite';

// Execute the production SQL against SQLite with D1's transactional batch API.
export function createTestDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE presentation_slots (
      id TEXT PRIMARY KEY, exam_type TEXT NOT NULL, slot_date TEXT NOT NULL,
      slot_time TEXT NOT NULL, section TEXT, booked_group_id TEXT,
      queue_no INTEGER CHECK (queue_no IS NULL OR queue_no > 0)
    );
    CREATE TABLE _changes (
      seq INTEGER PRIMARY KEY AUTOINCREMENT, tbl TEXT, op TEXT, row_id TEXT,
      at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);
  const DB = {
    prepare(sql) {
      const statement = (values = []) => ({
        bind: (...next) => statement(next),
        async all() { return { results: sqlite.prepare(sql).all(...values) }; },
        async first() { return sqlite.prepare(sql).get(...values); },
        async run() { return sqlite.prepare(sql).run(...values); },
      });
      return statement();
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.all());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { DB, sqlite };
}
