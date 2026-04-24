const API_BASE =
  typeof window === "undefined"
    ? "http://127.0.0.1:8000"
    : `http://${window.location.hostname}:8000`;

export type SseEvent =
  | { event: "start"; text: string; session_id: string }
  | { event: "node_start"; node: string; label: string; desc: string; data: Record<string, unknown> }
  | { event: "node_complete"; node: string; label: string; desc: string; data: Record<string, unknown> }
  | { event: "blocked"; reason: string }
  | { event: "error"; message: string }
  | { event: "done" };

export interface StreamCallbacks {
  onEvent: (e: SseEvent) => void;
  onError?: (err: Error) => void;
}

export interface StreamHandle {
  abort: () => void;
}

export function streamScan(text: string, callbacks: StreamCallbacks): StreamHandle {
  const controller = new AbortController();
  const timeoutMs = Number(process.env.NEXT_PUBLIC_SCAN_TIMEOUT_MS ?? 180000);
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  async function run() {
    let sawTerminalEvent = false;
    try {
      const response = await fetch(`${API_BASE}/scan/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });

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
            if (payload.event === "done" || payload.event === "blocked" || payload.event === "error") {
              sawTerminalEvent = true;
            }
            callbacks.onEvent(payload);
          } catch {
            // Skip malformed SSE lines.
          }
        }
      }

      if (!sawTerminalEvent && !controller.signal.aborted) {
        callbacks.onError?.(new Error("Stream ended before completion"));
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        callbacks.onError?.(err as Error);
      }
    } finally {
      window.clearTimeout(timeout);
    }
  }

  void run();
  return { abort: () => controller.abort() };
}
