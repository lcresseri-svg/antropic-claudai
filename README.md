# Sunny — finanza personale

PWA di finanza personale (React 18 + TypeScript + Vite) su Firebase
(Firestore, Auth Google, Cloud Functions `europe-west1`, FCM). Interfaccia in
italiano, timezone di riferimento Europe/Rome.

## Struttura

```
sunny/              app React (src/app = shell, src/features = domini)
functions/          Cloud Functions (moduli: recurring, notifications, ai,
                    shortcuts, metrics, deletion, feedback + shared)
firestore.rules     regole di sicurezza Firestore
firestore-tests/    test delle Rules (emulatore)
docs/               guide (shortcut spese iOS)
ARCHITETTURA.md     come funziona tutto (dati, motori, sicurezza)
HANDOFF.md          stato del progetto per chi subentra
IMPLEMENTATION_PROGRESS.md  registro decisioni/lavori della sessione corrente
```

## Comandi

```bash
# Frontend
cd sunny && npm ci
npx tsc --noEmit          # typecheck
npm test                  # unit test (vitest)
npm run build             # build produzione
npm run dev               # sviluppo locale (serve .env.local, vedi sunny/.env.example)

# Functions
cd functions && npm ci && npm run build

# Rules (serve Java per l'emulatore)
npm --prefix firestore-tests install
npx -y firebase-tools@13 emulators:exec --only firestore --project sunny-test \
  "npm --prefix firestore-tests run test"
```

## CI/CD

- `ci-tests.yml` — su ogni PR: typecheck + test + build frontend, typecheck +
  build + audit functions, test Rules su emulatore.
- `deploy-firebase.yml` / `deploy-functions.yml` — deploy SOLO su push a `main`.
  Mai `firebase deploy` a mano dal branch.

## Funzionalità gated (admin)

I flag delle funzioni in anteprima vivono in
`sunny/src/shared/featureRollout.ts` (rollout deterministico
admin → allowlist → percentuale → tutti). Le funzioni disponibili per tutti
non passano da lì. Dettagli in ARCHITETTURA.md.
