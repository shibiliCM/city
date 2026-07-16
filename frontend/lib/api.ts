export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://127.0.0.1:8000/api/v1";

export const API_ORIGIN = API_BASE.replace(/\/api\/v1\/?$/, "");

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: "include",
      headers,
    });
  } catch {
    throw new Error(`Cannot reach backend at ${API_BASE}. Start the backend on port 8000 and check CORS.`);
  }
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("access_token");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    const data = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(data.detail || "Request failed");
  }
  return res.json();
}

export async function apiHealth(): Promise<{ status: string; db: string; service: string; version: string }> {
  try {
    const res = await fetch(`${API_ORIGIN}/health`, { credentials: "include" });
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  } catch {
    return { status: "offline", db: "disconnected", service: "CityTwin AI", version: "unknown" };
  }
}

export async function apiDownload(path: string): Promise<{ blob: Blob; filename: string }> {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers,
  });

  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("access_token");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    const data = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(data.detail || "Download failed");
  }

  const disposition = res.headers.get("Content-Disposition") || "";
  const filenameMatch = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  const filename = filenameMatch?.[1]
    ? decodeURIComponent(filenameMatch[1])
    : "citytwin-report";

  return { blob: await res.blob(), filename };
}

function getSessionId(): string {
  if (typeof window === "undefined") return "default";
  const existing = window.sessionStorage.getItem("citytwin_session_id");
  if (existing) return existing;
  const generated = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.sessionStorage.setItem("citytwin_session_id", generated);
  return generated;
}

export async function streamChat(
  path: string,
  body: unknown,
  onToken: (token: string) => void,
  options: { retries?: number; partial?: string } = {}
): Promise<void> {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const sessionId = getSessionId();

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      credentials: "include",
      headers: {
        ...Object.fromEntries(headers),
        "session-id": `web-${sessionId}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      if (res.status === 401 && typeof window !== "undefined") {
        localStorage.removeItem("access_token");
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      }
      const data = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(data.detail || "Stream request failed");
    }

    if (!res.body) return;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const events = buffer.split("\n\n");
      buffer = done ? "" : events.pop() || "";

      for (const event of events) {
        const data = event
          .split("\n")
          .filter(line => line.startsWith("data:"))
          .map(line => line.replace(/^data:\s?/, ""))
          .join("\n");
        if (!data) continue;
        if (data === "[DONE]") return;
        onToken(data);
      }

      if (done) break;
    }
  } catch (error) {
    const retries = options.retries ?? 1;
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 750));
      return streamChat(path, body, onToken, { ...options, retries: retries - 1 });
    }
    throw error;
  }
}
