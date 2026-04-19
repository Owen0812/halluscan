const API_BASE =
  typeof window === "undefined"
    ? "http://127.0.0.1:8000"
    : `http://${window.location.hostname}:8000`;

export type SseEvent =
  | { event: "start"; text: string; session_id: string }
  | { event: "node_complete"; node: string; label: string; desc: string; data: Record<string, unknown> }
  | { event: "blocked"; reason: string }
  | { event: "done" };

export interface StreamCallbacks {
  onEvent: (e: SseEvent) => void;
  onError?: (err: Error) => void;
}

export async function streamScan(text: string, callbacks: StreamCallbacks) {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/scan/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    callbacks.onError?.(err as Error);
    return;
  }

  if (!response.ok || !response.body) {
    callbacks.onError?.(new Error(`HTTP ${response.status}`));
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      try {
        const payload = JSON.parse(line.slice(5).trim()) as SseEvent;
        callbacks.onEvent(payload);
      } catch {
        // skip malformed lines
      }
    }
  }
}
