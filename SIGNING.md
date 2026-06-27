# Code signing

Unsigned Windows installers make SmartScreen show an "unknown publisher" warning,
and unsigned macOS apps trip Gatekeeper. Signing removes that friction. This is
optional, the app builds and runs unsigned, and signing is **off until you add
credentials**. Nothing here changes the unsigned build.

## The pipeline is already wired

`.github/workflows/release.yml` passes these to electron-builder, which signs
automatically when they are present and skips signing when they are absent:

- `CSC_LINK` — the Windows certificate (a base64-encoded `.pfx`, or a path/URL).
- `CSC_KEY_PASSWORD` — its password.
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` — macOS notarization.

So enabling Windows signing is, mechanically, just adding two GitHub secrets. The
catch is getting a usable certificate.

## Windows certificate options and cost (2026)

Since June 2023, certificate authorities no longer issue file-based code-signing
certificates: the private key must live on a hardware token or in a cloud HSM.
That rules out simply buying a `.pfx`. The realistic options:

- **Azure Trusted Signing — ~$9.99/month. Recommended.** Cloud-based, no hardware
  token, the cheapest path to a trusted signature. Requires a small change (see
  below) because it isn't file-based.
- **EV or OV certificate on a hardware token** (DigiCert, Sectigo, SSL.com) —
  roughly $250–600/year, and the physical USB token has to be plugged into the
  machine that signs, which is awkward in CI.
- **Cloud signing services** (DigiCert KeyLocker, SSL.com eSigner) — subscription,
  integrate through their `signtool` plugin.

EV certificates clear SmartScreen immediately; OV/standard certificates clear it
once the binary builds enough download reputation.

### Enabling Azure Trusted Signing

1. Create an Azure Trusted Signing account and a certificate profile.
2. Bump `electron-builder` to `^25` in `desktop/package.json` (v25 added built-in
   support; the current v24 does not have it).
3. Add to the `win:` block of `desktop/electron-builder.yml`:
   ```yaml
   azureSignOptions:
     publisherName: "<publisher name>"
     endpoint: "https://wus2.codesigning.azure.net/"
     codeSigningAccountName: "<your-account>"
     certificateProfileName: "<your-profile>"
   ```
4. Add the Azure auth secrets to the CI `env:` (alongside the existing ones):
   `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`.

That's the whole change; the rest of the pipeline is unchanged.

## Test the signed flow now, for free

You can validate that signing works end to end with a self-signed certificate. It
will **not** remove the SmartScreen warning for other people (the cert isn't
trusted by anyone), but it proves the build, the installer signature, and the
update-signature checks all work.

On Windows, from `desktop/`:

```powershell
.\scripts\make-test-cert.ps1
$env:CSC_LINK = (Resolve-Path .\caskt-test-cert.pfx)
$env:CSC_KEY_PASSWORD = "caskt-test"
npm run dist
```

Then right-click the installer → Properties → Digital Signatures to confirm it's
signed. Delete `caskt-test-cert.pfx` when done; never commit it.

## Auto-update and signing

Once you sign for real, keep the **same certificate / publisher name across
releases**. electron-updater verifies the publisher of an NSIS update before
applying it, so a changed publisher can block updates. When you have a real cert,
set `win.publisherName` in `electron-builder.yml` to the certificate's subject so
it stays consistent.

## macOS

macOS signing + notarization needs an Apple Developer account ($99/year) and is
deferred for now. The Apple secrets above are already wired; when you have the
account, add a `zip` target next to the `dmg` so `electron-updater` can apply mac
updates too. See BUILD.md.
