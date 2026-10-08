import "server-only";
import Database from "better-sqlite3";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { accountConfig } from "./config";

const databases=globalThis as typeof globalThis & { emojiAccountDb?: {path:string;db:Database.Database} };
export function database() {
  const {path}=accountConfig();
  if(databases.emojiAccountDb?.path===path)return databases.emojiAccountDb.db;
  const directory=dirname(path);mkdirSync(directory,{recursive:true,mode:0o700});
  const db=new Database(path);chmodSync(path,0o600);db.pragma("journal_mode = WAL");db.pragma("foreign_keys = ON");db.pragma("busy_timeout = 5000");
  db.exec(`CREATE TABLE IF NOT EXISTS app_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);`);
  if(!db.prepare("SELECT version FROM app_migrations WHERE version=1").get())db.transaction(()=>{
    db.exec(`
      CREATE TABLE account_state (owner TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE, revision INTEGER NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE creations (owner TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, collection TEXT NOT NULL CHECK(collection IN ('saved','temporary')), id TEXT NOT NULL, identity TEXT NOT NULL, revision INTEGER NOT NULL, created_at INTEGER NOT NULL, payload TEXT, deleted_at INTEGER, undo_token TEXT, undo_until INTEGER, PRIMARY KEY(owner,collection,id));
      CREATE UNIQUE INDEX creations_identity ON creations(owner,collection,identity) WHERE deleted_at IS NULL;
      CREATE INDEX creations_list ON creations(owner,collection,deleted_at,created_at);
      CREATE TABLE attempts (owner TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, id TEXT NOT NULL, fingerprint TEXT, token_hash TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, payload TEXT, outcome TEXT, PRIMARY KEY(owner,id));
      CREATE TABLE app_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
    `);db.prepare("INSERT INTO app_migrations VALUES(1,?)").run(Date.now());
  })();
  if(!db.prepare("SELECT version FROM app_migrations WHERE version=2").get())db.transaction(()=>{
    db.exec("ALTER TABLE account_state ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0; ALTER TABLE attempts ADD COLUMN provenance TEXT;");
    db.prepare("INSERT INTO app_migrations VALUES(2,?)").run(Date.now());
  })();
  if(!db.prepare("SELECT version FROM app_migrations WHERE version=3").get())db.transaction(()=>{
    db.exec("ALTER TABLE creations ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0; ALTER TABLE attempts ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0; UPDATE creations SET updated_at=created_at; UPDATE attempts SET updated_at=created_at;");
    db.prepare("INSERT INTO app_migrations VALUES(3,?)").run(Date.now());
  })();
  databases.emojiAccountDb={path,db};return db;
}
