import "server-only";
import { spawn } from "node:child_process";
import { YouTubeError } from "./youtube-error";

let running = 0;
const waiting: Array<() => void> = [];
async function acquire(signal: AbortSignal) {
  signal.throwIfAborted();
  if (running < 2) { running++; return; }
  await new Promise<void>((resolve, reject) => {
    const ready = () => { signal.removeEventListener("abort", abort); resolve(); };
    const abort = () => {
      const index = waiting.indexOf(ready);
      if (index >= 0) waiting.splice(index, 1);
      reject(signal.reason);
    };
    waiting.push(ready);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
function release() {
  const next = waiting.shift();
  if (next) next(); else running--;
}

export async function runYtDlp(args: string[], signal: AbortSignal): Promise<unknown> {
  await acquire(signal);
  try {
    signal.throwIfAborted();
    return await new Promise<unknown>((resolve, reject) => {
      const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV };
      for (const key of ["PATH", "SystemRoot", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL"]) {
        if (process.env[key]) env[key] = process.env[key];
      }
      // Installed outside the build output; never trace the executable or local credentials into a bundle.
      const child = spawn(/* turbopackIgnore: true */ process.env.YTDLP_PATH || "yt-dlp", [
        "--ignore-config", "--no-plugin-dirs", "--simulate", "--no-cache-dir", "--no-progress", "--no-colors",
        "--socket-timeout", "5", "--retries", "0", "--extractor-retries", "0",
        "--no-js-runtimes", "--js-runtimes", `node:${process.execPath}`, "--no-remote-components",
        ...args,
      ], { shell: false, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32", env });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let outputBytes = 0, errorBytes = 0;
      let failure: unknown;
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const kill = (force = false) => {
        try {
          if (process.platform !== "win32" && child.pid) process.kill(-child.pid, force ? "SIGKILL" : "SIGTERM");
          else child.kill(force ? "SIGKILL" : "SIGTERM");
        } catch { /* The process may already have exited. */ }
      };
      const stop = (error: unknown) => {
        if (failure) return;
        failure = error;
        kill();
        killTimer = setTimeout(() => kill(true), 250);
      };
      const abort = () => stop(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      child.stdout.on("data", (chunk: Buffer) => {
        outputBytes += chunk.length;
        if (outputBytes > 6_000_000) stop(new YouTubeError("network", "The video metadata was too large."));
        else stdout.push(chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        errorBytes += chunk.length;
        if (errorBytes > 65_536) stop(new YouTubeError("network", "The video search returned excessive errors."));
        else stderr.push(chunk);
      });
      child.on("error", (error: NodeJS.ErrnoException) => {
        failure = new YouTubeError(error.code === "ENOENT" || error.code === "EACCES" ? "setup" : "network",
          "The local video search program could not be started.");
      });
      child.on("close", code => {
        signal.removeEventListener("abort", abort);
        if (killTimer) clearTimeout(killTimer);
        if (failure) return reject(failure);
        if (code !== 0) {
          const blocked = /429|403|confirm you.re not a bot|rate.limit|too many requests|content isn.t available, try again later/i.test(Buffer.concat(stderr).toString());
          return reject(new YouTubeError(blocked ? "quota" : "network", "The video search could not complete."));
        }
        try { resolve(JSON.parse(Buffer.concat(stdout).toString())); }
        catch { reject(new YouTubeError("network", "The video search returned invalid metadata.")); }
      });
    });
  } finally { release(); }
}
