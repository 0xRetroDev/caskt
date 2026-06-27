#!/usr/bin/env node
// One-off helper to obtain a Steam refresh token for this app.
//   npm run login
// The token it prints is what goes in STEAM_REFRESH_TOKEN. It is as sensitive as
// your password: it logs the app into your account. Store it in an env var or a
// gitignored file, never commit it.
import { createInterface } from "node:readline/promises";
import { LoginSession, EAuthTokenPlatformType } from "steam-session";

async function main(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const accountName = (await rl.question("Steam username: ")).trim();
  const password = (await rl.question("Password: ")).trim();

  // SteamClient platform type yields a refresh token usable by steam-user.
  const session = new LoginSession(EAuthTokenPlatformType.SteamClient);

  session.on("authenticated", () => {
    console.log("\nRefresh token (set STEAM_REFRESH_TOKEN to this):\n");
    console.log(session.refreshToken);
    rl.close();
    process.exit(0);
  });
  session.on("error", (err) => {
    console.error("\nlogin failed:", err.message);
    rl.close();
    process.exit(1);
  });

  const started = await session.startWithCredentials({ accountName, password });

  if (started.actionRequired) {
    // Steam Guard: enter the code from your authenticator app or email.
    const code = (await rl.question("Steam Guard code: ")).trim();
    await session.submitSteamGuardCode(code);
  }
}

void main();
