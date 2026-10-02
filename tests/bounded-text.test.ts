import { expect, it, vi } from "vitest";
import { boundedText, BodyTooLargeError } from "@/lib/bounded-text";

it("decodes UTF-8 split across streamed chunks", async () => {
  const bytes = new TextEncoder().encode("Música 🐙");
  const response = new Response(new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  } }));
  expect(await boundedText(response, bytes.length)).toBe("Música 🐙");
});

it("stops consuming an oversized chunked body and cancels its stream", async () => {
  const cancel = vi.fn();
  let pulls = 0;
  const response = new Response(new ReadableStream({
    pull(controller) { pulls++; controller.enqueue(new Uint8Array(1024)); }, cancel,
  }));
  await expect(boundedText(response, 2048)).rejects.toBeInstanceOf(BodyTooLargeError);
  expect(cancel).toHaveBeenCalledOnce();
  expect(pulls).toBeLessThanOrEqual(4);
});

it("counts bytes rather than UTF-16 characters", async () => {
  await expect(boundedText(new Response("🐙"), 3)).rejects.toBeInstanceOf(BodyTooLargeError);
});
