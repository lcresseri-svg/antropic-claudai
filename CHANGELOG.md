# Changelog — Sunny

Log condiviso delle modifiche fatte dagli assistenti AI che lavorano su questo
repository (**Claude Code** e **Codex**). Serve a entrambi per vedere cosa è
stato cambiato, quando e perché, senza dover ricostruire tutto dalla cronologia
git.

## Come aggiungere una voce

- Aggiungi le modifiche **in cima**, sotto la data di oggi (formato `AAAA-MM-GG`).
- Crea una nuova sezione data solo se non esiste già.
- Ogni voce: `**[Agente]** descrizione sintetica` + hash del commit tra backtick.
  - Agente = `Claude` oppure `Codex`.
- Registra solo modifiche significative (feature, fix, refactor, UI), non i
  commit di solo formato o WIP.
- Aggiorna questo file **nello stesso commit** della modifica che descrive.

---

## 2026-06-01

- **[Claude]** Fix sicurezza: chiave Firebase rimossa dal codice sorgente e spostata in variabili d'ambiente Vite (`VITE_FIREBASE_*`). `sunny/.env.local` gitignored. Workflow di deploy aggiornato per passare le `VITE_FIREBASE_*` alla build (chiave API via GitHub Secret `VITE_FIREBASE_API_KEY`, valori pubblici inline). — `4b8e5b3`

---

## 2026-05-31

- **[Claude]** Navbar riorganizzata in layout simmetrico `Home · Insight · (+) · Budget · Movimenti` e nuova sezione **Insight** dedicata (`/insights`); la Dashboard mostra un'anteprima di 3 insight con link "Vedi tutti". Aggiunte emoji vestiti da uomo (👔 👕 👖) alla palette categorie. — `6d9b1bb`
- **[Claude]** Nuova sezione **Budget** (copilota finanziario): obiettivo di risparmio mensile, budget per categoria con stati calmi (normale / vicino al limite / sopra il previsto), budget suggerito da Sunny, "Consigli Sunny". Persistenza in localStorage, dati demo di fallback, componente `ProgressBar` riutilizzabile. — `b812754`
- **[Claude]** Redesign UI verso estetica luxury fintech stile Trade Republic: sfondo quasi nero (#050505), card appena distinguibili, oro desaturato (#C8A05A), rimozione di glow/gradienti/blur, logo semplificato. — `099909b`
- **[Claude]** Semplificata l'inizializzazione di Firestore per risolvere la sincronizzazione cross-device. — `a63811f`

## 2026-05-30

- **[Claude]** Spostato il backdrop del dropdown fuori dallo stacking context dell'header (fix z-index avatar). — `1e9b8ca`
- **[Claude]** Layout desktop responsive con sidebar fissa (220px) e bottom nav solo su mobile. — `56420a3`
- **[Claude]** Impostazioni ristrutturate in tre voci di menu navigabili (Generali / Gestione / Dati). — `18510b0`
- **[Claude]** Saldo iniziale per conto, fix trasparenza glass in dark mode, restructure impostazioni. — `b62059d`
- **[Claude]** Vari fix tema chiaro/scuro: toggle, glass-nav/header in light mode, persistenza senza stale-closure. — `d7e386e`, `15185b0`, `e34a4ec`, `58d8ff6`
