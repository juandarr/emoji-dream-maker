import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runYtDlp } from "@/lib/ytdlp-process";

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn }));
function child() {
  const result = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(), stderr: new EventEmitter(), pid: undefined,
    kill: vi.fn(() => { queueMicrotask(() => result.emit("close", null)); return true; }),
  });
  return result;
}
beforeEach(() => { spawn.mockReset(); vi.stubEnv("YTDLP_PATH", "/tools/yt-dlp"); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("local video subprocess", () => {
  it("uses separate arguments, simulation, isolated configuration and no credentials", async () => {
    const process = child(); spawn.mockReturnValue(process); vi.stubEnv("YOUTUBE_API_KEY", "private-key");
    const promise = runYtDlp(["--dump-single-json", "--", "ytsearch25:love $(unsafe)"], new AbortController().signal);
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce());
    const [path, args, options] = spawn.mock.calls[0];
    expect(path).toBe("/tools/yt-dlp"); expect(options.shell).toBe(false); expect(options.env.YOUTUBE_API_KEY).toBeUndefined();
    for (const flag of ["--ignore-config", "--simulate", "--no-plugin-dirs", "--no-remote-components"]) expect(args).toContain(flag);
    expect(args.at(-1)).toBe("ytsearch25:love $(unsafe)");
    process.stdout.emit("data", Buffer.from('{"entries":[]}')); process.emit("close", 0);
    expect(await promise).toEqual({ entries: [] });
  });
  it("limits processes to two, and removes a cancelled queued request", async () => {
    const a = child(), b = child(), c = child(); spawn.mockReturnValueOnce(a).mockReturnValueOnce(b).mockReturnValueOnce(c);
    const first = runYtDlp([], new AbortController().signal), second = runYtDlp([], new AbortController().signal);
    const controller = new AbortController(); const queued = runYtDlp([], controller.signal);
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(2));
    controller.abort(); await expect(queued).rejects.toThrow();
    for (const process of [a, b]) { process.stdout.emit("data", Buffer.from("{}")); process.emit("close", 0); }
    await Promise.all([first, second]); expect(spawn).toHaveBeenCalledTimes(2);
    const next = runYtDlp([], new AbortController().signal);
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(3));
    c.stdout.emit("data", Buffer.from("{}")); c.emit("close", 0); await next;
  });
  it("terminates a running process when its caller cancels", async () => {
    const process = child(); spawn.mockReturnValue(process); const controller = new AbortController();
    const promise = runYtDlp([], controller.signal);
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce());
    controller.abort(); await expect(promise).rejects.toThrow(); expect(process.kill).toHaveBeenCalledOnce();
  });
  it.each(["stdout", "stderr"] as const)("terminates excessive %s output", async stream => {
    const process = child(); spawn.mockReturnValue(process);
    const promise = runYtDlp([], new AbortController().signal);
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce());
    process[stream].emit("data", Buffer.alloc(stream === "stdout" ? 6_000_001 : 65_537));
    await expect(promise).rejects.toMatchObject({ reason: "network" }); expect(process.kill).toHaveBeenCalledOnce();
  });
  it("reports missing executables as setup failures", async () => {
    const process = child(); spawn.mockReturnValue(process);
    const promise = runYtDlp([], new AbortController().signal);
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce());
    process.emit("error", Object.assign(new Error("missing"), { code: "ENOENT" })); process.emit("close", -2);
    await expect(promise).rejects.toMatchObject({ reason: "setup" });
  });
  it.each(["HTTP Error 429", "Sign in to confirm you’re not a bot", "HTTP Error 403"])("recognizes blocked requests: %s", text => {
    const process = child(); spawn.mockReturnValue(process);
    const promise = runYtDlp([], new AbortController().signal);
    queueMicrotask(() => { process.stderr.emit("data", Buffer.from(text)); process.emit("close", 1); });
    return expect(promise).rejects.toMatchObject({ reason: "quota" });
  });
  it("rejects malformed JSON output", async () => {
    const process = child(); spawn.mockReturnValue(process);
    const promise = runYtDlp([], new AbortController().signal);
    queueMicrotask(() => { process.stdout.emit("data", Buffer.from("invalid")); process.emit("close", 0); });
    await expect(promise).rejects.toMatchObject({ reason: "network" });
  });
});
