# Sunny — Mappa UI

## Struttura di navigazione

### Mobile (< 768px)
Header fisso in cima (saluto + bottone impostazioni) + **BottomNav** con 5 elementi:

| Posizione | Label | Route |
|-----------|-------|-------|
| 1 | Home | `/` |
| 2 | Insight | `/insights` |
| 3 | **+** (CTA centrale) | apre TransactionModal |
| 4 | Budget | `/budget` |
| 5 | Movimenti | `/transactions` |

### Desktop (≥ 768px)
**SideNav** fissa a sinistra (220px), contenuto spostato di `ml-[220px]`:

- Logo + indicatore sync
- Dashboard / Insight / Budget / Movimenti / **AI Coach** *(admin)*
- Bottoni: Importa CSV · Impostazioni · **Aggiungi** (CTA gold)

---

## Schermate principali

### 1. Dashboard `/`
`features/dashboard/Dashboard.tsx`

```
┌─ Hero ──────────────────────────────────────┐
│  Patrimonio netto  ·  Liquidità  ·  Investito│
└─────────────────────────────────────────────┘
┌─ Period selector ───────────────────────────┐
│  [1m] [3m] [6m] [1y]   ← mese →   Oggi     │
└─────────────────────────────────────────────┘
┌─ Stats ─────────────────────────────────────┐
│  Entrate  ·  Uscite  ·  Risparmio           │
└─────────────────────────────────────────────┘
┌─ InsightTicker (carousel) ──────────────────┐
┌─ AIDigestCard (sommario LLM) ───────────────┐

Desktop 2 colonne / Mobile 1 colonna:
┌─ Colonna sinistra ──┐  ┌─ Colonna destra ──┐
│  FlowBar            │  │  CategoryCard      │
│  TrendChart (6m)    │  │  AccountsCard      │
│  InvestmentSummary* │  │                   │
└─────────────────────┘  └───────────────────┘
```
`*` visibile solo se `enableInvestments = true`

**Subcomponents**:
- `FlowBar` — barra orizzontale Entrate vs Uscite vs Investimenti
- `TrendChart` — area chart 6 mesi (entrate / uscite / investimenti)
- `CategoryCard` — top categorie di spesa con donut
- `AccountsCard` — saldi o spesa per conto (toggle)
- `InvestmentSummaryCard` — snapshot investimenti → link a `/investments`
- `AIDigestCard` — testo LLM del mese
- `InsightTicker` — carosello insight con "Vedi tutto"

---

### 2. Investimenti `/investments`
`features/dashboard/InvestmentsScreen.tsx`
*(visibile solo se `enableInvestments = true`)*

```
← Investimenti

┌─ Hero card ─────────────────────────────────┐
│  Capitale investito  ·  Contributo mensile  │
└─────────────────────────────────────────────┘
┌─ Donut: allocazione per categoria ──────────┐
│  Legenda: % · operazioni · importo per cat  │
└─────────────────────────────────────────────┘
┌─ Donut: per tipo fondo* ────────────────────┐
│  Pensione / Obbligazionario / Azionario     │
│  + card esplicativa TFR                    │
└─────────────────────────────────────────────┘
┌─ Bar chart: contributi mensili (6m) ────────┐
┌─ Lista ultimi 50 movimenti investimento ────┐
```
`*` solo con `detailedInvestments = true`

---

### 3. Insight `/insights`
`features/insights/InsightsScreen.tsx`

```
Insight
[Entrate €X] [Uscite €X] [Risparmiato/Sforamento €X]

⚡ Priorità      (N)
🔮 Previsione    (N)
🗓️ Stagionalità  (N)
📈 Tendenze      (N)
🧠 Abitudini     (N)
✦  Questo mese   (N)
```

Ogni sezione espandibile con card cliccabili → **InsightDetailSheet** (modale con chart + spiegazione).

---

### 4. Budget `/budget`
`features/budget/BudgetScreen.tsx`

```
Budget

[Banner "stiamo imparando" se dati insufficienti]

┌─ BudgetOverview ────────────────────────────┐
│  Piano di [Mese]                            │
│  Barra: Uscite | Investimenti | Rimanente   │
│  Griglia: Entrate / Uscite / Invest / Saldo │
└─────────────────────────────────────────────┘
┌─ SavingsGoalCard ───────────────────────────┐
│  Obiettivo risparmio  [Modifica]            │
└─────────────────────────────────────────────┘
[Banner stagionalità — se categoria storica spike]
[SuggestedBudgetCard — se nessun budget impostato]

ENTRATE PREVISTE
┌─ CategoryBudgetList (income) ───────────────┐

USCITE
┌─ CategoryBudgetList (expense) ──────────────┐
│  Per ogni categoria:                        │
│    progress bar (realizzato + programmato)  │
│    stato: ok / attenzione / sforato         │
│    proiezione fine mese                     │
└─────────────────────────────────────────────┘

INVESTIMENTI  [se abilitati]
┌─ CategoryBudgetList (investment) ───────────┐

BudgetInsights (testi AI)
```

Toccando una riga → apre **BudgetEditSheet** sulla tab corrispondente.

---

### 5. Movimenti `/transactions`
`features/transactions/TransactionList.tsx`

```
[🔍 Cerca…]                           [Filtri ▼]

[Tutte] [● Entrate] [● Uscite] [● Investimenti]
                    [Espandi tutto] [Seleziona]

── Marzo 2025 ── (N)           Subtotale: €X
  TransactionRow
  TransactionRow  [Programmato]
  …

── Febbraio 2025 ──
  …
```

**Barra selezione bulk** (fisso in basso quando attiva):
`N selezionate  [Categoria]  [Conto]  [Elimina]`

**Pannello filtri** (slide-in):
- Ordina per: Data / Importo
- Direzione: Decrescente / Crescente
- Raggruppa per: Per mese / Per conto / Per categoria
- Periodo: Tutto / 1m / 3m / 6m / Anno
- Previsti: 5gg / 30gg / 3m / Tutti / Nascondi

---

### 6. Impostazioni `/settings/*`
`features/settings/SettingsScreen.tsx`

**Menu principale** (sub = `menu`):

| Voce | Sub-sezione |
|------|-------------|
| Generali | `generali` |
| Gestione dati | `gestione` |
| Dati (import/export) | `dati` |
| Conti | `conti` |
| Categorie | `categorie` |
| 💬 Lascia un feedback | apre FeedbackSheet |
| Info | `info` |
| Versioni | `versioni` |

**Generali**:
- Tema chiaro/scuro
- Includi investimenti nei calcoli
- Attiva sezione Budget
- Attiva sezione Investimenti
- Profondità insight (minimal / medium / advanced)
- AI abilitata
- Widget AI Coach
- Notifiche push + test

**Gestione**:
- Scarica JSON / CSV
- Elimina tutti i dati (con conferma)
- Elimina account (con re-auth Google)

**Conti**: lista drag-to-reorder, add/edit/delete → EditDefSheet

**Categorie**: sezioni per tipo (Entrate / Uscite / Investimenti), drag-to-reorder per tipo, add/edit/delete → EditDefSheet

---

### 7. AI Coach `/ai-coach`
`features/aiCoach/AICoachScreen.tsx`
*(solo admin — `isAdminUser(user)`)*

```
AI Coach          [X chiamate rimaste oggi]

"Descrivi un acquisto…"

Stato 1 — Form (AffordabilityForm):
  [Campo testo libero]  [Analizza →]

Stato 2 — Risultato (AffordabilityResultCard):
  Verdetto: ✅ Sì / ⚠️ Forse / ❌ No
  Dettagli numerici + suggerimenti tagli
  [Nuova analisi]

Stato 3 — Rate limit:
  "Limite giornaliero raggiunto (reset a mezzanotte UTC)"
```

---

## Onboarding `/` (nuovo utente)
`features/onboarding/OnboardingScreen.tsx`

Flusso 6 step in `OnboardingLayout` (fullscreen, progress dots, bottone Salta):

1. **Welcome** — titolo + CTA "Inizia"
2. **Goals** — selezione multipla obiettivi (budget / risparmio / investimenti / tracciamento)
3. **Account** — crea primo conto (nome, tipo, saldo iniziale)
4. **DataSource** — manuale / importa CSV / dati demo
5. **SavingsTarget** — preset risparmio mensile (€100/300/500 o custom)
6. **FirstInsight** — primo insight calcolato + "Completa"

Gli utenti esistenti con localStorage (`sunny:budget:{uid}`) saltano l'onboarding senza flash.

---

## Modali e sheet

| Componente | Trigger | Contenuto |
|------------|---------|-----------|
| **TransactionModal** | Bottone +, tap su riga | Form completo (tipo / descrizione / importo / data / categoria / conto / note / ricorrente / condiviso) |
| **SeriesEditChoiceSheet** | Tap su transazione ricorrente | Scelta: solo questa occorrenza vs tutta la serie |
| **BudgetEditSheet** | Tap su riga categoria in Budget | Tabs: Risparmio / Entrate / Uscite / Investim. |
| **InsightDetailSheet** | Tap su InsightCard | Chart + spiegazione (cosa / come / dati) |
| **EditDefSheet** | Add/edit in Conti o Categorie | Icona / label / colore / tipo / saldo iniziale / tipo fondo |
| **ImportModal** | "Importa CSV" in SideNav | Step 1: upload · Step 2: preview · Step 3: done |
| **FeedbackSheet** | Voce menu Impostazioni | Tipo (bug/idea/confuso/altro) + textarea + invio |
| **OptionSheet** | Selezione bulk categoria/conto | Lista filtrable con selezione singola |
| **PushPromoSheet** | Una tantum su iOS PWA | Promo notifiche push + "Apri impostazioni" |

---

## Feature flags

| Flag | Effetto |
|------|---------|
| `enableInvestments` | Mostra route `/investments` e schede investimenti |
| `enableBudget` | Mostra route `/budget` (altrimenti redirect) |
| `includeInvestments` | Include investimenti nei calcoli risparmio |
| `detailedInvestments` | Donut per tipo fondo + campi TFR/fee |
| `aiEnabled` | Abilita funzioni AI (digest, coach) |
| `aiCoachWidgetEnabled` | Widget floating AI Coach (solo admin) |
| `insightDepth` | `minimal` / `medium` / `advanced` — livello insight generati |

**Admin-only** (UID `qPtCOJGRrwOZ2EfjxMHwW6ZISXX2`): route `/ai-coach` + AICoachWidget.

---

## Design system

- **Tema**: dark (default) / light — toggle in Impostazioni
- **Layout responsive**: breakpoint `md` (768px) — mobile stack vs desktop 2 colonne + sidebar
- **Classi CSS chiave**: `glass-elevated`, `glass-cta-gold`, `animate-sheet-up`, `animate-fade-in-fast`, `label-caps`, `scrollbar-hide`
- **Colori tipo**: income → verde, expense → rosso/secondario, investment → oro, transfer → blu
- **Animazioni**: sheet slide-up dal basso, fade-in per modali, pulse per sync
