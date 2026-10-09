import Database from "better-sqlite3";
const path = process.argv[2] || process.env.ACCOUNT_DB_PATH;
if (!path) throw new Error("Pass a database filename or set ACCOUNT_DB_PATH.");
const db = new Database(path, { readonly: true, fileMustExist: true });
try {
  const result = db.pragma("integrity_check");
  if (result.length !== 1 || result[0].integrity_check !== "ok" || db.pragma("foreign_key_check").length) {
    throw new Error("Database integrity or foreign-key check failed.");
  }
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
  for (const table of ["user", "account_state", "creations", "attempts", "app_migrations"]) {
    if (!tables.has(table)) throw new Error("Required account tables are missing.");
  }
  // Counts are operational evidence, not individual user information.
  const counts = Object.fromEntries(["user", "account_state", "creations", "attempts"].map(table => [table, db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n]));
  console.log(JSON.stringify({ integrity: "ok", counts, migrations: db.prepare("SELECT version FROM app_migrations ORDER BY version").all().map(row => row.version) }));
} finally { db.close(); }
