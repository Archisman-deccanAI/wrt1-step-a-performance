# WRT1 Step A Performance

A standalone web app that shows Hyderabad **Step A** annotators on the Walmart WRT1 project how they are performing against **Step B** quality review, lets them flag corrections they disagree with, and gives trainers team-wide analytics plus a coaching view that groups people by the taxonomy mistakes they share.

Live: **https://wrt1-performance.web.app** (Firebase project `wrt1-performance`).

---

## Table of contents

1. [What this is](#what-this-is)
2. [Who sees what](#who-sees-what)
3. [Screens](#screens)
4. [Architecture](#architecture)
5. [Data model](#data-model)
6. [Where the numbers come from](#where-the-numbers-come-from)
7. [Repository layout](#repository-layout)
8. [Running locally](#running-locally)
9. [Configuration](#configuration)
10. [Deploying](#deploying)
11. [Refreshing the data (one tap)](#refreshing-the-data-one-tap)
12. [The Firestore free-tier constraint](#the-firestore-free-tier-constraint)
13. [Full automation (not yet set up)](#full-automation-not-yet-set-up)
14. [Security notes](#security-notes)
15. [Handoff](#handoff)

---

## What this is

Step A annotators label Walmart catalog items into a product taxonomy. Step B reviews a sample of that work and, where it disagrees, changes the label. This app turns that Step B signal into a feedback loop:

- **Annotators** see their own scorecard (how much of their work was Step B reviewed, how often Step B changed their label, their average handling time) and the exact tasks that were changed, with the full product context. If they believe Step B got it wrong, they flag the task for a trainer.
- **Trainers** see the whole team: a ranked error table, a flag queue they can resolve, and a **Coaching** view that finds the taxonomy pairs people most often confuse and groups the repeat offenders into cohorts, so a single refresher session can target the right people.
- **Viewers** (anyone on the `deccan.ai` domain) get the full read-only overall view.

Every quality number in the app is measured **against Step B only**. It deliberately does not fold in HLQA or client (RCA) review, and the UI says so in the places it matters.

## Who sees what

Role is derived at sign-in from the Google account:

| Role | Who | Can see | Can do |
|------|-----|---------|--------|
| **Annotator** | `@deccanteam.us`, `@teamdeccan.com` | Only their own dashboard and feedback | Flag corrections they disagree with |
| **Viewer** | `@deccan.ai` domain | Everything (overall view) | Read-only |
| **Trainer** | Listed in `app_user` with role `trainer` | Everything | Resolve flags, run the queue |

Current trainers: `ext.archisman@deccan.ai`, `bhavya.thammineni@deccan.ai`.
Preview/test annotator account: `archisman.hes@teamdeccan.com` (its data is left untouched by data loads so the annotator experience can be previewed safely).

Access is enforced in `app/firestore.rules`, not just in the UI.

## Screens

- **My dashboard** (annotator) — KPI cards (Step B error rate, coverage, AHT, tasks), a coverage banner, and the Step B feedback table. Clicking a row opens the full task (product image, name, brand, URLs, the label you gave vs the label Step B changed it to) with an inline flag form.
- **Trainer queue** — open flags with resolve actions and reason tagging; viewers see it read-only.
- **Analytics** — team Step B error rate, coverage, per-annotator bars and table, adjusted error (removes corrections that were flagged and overturned), flag outcomes by reason.
- **Coaching** — confusion hotspots (the top step_a → step_b label pairs by volume), a refresher cohort panel (who confuses the selected pair 5+ times, i.e. the group to pull into one session), and a full annotator × pair error matrix heatmap.
- **Light / dark theme** toggle, remembered per browser.

## Architecture

```
Superset (warehouse, Google SSO)
        │  queries run in the user's signed-in browser session
        ▼
  wrt_load.json  ──────►  auto_load.py  ──────►  Firestore
   (export file)          (service account)       (wrt1-performance)
                                                        │
                                                        ▼
                                              React SPA on Firebase Hosting
                                              (Google auth, domain-restricted)
```

- **Frontend**: React 18.3.1 + Vite 5.4.11, plain JSX (no TypeScript). Firebase JS SDK 10.14.1 for Auth + Firestore.
- **Two data modes**, switched by `VITE_DATA_MODE`:
  - `seed` — reads bundled sample JSON from `app/src/seed/`. No Firebase needed. Used for local dev and the demo role switcher.
  - `firebase` — reads live Firestore. Used in production.
- **Backend is Firestore only.** There is no app server. Writes are done out-of-band by the loader using a Firebase service account (Admin SDK bypasses security rules); all client access is read-only except flag create/resolve.
- **Deploys** go through the Firebase REST APIs (`ingestion/deploy_rules.py`, `ingestion/deploy_hosting.py`) using the service account, because `firebase-tools` deploy hits a `serviceusage` permission error in this project.

## Data model

Firestore collections:

| Collection / doc | Shape | Notes |
|------------------|-------|-------|
| `metric_slice/{email}` | one doc per annotator: `name`, `email`, `step_a_tasks`, `step_b_reviewed`, `step_b_coverage_pct`, `step_b_mismatches`, `err_pct`, `avg_aht_mins`, `last_step_b_date` | the scorecard |
| `correction_bundle/{email}` | `{ email, name, count, rows[] }` where each row is one Step B change (`task_id`, `batch`, `step_a_label`, `step_b_label`, `mismatch`, `date`, `product_name`, `brand`, `prod_type`, `image_url`, `description`) | **one doc per annotator**, not one per row |
| `agg/trainer` | `{ as_of, pairs[], rows[] }` — top confusion pairs and the per-annotator error matrix | powers the Coaching view |
| `meta/current` | `{ as_of, window_start, location, annotators, corrections, loaded_export_at, note }` | `loaded_export_at` is the idempotency marker |
| `app_user/{email}` | `{ email, role }` | trainer/admin roles |
| `flag/{id}` | `{ correction_id, annotator_email, raised_by, status, reason, outcome, reason_tag, resolved_by, ... }` | created by annotators, resolved by trainers |

> **Why bundles?** The first design stored every Step B change as its own `correction` document (~8,700 docs). A full refresh then cost ~8,700 writes and blew the Firestore free-tier daily write cap. Collapsing each annotator's rows into a single `correction_bundle` doc makes a full refresh ~25 writes, so it stays comfortably inside the free tier and never hits the cap again. Each bundle is capped at 1500 rows (most recent first) to stay under Firestore's 1 MB per-document limit. (An older per-row `correction` collection and its rules may still exist for backward compatibility; the app reads from `correction_bundle`.)

## Where the numbers come from

All data comes from the warehouse behind Superset (`superset.soulhq.ai`, database id `1`, Postgres), window from **30 September onward**, location **Hyd**.

- Scores and corrections come from `gold.wrt_item_label_trajectory` (one row per Step A item, with `step_a_label`, `step_b_label`, `label_mismatch`, dates, AHT, agent, location).
- Product context (name, brand, type, image, description) is joined from `gold.wrt_all_key` on `atdp_id`, deduped to one row per `atdp_id` so the join cannot fan out.
- **Identity resolution** maps an annotator to an email deterministically:
  `gold.wrt_item_label_trajectory.atdp_id` → `bronze.annotation_task_data_points.user_id` → `bronze.annotation_users.email`.
  (Name matching was unreliable, so the id chain is used instead.)
- `adimulam.arun@teamdeccan.com` ("Deccanexpert", the QC bench) is excluded from all loads.

The exact SQL lives in `ingestion/refresh.py`, `ingestion/queries.sql`, and in the refresh bookmarklet (`refresh/one-tap-refresh.html`). The EDA that established the identity chain and source tables is in `eda/`.

## Repository layout

```
15_StepA_Performance_App/
├── README.md
├── app/                         # the React + Vite single-page app
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── firebase.json
│   ├── firestore.rules          # Firestore security rules (access model)
│   ├── .env.example             # copy to .env.local and fill in
│   └── src/
│       ├── App.jsx              # top-level state, routing, auth, theme
│       ├── main.jsx
│       ├── auth.js              # Google sign-in (domain-restricted)
│       ├── firebase.js          # Firebase init
│       ├── config.js            # DATA_MODE + env
│       ├── data.js              # data layer (seed vs firebase)
│       ├── store.js             # flag create / list / resolve
│       ├── styles.css
│       ├── assets/              # the Deccan logo
│       ├── components/          # Login, Layout, Dashboard, KpiCards,
│       │                        # CorrectionsTable, TaskDetail, MyFlags,
│       │                        # TrainerQueue, Analytics, Coaching,
│       │                        # Brand, ThemeToggle, FlagModal
│       └── seed/                # sample JSON for seed mode
├── ingestion/                   # data loaders + deploy scripts (Python)
│   ├── auto_load.py             # load wrt_load.json -> Firestore (idempotent)
│   ├── refresh.py               # full refresh via the Superset API (for automation)
│   ├── load_initial.py          # load the seed JSON into Firestore
│   ├── deploy_rules.py          # deploy firestore.rules via REST
│   ├── deploy_hosting.py        # build output -> Firebase Hosting via REST
│   ├── queries.sql              # the canonical warehouse queries
│   ├── requirements.txt         # firebase-admin, requests
│   ├── github_refresh_workflow.yml  # sample GitHub Action for nightly refresh
│   └── serviceAccount.json      # (NOT in git) Firebase admin key
├── refresh/
│   └── one-tap-refresh.html     # install page for the refresh bookmarklet
├── eda/                         # exploratory analysis behind the design
└── scope/                       # the scope + design doc
```

## Running locally

Requires Node 18+.

```bash
cd app
npm install

# Option A: seed mode (no Firebase needed) - great for UI work
echo "VITE_DATA_MODE=seed" > .env.local
npm run dev        # http://localhost:5173, demo role switcher in the header

# Option B: firebase mode (live data)
cp .env.example .env.local   # then fill in the Firebase web config
npm run dev
```

In **seed mode** a demo dropdown in the header lets you switch between annotator / trainer / viewer and between sample annotators, so you can see every screen without signing in.

## Configuration

`app/.env.local` (never committed):

```
VITE_DATA_MODE=firebase            # or "seed"
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=wrt1-performance.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=wrt1-performance
VITE_FIREBASE_APP_ID=...
VITE_ALLOWED_DOMAINS=deccanteam.us,teamdeccan.com,deccan.ai
```

See `app/.env.example` for the template. The Firebase **web** config is not a secret (it ships in the client bundle), but the **service account** key is - see Security notes.

## Deploying

The loader and deploy scripts use a Firebase service account at `ingestion/serviceAccount.json`.

```bash
# 1. build
cd app && npm run build          # outputs app/dist

# 2. deploy security rules
cd ../ingestion
export GOOGLE_APPLICATION_CREDENTIALS="$PWD/serviceAccount.json"
python3 deploy_rules.py

# 3. deploy hosting
export DIST="../app/dist"
python3 deploy_hosting.py        # prints the live URL
```

`deploy_rules.py` creates a ruleset via `firebaserules.googleapis.com` and points the `cloud.firestore` release at it. `deploy_hosting.py` creates a hosting version via `firebasehosting.googleapis.com` v1beta1, uploads the gzipped files, finalizes, and releases. These REST paths are used because `firebase-tools deploy` fails on a `serviceusage` permission check in this project.

## Refreshing the data (one tap)

Superset is **Google SSO only**, so the pull runs in a signed-in browser session, not headless.

**Step 1 - export (one tap).** Open `refresh/one-tap-refresh.html`, drag the **Refresh WRT1 data** button to your bookmarks bar once. Then, whenever you want fresh numbers: open Superset (signed in) and click the bookmark. It runs the two queries and downloads `wrt_load.json` (~15s). The file lands in the app folder.

**Step 2 - load.** Run the idempotent loader (reads `wrt_load.json`, skips if that export is already live, writes `metric_slice` + `correction_bundle` + `agg/trainer` + `meta`):

```bash
cd ingestion
python3 -c 'import firebase_admin' 2>/dev/null || pip install --quiet --user firebase-admin
GOOGLE_APPLICATION_CREDENTIALS=$PWD/serviceAccount.json python3 auto_load.py
```

It prints one of: `LOADED N annotators, M corrections`, `already live`, or `Firestore daily write quota not reset yet`.

## The Firestore free-tier constraint

The project is on Firestore's **Spark (free) tier**: 20,000 writes/day, 50,000 reads/day, 1 GB storage. With the `correction_bundle` model a full refresh is ~25 writes and a handful of reads per user, so normal operation stays well inside the free tier. The one place this bit us: the original per-row load (~8,700 writes) plus a couple of reloads in a single day exhausted the daily write quota, which blocks all writes until it resets at midnight Pacific. If you ever do a heavy one-off reload and see `RESOURCE_EXHAUSTED / Quota exceeded`, wait for the reset or upgrade to the Blaze (pay-as-you-go) plan, where at this scale the bill is effectively zero.

## Full automation (not yet set up)

A truly hands-off nightly refresh needs a credential that is not Google SSO. The cleanest path:

1. Get **read-only Postgres credentials** to the warehouse behind Superset (SELECT on `gold` and `bronze`; host, port, database; and confirmation the DB is reachable from wherever the job runs).
2. Swap the Superset API calls in `ingestion/refresh.py` for a direct `psycopg2` connection.
3. Schedule it (the sample `ingestion/github_refresh_workflow.yml` runs it as a nightly GitHub Action; set `SUPERSET_*` / DB secrets and the service-account JSON as repo secrets).

Until that credential exists, refresh is the manual two-step above.

## Security notes

- **`ingestion/serviceAccount.json` is a Firebase admin private key. It must never be committed.** It is in `.gitignore`. If it is ever exposed, rotate it in the Firebase console immediately.
- `.env.local` is gitignored. The Firebase web config it holds is not secret, but keep the file out of git anyway.
- `wrt_load*.json` and the `seed/` sample data contain real annotator names and emails. **Keep this repository private.**
- Firestore access is enforced server-side by `app/firestore.rules`: annotators can read only their own slice/bundle/flags; `deccan.ai` and trainers can read everything; only trainers can resolve flags; all metric/correction/agg data is written only by the service account.

## Handoff

**State as of this writing**

- The app is live at https://wrt1-performance.web.app. Trainer **Analytics** and **Coaching** render real team data. Annotator dashboards read `correction_bundle`, populated by a loader run (see the free-tier note; the first clean bundle load runs after the daily quota reset).
- Google sign-in is enabled and domain-restricted. Firestore is created. The service account key lives at `ingestion/serviceAccount.json` on the maintainer's machine (not in git).

**To run or hand off the project you need**

1. The Firebase project `wrt1-performance` (owner access), or your own Firebase project (then update `.env.local`, the `firestore.rules` target, and the service account).
2. `ingestion/serviceAccount.json` for that project (Firebase console → Project settings → Service accounts → Generate new private key). Place it in `ingestion/`.
3. `app/.env.local` filled from `.env.example`.
4. Node 18+ and Python 3 with `firebase-admin` and `requests` (`pip install -r ingestion/requirements.txt`).

**Common tasks**

- *Change the data window or location*: edit `WINDOW_START` / `LOCATION` in `ingestion/refresh.py` and the `WIN` / `LOC` constants in `refresh/one-tap-refresh.html`.
- *Add a trainer*: add their email to `TRAINERS` in `auto_load.py` / `refresh.py` (or write an `app_user/{email}` doc with `role: trainer`).
- *Refresh the numbers*: bookmarklet export + `auto_load.py` (see above).
- *Change access rules*: edit `app/firestore.rules`, then `python3 ingestion/deploy_rules.py`.
- *Ship a UI change*: `npm run build` in `app/`, then `python3 ingestion/deploy_hosting.py`.

**Known limitations / next steps**

- Refresh is manual (two steps) until read-only Postgres access to the warehouse is available; then `refresh.py` can go fully nightly.
- The coaching confusion aggregate is recomputed from the same export as the dashboards, so the two are always consistent.
- Flag outcomes feed an "adjusted error" column; as trainers resolve flags, that becomes the number to coach against (it strips out Step B's own mistakes).

---

Built for the Walmart WRT1 Step A quality-management workstream.
