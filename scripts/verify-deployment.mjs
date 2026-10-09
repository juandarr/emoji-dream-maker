const [base, revision] = process.argv.slice(2);
if (!base || !/^https:\/\//.test(base) || !/^[0-9a-f]{40}$/.test(revision || "")) throw new Error("Pass the public HTTPS origin and expected Git revision.");
const url = new URL("/api/health", base);
const deadline = Date.now() + 10 * 60 * 1000;
while (Date.now() < deadline) {
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    const health = await response.json();
    if (response.ok && health.ok && health.revision === revision) {
      console.log(`Production is ready at ${revision}`);
      process.exit(0);
    }
  } catch { /* Offline, maintenance, or an older image: keep waiting within the deadline. */ }
  await new Promise(resolve => setTimeout(resolve, 15000));
}
throw new Error("Production did not report the expected revision within ten minutes. Inspect the Ubuntu updater journal; image publication alone does not confirm deployment.");
