param([string]$NodePath, [string]$FirebaseCliPath, [string]$JavaBin)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Join-Path $PSScriptRoot '..')
if (Test-Path '.superpowers/missing-unix-socket-dir') { throw 'Expected absent Java socket fallback directory' }
$env:PATH = $JavaBin + ';' + (Split-Path $NodePath) + ';' + $env:PATH
$env:JAVA_TOOL_OPTIONS = '-Djdk.net.unixdomain.tmpdir=.superpowers/missing-unix-socket-dir'
& $NodePath $FirebaseCliPath emulators:exec --only firestore --project demo-sunny-piano --config firebase.piano-tests.json 'node firestore-tests/node_modules/vitest/vitest.mjs run --root firestore-tests'
exit $LASTEXITCODE
