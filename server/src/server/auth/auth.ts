import { LoginSession, EAuthTokenPlatformType, EAuthSessionGuardType } from "steam-session";
import { clearToken, loadToken, saveToken } from "./tokenStore.js";

export type GuardType = "emailCode" | "deviceCode" | "confirmation";

export interface AuthState {
  authenticated: boolean;
  awaitingGuard: boolean;
  guardType?: GuardType;
  error?: string;
}

interface ValidAction {
  type: number;
}

function mapGuard(actions: ValidAction[] | undefined): GuardType | undefined {
  for (const a of actions ?? []) {
    if (a.type === EAuthSessionGuardType.EmailCode) return "emailCode";
    if (a.type === EAuthSessionGuardType.DeviceCode) return "deviceCode";
    if (a.type === EAuthSessionGuardType.DeviceConfirmation || a.type === EAuthSessionGuardType.EmailConfirmation) {
      return "confirmation";
    }
  }
  return undefined;
}

/**
 * Owns the Steam login lifecycle. On success it encrypts and stores the refresh
 * token, then hands it to `onAuth` (which connects the inventory). On startup
 * `restore()` reuses a stored token so the user does not log in every time.
 */
export class AuthManager {
  private pending?: { session: LoginSession };
  private authed = false;
  private restoring = false;
  private remember = true;
  private guardType?: GuardType;
  private err?: string;

  constructor(private onAuth: (token: string) => Promise<void>) {}

  /** True while a stored token is being reused at startup. */
  get isRestoring(): boolean {
    return this.restoring;
  }

  state(): AuthState {
    const s: AuthState = { authenticated: this.authed, awaitingGuard: !!this.pending };
    if (this.guardType) s.guardType = this.guardType;
    if (this.err) s.error = this.err;
    return s;
  }

  /** Reuse a stored token if present and valid. Returns true if it connected. */
  async restore(): Promise<boolean> {
    const token = loadToken();
    if (!token) return false;
    this.restoring = true;
    try {
      await this.onAuth(token);
      this.authed = true;
      this.remember = true;
      return true;
    } catch (err) {
      this.err = err instanceof Error ? err.message : "stored login failed";
      return false;
    } finally {
      this.restoring = false;
    }
  }

  async login(accountName: string, password: string, remember = true): Promise<AuthState> {
    this.reset();
    this.remember = remember;
    const session = new LoginSession(EAuthTokenPlatformType.SteamClient);

    const done = new Promise<string>((resolve, reject) => {
      session.on("authenticated", () => resolve(session.refreshToken));
      session.on("error", (e: Error) => reject(e));
      session.on("timeout", () => reject(new Error("login timed out")));
    });
    // Finalizes whenever Steam authenticates: after a code, or after a mobile
    // confirmation with no code at all.
    void done.then((t) => this.finalize(t)).catch((e: Error) => {
      this.err = e.message;
      this.pending = undefined;
      this.guardType = undefined;
    });

    const start = await session.startWithCredentials({ accountName, password });
    if (start.actionRequired) {
      this.pending = { session };
      this.guardType = mapGuard(start.validActions as ValidAction[]);
    }
    return this.state();
  }

  async submitGuard(code: string): Promise<AuthState> {
    if (!this.pending) {
      this.err = "no login in progress";
      return this.state();
    }
    await this.pending.session.submitSteamGuardCode(code);
    // Authentication completes asynchronously; clients poll status.
    return this.state();
  }

  logout(): void {
    clearToken();
    this.authed = false;
    this.reset();
  }

  private async finalize(token: string): Promise<void> {
    if (this.remember) saveToken(token);
    else clearToken();
    this.pending = undefined;
    this.guardType = undefined;
    this.err = undefined;
    try {
      await this.onAuth(token);
      this.authed = true;
    } catch (err) {
      this.err = err instanceof Error ? err.message : "connect failed";
    }
  }

  private reset(): void {
    this.pending = undefined;
    this.guardType = undefined;
    this.err = undefined;
  }
}
