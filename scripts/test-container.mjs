// Real native SQLite/authentication/restore smoke test; no external provider calls.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const image = process.argv[2] || "dreammaker-ci:test";
const name = `dreammaker-smoke-${randomUUID()}`;
const volume = name + "-data";
const base = "http://127.0.0.1:4310";
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 180000 }).trim();
const labels = JSON.parse(docker("image", "inspect", image, "--format", "{{json .Config.Labels}}"));
const revision = labels["org.opencontainers.image.revision"];
assert.match(revision, /^[0-9a-f]{40}$/);
let cookie = "";
async function request(path, body, method = body ? "POST" : "GET", expected = 200) {
  const response = await fetch(base + path, {
    method, redirect: "manual", signal: AbortSignal.timeout(20000),
    headers: { Origin: base, "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal(response.status, expected, `${method} ${path}`);
  const text = await response.text();
  return { response, data: text.startsWith("{") || text.startsWith("[") ? JSON.parse(text) : text };
}
async function ready() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const { data } = await request("/api/health");
      assert.deepEqual(data, { ok: true, revision });
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw new Error("Production container did not become ready");
}
try {
  docker("volume", "create", volume);
  docker("run", "--rm", "--user", "0", "--mount", `type=volume,src=${volume},dst=/data`, "--entrypoint", "sh", image, "-c", "chown 10001:10001 /data && chmod 700 /data");
  docker("run", "--detach", "--name", name, "--publish", "127.0.0.1:4310:3000", "--mount", `type=volume,src=${volume},dst=/data`,
    "--env", "BETTER_AUTH_SECRET=container-smoke-only-secret-at-least-32-characters", "--env", `BETTER_AUTH_URL=${base}`,
    "--env", "INVITATION_PHRASE=container-smoke-invitation", "--env", "INVITATION_EMOJI_ID=1F419", image);
  await ready();
  assert.equal(docker("exec", name, "id", "-u"), "10001");
  docker("exec", name, "node", "scripts/healthcheck.mjs");
  docker("exec", name, "python3", "-I", "-c", "import sys; sys.path.insert(0, '/opt/yt-dlp/yt-dlp'); import yt_dlp; print(yt_dlp.version.__version__)");
  assert.equal(docker("exec", name, "test", "-r", "scripts/ytdlp-worker.py"), "");
  await request("/", undefined, "GET", 307);
  await request("/login");
  await request("/emoji/noto/Noto-COLRv1.ttf");
  await request("/api/account/state", undefined, "GET", 401);
  await request("/api/generations", undefined, "GET", 401);
  const invalid = await fetch(base + "/api/account/register", { method: "POST", headers: { Origin: "https://other.example", "Content-Type": "application/json" }, body: "{}" });
  assert.equal(invalid.status, 403);
  await invalid.body?.cancel();
  const registration = await request("/api/account/register", { username: "container_smoke", name: "Container smoke", password: "disposable-ci-password-123" });
  cookie = registration.response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  assert.ok(cookie);
  await request("/api/account/state", undefined, "GET", 403);
  await request("/api/account/activate", { phrase: "container-smoke-invitation", emojiId: "1F419" });
  const initial = (await request("/api/account/state")).data;
  await request("/api/account/state", { ...initial, preferences: { ...initial.preferences, theme: "retro" } }, "PUT");
  const state = { schemaVersion: 1, id: randomUUID(), createdAt: Date.now(), settings: null, run: null, board: { schemaVersion: 1, title: "Container smoke", intent: "", interpretation: "", edges: [], nodes: [{ id: "moon", emojiId: "1F319", glyph: "🌙", label: "Moon", meaning: "Moon", note: "", role: "subject", x: 50, y: 50, scale: 1, rotation: 0 }] } };
  for (const collection of ["saved", "temporary"]) await request("/api/account/creations", { collection, state }, "PUT");
  docker("exec", name, "node", "scripts/account-backup.mjs", "/data/smoke-backup.sqlite");
  const database = JSON.parse(docker("exec", name, "node", "scripts/account-check.mjs", "/data/smoke-backup.sqlite"));
  assert.equal(database.counts.user, 1);
  assert.equal(database.counts.creations, 2);
  assert.equal(Math.max(...database.migrations), Number(labels["org.opencontainers.image.account-schema"]));
  assert.equal(docker("exec", name, "stat", "-c", "%a", "/data/accounts.sqlite"), "600");
  docker("restart", name);
  await ready();
  assert.equal((await request("/api/account/state")).data.preferences.theme, "retro");
  for (const collection of ["saved", "temporary"]) assert.equal((await request(`/api/account/creations?collection=${collection}`)).data.length, 1);
  // Restore a real online backup after shutdown, clearing WAL sidecars together.
  docker("stop", name);
  docker("run", "--rm", "--mount", `type=volume,src=${volume},dst=/data`, "--entrypoint", "sh", image, "-c", "rm -f /data/accounts.sqlite /data/accounts.sqlite-wal /data/accounts.sqlite-shm && cp /data/smoke-backup.sqlite /data/accounts.sqlite && chmod 600 /data/accounts.sqlite");
  docker("start", name);
  await ready();
  assert.equal((await request("/api/account/state")).data.preferences.theme, "retro");
  assert.equal((await request("/api/account/creations?collection=saved")).data.length, 1);
  console.log("Production container: native SQLite, auth/activation, protected APIs, assets, worker, persistent state, restart and backup/restore passed.");
} finally {
  try { docker("rm", "--force", name); } catch { /* May have failed before startup. */ }
  try { docker("volume", "rm", volume); } catch { /* May have failed before volume creation. */ }
}
