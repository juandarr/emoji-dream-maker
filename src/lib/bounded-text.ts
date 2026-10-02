export class BodyTooLargeError extends Error {
  constructor() { super("Response exceeds its size limit"); }
}

/** Enforce a byte limit while reading, including chunked bodies without a length. */
export async function boundedText(message: Pick<Response, "body" | "headers">, limit: number): Promise<string> {
  if (Number(message.headers.get("content-length")) > limit) {
    await message.body?.cancel().catch(() => {});
    throw new BodyTooLargeError();
  }
  if (!message.body) return "";
  const reader = message.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, text = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return text + decoder.decode();
      bytes += value.byteLength;
      if (bytes > limit) throw new BodyTooLargeError();
      text += decoder.decode(value, { stream: true });
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
}
