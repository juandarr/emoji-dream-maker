import "server-only";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { resolve } from "node:path";
import { YouTubeError } from "./youtube-error";

type Worker = { child: ChildProcessWithoutNullStreams; busy: boolean; idle?: ReturnType<typeof setTimeout> };
const workers = new Set<Worker>();
const waiting: Array<() => void> = [];
const notify = () => waiting.splice(0).forEach(wake => wake());

function remove(worker: Worker) {
  clearTimeout(worker.idle);
  if (!workers.delete(worker)) return;
  // The worker only performs HTTP metadata searches and creates no descendants.
  worker.child.kill("SIGKILL");
  notify();
}
export function closeSearchWorkers() { for (const worker of workers) remove(worker); }

async function acquire(signal: AbortSignal): Promise<Worker> {
  for (;;) {
    signal.throwIfAborted();
    const available = [...workers].find(worker => !worker.busy);
    if (available) { available.busy = true; clearTimeout(available.idle); return available; }
    if (workers.size < 2) {
      const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV };
      for (const key of ["PATH", "SystemRoot", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL"]) if (process.env[key]) env[key] = process.env[key];
      const child = spawn(/* turbopackIgnore: true */ process.env.YTDLP_PYTHON || "python3", ["-I", "-u",
        resolve(process.cwd(), "scripts/ytdlp-worker.py"), resolve(process.env.YTDLP_PYTHON_ARCHIVE!)],
      { shell: false, stdio: ["pipe", "pipe", "pipe"], env });
      const worker: Worker = { child, busy: true };
      workers.add(worker);
      child.on("close", () => { workers.delete(worker); clearTimeout(worker.idle); notify(); });
      // Avoid an unhandled stream/process error while a worker is idle.
      child.on("error", () => remove(worker));
      child.stdin.on("error", () => remove(worker));
      return worker;
    }
    await new Promise<void>((done, reject) => {
      const wake = () => { signal.removeEventListener("abort", abort); done(); };
      const abort = () => { const index = waiting.indexOf(wake); if (index >= 0) waiting.splice(index, 1); reject(signal.reason); };
      waiting.push(wake); signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  }
}

export async function searchWithWorker(query: string, locale: string, signal: AbortSignal): Promise<unknown> {
  const worker = await acquire(signal);
  try {
    signal.throwIfAborted();
    return await new Promise((resolveResult, reject) => {
      let output = "", bytes = 0, errorBytes = 0, finished = false;
      const child = worker.child;
      const decoder = new StringDecoder("utf8");
      const finish = (error?: unknown, value?: unknown) => {
        if (finished) return;
        finished = true;
        signal.removeEventListener("abort", abort);
        child.stdout.off("data", data); child.stderr.off("data", stderr);
        child.off("close", close); child.off("error", failed); child.stdin.off("error", failed);
        if (error) { remove(worker); reject(error); } else resolveResult(value);
      };
      const abort = () => finish(signal.reason);
      const close = () => finish(new YouTubeError("network", "The video search worker stopped."));
      const failed = () => finish(new YouTubeError("setup", "The video search worker could not start."));
      const stderr = (chunk: Buffer) => { errorBytes += chunk.length; if (errorBytes > 65_536) close(); };
      const data = (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 6_000_000) return close();
        output += decoder.write(chunk);
        if (!output.includes("\n")) return;
        try {
          const result = JSON.parse(output);
          if (result.error) finish(new YouTubeError(result.error === "quota" ? "quota" : "network", "Video search failed."));
          else finish(undefined, result);
        } catch { finish(new YouTubeError("network", "Invalid video metadata.")); }
      };
      child.stdout.on("data", data); child.stderr.on("data", stderr);
      child.once("close", close); child.once("error", failed); child.stdin.once("error", failed);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      else child.stdin.write(JSON.stringify({ query, locale }) + "\n");
    });
  } finally {
    worker.busy = false;
    if (signal.aborted) remove(worker);
    if (workers.has(worker)) { worker.idle = setTimeout(() => remove(worker), 300_000); worker.idle.unref(); }
    notify();
  }
}
