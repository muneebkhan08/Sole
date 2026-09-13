export type SseFrame = { event: string; data: unknown };

export function parseSseBlock(block: string): SseFrame | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (!dataLines.length) return null;
  const raw = dataLines.join("\n");
  try {
    return { event, data: JSON.parse(raw) };
  } catch {
    return { event, data: raw };
  }
}

export async function* readSse(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SseFrame> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    buf = buf.replace(/\r\n/g, "\n");
    let idx = buf.indexOf("\n\n");
    while (idx >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const frame = parseSseBlock(block);
      if (frame) yield frame;
      idx = buf.indexOf("\n\n");
    }
  }
  if (buf.trim()) {
    const frame = parseSseBlock(buf);
    if (frame) yield frame;
  }
}

export function sseEncode(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
