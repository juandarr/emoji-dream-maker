const response = await fetch("http://127.0.0.1:3000/api/health", { signal: AbortSignal.timeout(4000) });
const health = await response.json();
if (!response.ok || !health.ok || health.revision !== process.env.APP_REVISION) process.exit(1);
