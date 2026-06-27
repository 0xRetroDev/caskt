<#
Generates a SELF-SIGNED code-signing certificate for TESTING the signed-build
pipeline locally.

This proves signing works end to end (the installer comes out signed and you can
inspect the signature), but a self-signed cert will NOT remove the Windows
SmartScreen "unknown publisher" warning for your users. For that you need a cert
from a trusted CA. See SIGNING.md.

Usage (PowerShell, from the desktop/ folder):
    .\scripts\make-test-cert.ps1
    $env:CSC_LINK = (Resolve-Path .\caskt-test-cert.pfx)
    $env:CSC_KEY_PASSWORD = "caskt-test"
    npm run dist
#>
param(
  [string]$Subject  = "CN=0xRetroDev (Test)",
  [string]$OutDir   = ".",
  [string]$Password = "caskt-test"
)

$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject $Subject `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -KeyExportPolicy Exportable `
  -KeyUsage DigitalSignature `
  -NotAfter (Get-Date).AddYears(3)

$pfxPath   = Join-Path $OutDir "caskt-test-cert.pfx"
$securePwd = ConvertTo-SecureString -String $Password -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $securePwd | Out-Null

Write-Host ""
Write-Host "Wrote $pfxPath (password: $Password)"
Write-Host ""
Write-Host "Build a signed installer locally:" -ForegroundColor Cyan
Write-Host "  `$env:CSC_LINK = (Resolve-Path '$pfxPath')"
Write-Host "  `$env:CSC_KEY_PASSWORD = '$Password'"
Write-Host "  npm run dist"
Write-Host ""
Write-Host "Base64 of the .pfx (paste into a GitHub secret named CSC_LINK if you"
Write-Host "want CI to use this test cert; set CSC_KEY_PASSWORD to the password):" -ForegroundColor Cyan
[Convert]::ToBase64String([IO.File]::ReadAllBytes($pfxPath))
