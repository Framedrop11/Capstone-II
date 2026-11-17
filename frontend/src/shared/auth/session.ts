import { getApiBaseUrl } from '../runtime-config';

export type SessionRole = 'patient' | 'doctor' | 'admin';
export type SessionStatus = 'loading' | 'authenticated' | 'anonymous';

export interface SessionSnapshot {
  status: SessionStatus;
  accessToken: string | null;
  userId: string | null;
  role: SessionRole | null;
}

interface SessionResponse {
  accessToken: string;
  userId: string;
  role: SessionRole;
}

interface AuthSessionOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  openWindow?: typeof window.open;
}

const anonymous: SessionSnapshot = {
  status: 'anonymous',
  accessToken: null,
  userId: null,
  role: null,
};

function isSessionResponse(value: unknown): value is SessionResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['accessToken'] === 'string' &&
    typeof candidate['userId'] === 'string' &&
    ['patient', 'doctor', 'admin'].includes(String(candidate['role']))
  );
}

export function isPopupSessionEvent(
  event: Pick<MessageEvent, 'origin' | 'source' | 'data'>,
  popup: MessageEventSource,
  expectedOrigin: string,
): SessionResponse | null {
  if (event.origin !== expectedOrigin || event.source !== popup || !isSessionResponse(event.data))
    return null;
  if ((event.data as unknown as Record<string, unknown>)['type'] !== 'carelens:auth-complete')
    return null;
  return event.data as SessionResponse;
}

export class AuthPopupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthPopupError';
  }
}

export class AuthSession {
  private snapshot: SessionSnapshot = { ...anonymous, status: 'loading' };
  private refreshFlight: Promise<boolean> | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly openWindow: typeof window.open;

  constructor(options: AuthSessionOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl ?? getApiBaseUrl();
    this.openWindow = options.openWindow ?? window.open.bind(window);
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): SessionSnapshot => this.snapshot;

  getAccessToken(): string | null {
    return this.snapshot.accessToken;
  }

  private update(snapshot: SessionSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }

  private setAuthenticated(response: SessionResponse): void {
    this.update({ status: 'authenticated', ...response });
  }

  private setAnonymous(): void {
    this.update(anonymous);
  }

  acceptPopupMessage(
    event: Pick<MessageEvent, 'origin' | 'source' | 'data'>,
    popup: MessageEventSource,
    expectedOrigin: string,
  ): boolean {
    const response = isPopupSessionEvent(event, popup, expectedOrigin);
    if (!response) return false;
    this.setAuthenticated(response);
    return true;
  }

  async signInWithGoogle(mockRole?: 'patient' | 'doctor' | 'admin'): Promise<SessionSnapshot> {
    const login = new URLSearchParams({ response_mode: 'popup' });
    if (mockRole) login.set('mock_role', mockRole);
    const loginUrl = new URL(
      `/api/v1/auth/login?${login.toString()}`,
      this.baseUrl || window.location.origin,
    ).toString();
    const popup = this.openWindow(loginUrl, 'carelens-sign-in', 'popup,width=520,height=680');
    if (!popup) throw new AuthPopupError('Allow the sign-in window to continue.');

    return new Promise<SessionSnapshot>((resolve, reject) => {
      const cleanup = () => {
        window.removeEventListener('message', onMessage);
        window.clearInterval(closeCheck);
      };
      const onMessage = (event: MessageEvent<unknown>) => {
        if (!this.acceptPopupMessage(event, popup, window.location.origin)) return;
        cleanup();
        resolve(this.snapshot);
      };
      const closeCheck = window.setInterval(() => {
        if (popup.closed) {
          cleanup();
          reject(new AuthPopupError('Sign-in was closed before it finished.'));
        }
      }, 250);
      window.addEventListener('message', onMessage);
      popup.focus();
    });
  }

  async restore(): Promise<boolean> {
    const restored = await this.refresh();
    if (!restored && this.snapshot.status === 'loading') this.setAnonymous();
    return restored;
  }

  async refresh(): Promise<boolean> {
    if (this.refreshFlight) return this.refreshFlight;
    const flight = this.performRefresh();
    this.refreshFlight = flight;
    try {
      return await flight;
    } finally {
      if (this.refreshFlight === flight) this.refreshFlight = null;
    }
  }

  private async performRefresh(): Promise<boolean> {
    try {
      const response = await this.fetchImpl(
        new URL('/api/v1/auth/refresh', this.baseUrl || window.location.origin),
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        },
      );
      if (response.status === 401) {
        this.setAnonymous();
        return false;
      }
      if (!response.ok) return false;
      const payload: unknown = await response.json();
      if (!isSessionResponse(payload)) return false;
      this.setAuthenticated(payload);
      return true;
    } catch {
      return false;
    }
  }

  async signOut(): Promise<void> {
    try {
      await this.fetchImpl(new URL('/api/v1/auth/logout', this.baseUrl || window.location.origin), {
        method: 'POST',
        credentials: 'same-origin',
      });
    } finally {
      this.setAnonymous();
    }
  }
}
