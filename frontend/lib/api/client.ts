/**
 * Talking to the licence service.
 *
 * Every function here is allowed to fail, and the caller is expected to carry on. HerdCare works
 * with no signal at all: the cloud buys backup, in-app payment and moving to a new phone, and
 * nothing else. So failures come back as a value rather than a thrown exception, which makes it
 * hard to write a screen that accidentally blocks on the network.
 */

/**
 * Where the Worker lives.
 *
 * `EXPO_PUBLIC_` is inlined into the bundle at build time, which is fine: a base URL is not a
 * secret. Nothing that *is* a secret ever belongs in this app — see the note in the root
 * .gitignore.
 */
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');

export function isCloudConfigured(): boolean {
  return API_BASE_URL.length > 0;
}

/** How long to wait before deciding the network is not going to answer. */
const TIMEOUT_MS = 20_000;

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number; offline?: boolean };

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT';
  body?: unknown;
  /** Bearer token: the device token for backup, nothing for the open endpoints. */
  token?: string | null;
  timeoutMs?: number;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  if (!isCloudConfigured()) {
    return { ok: false, error: 'Online features are not set up in this build yet.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });

    const text = await response.text();
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // A gateway error page rather than our JSON. Treat it as a server failure, not a crash.
      return { ok: false, error: 'The server sent something unexpected.', status: response.status };
    }

    if (!response.ok) {
      return {
        ok: false,
        error: typeof parsed?.error === 'string' ? parsed.error : 'That did not work.',
        status: response.status,
      };
    }

    return { ok: true, data: parsed as T };
  } catch (error) {
    // Abort, DNS failure, no route to host: all the same thing to a farmer standing in a field.
    const aborted = error instanceof Error && error.name === 'AbortError';
    return {
      ok: false,
      offline: true,
      error: aborted ? 'The network is too slow to reach us.' : 'No internet connection.',
    };
  } finally {
    clearTimeout(timer);
  }
}
