import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { closeSearchWorkers, searchWithWorker } from "@/lib/ytdlp-worker";

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn }));
function child() {
  const result = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(), stderr: new EventEmitter(),
    stdin: Object.assign(new EventEmitter(), { write: vi.fn() }),
    kill: vi.fn(() => { queueMicrotask(() => result.emit("close", null)); return true; }),
  });
  return result;
}
beforeEach(() => { spawn.mockReset(); vi.stubEnv("YTDLP_PYTHON_ARCHIVE", "/tools/yt-dlp"); });
afterEach(() => { closeSearchWorkers(); vi.unstubAllEnvs(); });

it("reuses initialized workers and transmits queries as data without credentials", async () => {
  const process = child(); spawn.mockReturnValue(process); vi.stubEnv("YOUTUBE_API_KEY", "secret");
  const first = searchWithWorker("octopus $(unsafe)", "en", new AbortController().signal);
  await vi.waitFor(() => expect(process.stdin.write).toHaveBeenCalledOnce());
  expect(JSON.parse(process.stdin.write.mock.calls[0][0])).toEqual({ query: "octopus $(unsafe)", locale: "en" });
  expect(spawn.mock.calls[0][2].shell).toBe(false);
  expect(spawn.mock.calls[0][2].env.YOUTUBE_API_KEY).toBeUndefined();
  expect(spawn.mock.calls[0][1]).toContain("-I");
  process.stdout.emit("data", Buffer.from('{"entries":[]}\n')); await first;
  const second = searchWithWorker("music", "en", new AbortController().signal);
  await vi.waitFor(() => expect(process.stdin.write).toHaveBeenCalledTimes(2));
  process.stdout.emit("data", Buffer.from('{"entries":[]}\n')); await second;
  expect(spawn).toHaveBeenCalledOnce();
});
it("limits the pool to two and cancels queued callers without killing another search", async () => {
  const a = child(), b = child(); spawn.mockReturnValueOnce(a).mockReturnValueOnce(b);
  const first = searchWithWorker("a", "en", new AbortController().signal);
  const second = searchWithWorker("b", "en", new AbortController().signal);
  const controller = new AbortController();
  const third = searchWithWorker("c", "en", controller.signal);
  await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(2));
  controller.abort(); await expect(third).rejects.toThrow();
  expect(a.kill).not.toHaveBeenCalled(); expect(b.kill).not.toHaveBeenCalled();
  for (const process of [a, b]) process.stdout.emit("data", Buffer.from('{"entries":[]}\n'));
  await Promise.all([first, second]);
});
it("kills a cancelled worker and replaces it on the next search", async () => {
  const a = child(), b = child(); spawn.mockReturnValueOnce(a).mockReturnValueOnce(b);
  const controller = new AbortController(); const first = searchWithWorker("a", "en", controller.signal);
  await vi.waitFor(() => expect(a.stdin.write).toHaveBeenCalledOnce());
  controller.abort(); await expect(first).rejects.toThrow(); expect(a.kill).toHaveBeenCalled();
  const second = searchWithWorker("b", "en", new AbortController().signal);
  await vi.waitFor(() => expect(b.stdin.write).toHaveBeenCalledOnce());
  b.stdout.emit("data", Buffer.from('{"entries":[]}\n')); await second;
});
it.each(['broken\n', '{"error":"quota"}\n'])("rejects bad worker responses: %s", async output => {
  const process = child(); spawn.mockReturnValue(process);
  const promise = searchWithWorker("a", "en", new AbortController().signal);
  await vi.waitFor(() => expect(process.stdin.write).toHaveBeenCalledOnce());
  process.stdout.emit("data", Buffer.from(output));
  await expect(promise).rejects.toMatchObject({ reason: output.startsWith("broken") ? "network" : "quota" });
});
it("bounds worker output and preserves split UTF-8 characters", async () => {
  const process = child(); spawn.mockReturnValue(process);
  const first = searchWithWorker("a", "es", new AbortController().signal);
  await vi.waitFor(() => expect(process.stdin.write).toHaveBeenCalledOnce());
  const output = Buffer.from('{"title":"Música"}\n'); const cut = output.indexOf(Buffer.from("ú")) + 1;
  process.stdout.emit("data", output.subarray(0, cut)); process.stdout.emit("data", output.subarray(cut));
  expect(await first).toEqual({ title: "Música" });
  const second = searchWithWorker("b", "es", new AbortController().signal);
  await vi.waitFor(() => expect(process.stdin.write).toHaveBeenCalledTimes(2));
  process.stdout.emit("data", Buffer.alloc(6_000_001)); await expect(second).rejects.toThrow();
});
