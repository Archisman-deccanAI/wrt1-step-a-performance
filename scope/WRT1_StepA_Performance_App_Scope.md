# WRT1 Step A Performance App - Scope and Design

Owner: Archis (Deccan AI, Walmart WRT1)
Date: 2026-10-14
Status: Draft scope for review (Siddhi, Sej)
Related: `../eda/WRT1_StepB_EDA_Findings.md`, `../eda/identity_resolution_and_metrics.sql`

## 1. Problem and purpose

Step A annotators in Hyderabad get no timely, attributable feedback on their work. The platform (Cosmo) has no live or inline review: a wrong task returns later as rework, detached from learning, and the pipeline runs as a staircase (Step A, then Step B in Bangalore, then HLQA, then client RCA, each on a different batch), so feedback is always days to weeks late.

This app gives each Step A Hyderabad annotator a self-serve view of their own performance based on Step B markings, lets them flag a Step B correction they believe is wrong, and routes that flag to the trainers (us) to resolve. Resolved flags become discussion points for calibration and seed the error-reason taxonomy we do not currently have.

## 2. Goals and non-goals

Goals:
- Each annotator sees their own Step B corrections and quality and speed metrics, from 30 September onward.
- Annotators can flag a specific Step B correction they disagree with, with a reason.
- Flags route to a trainer queue; trainers resolve each as "error upheld" or "Step B overturned", with a reason tag and note.
- Resolutions feed back to the annotator and accumulate as calibration discussion material and a reason taxonomy.
- Individual Google account logins, one person sees only their own data.

Non-goals (explicitly dropped or out of scope):
- No Step A to Step B rebuttal loop. Step B does not participate in the app. (Dropped: Step B lacks time for rebuttal items, and hosting it in PTQuest inherits PTQuest's non-adoption.)
- No peer voting, no adjudicator role.
- No write-back to the warehouse. The app never modifies `gold.*` or Cosmo data.
- Not a high-traffic system. About 24 Hyderabad annotators plus a few trainers. Design for clarity and trust, not scale.

## 3. Users and roles

- Annotator (Step A, Hyderabad): sees only their own metrics and corrections; can raise flags; sees flag outcomes.
- Trainer / Admin (us): sees the flag queue, resolves flags, sees team-level views, manages the identity map and reason taxonomy.
- Manager (read-only, optional, later): Siddhi or Sej; team-level views, no queue actions.

Role is assigned in the app, not inferred from the warehouse.

## 4. EDA findings that shape this design

From the 2026-10-14 EDA (full detail in the EDA findings file):

- Step B data is present and current. `gold.wrt_item_label_trajectory` is updated to the same day. Build on this table, not the `test.sama_wrt_*` mirrors, which lag about two weeks.
- Since 30 Sep: 102,028 Hyderabad Step A tasks, 24 annotators, about 15% Step B disagreement rate on reviewed tasks.
- Only about 35% of recent Step A tasks have a Step B label yet (staircase lag), and Step B throughput is bursty (clusters on some days, near zero on others, nothing on weekends). The UI must show an "as of" date and a clear "not yet reviewed" state.
- Identity is resolved deterministically through an id chain, not by name (name matching failed for two thirds of annotators): `trajectory.atdp_id -> bronze.annotation_task_data_points.user_id -> bronze.annotation_users.email`.
- Annotators use managed work Google accounts (`@deccanteam.us`, `@teamdeccan.com`; some staff on `@deccan.ai`), so Google SSO can be domain restricted and the login email maps straight to the person's tasks.
- Data-quality items to handle: exclude the test account "Deccanexpert" (`adimulam.arun@teamdeccan.com`); filter `step_a_agent_location` to a known allow-list (a junk value `Wrt1_Batch2` appears there); never use display names as a key.

## 5. Architecture

A modular monolith, not microservices. At this size that is the correct and cheapest choice.

Three parts:
1. Ingestion job: a scheduled process that runs the canonical SQL against the warehouse (DW_PROD, read-only user), resolves identity, computes per-annotator rollups and each annotator's own corrected-task list, and writes those derived slices into the app store. Runs where it can reach DW_PROD. It never writes back to the warehouse.
2. App store and API: holds the mirrored metric slices plus all app-owned transactional data (flags, resolutions, tags, points, audit log). Serves role-scoped reads and handles the flag workflow.
3. Web client: React single-page app with the three role views.

Data flow: DW_PROD (gold) -> ingestion job -> app store (derived slices) -> API -> client. Flags and resolutions are created in the client -> API -> app store, and never leave the app.

Principle: the app owns only what does not exist upstream (flags, resolutions, tags, points). Warehouse data is a read-only, cached mirror of per-annotator slices, refreshed on a cadence.

## 6. Recommended stack (simple and free)

Primary recommendation: Firebase on the free Spark tier.
- Firebase Auth, Google provider, restricted to `deccanteam.us`, `teamdeccan.com`, `deccan.ai`. Zero auth code, individual Google logins.
- Firestore for the app store (users and identity map, mirrored per-annotator slices, flags, resolutions, tags, points, audit log). Free tier covers tens of users comfortably because we cache only each person's own slice, never the full 1.66M-row table.
- Firebase Hosting for the React client. Free.
- Ingestion: a small scheduled Python job (reads DW_PROD, writes Firestore via the Admin SDK). Host it wherever it can reach the database, for example a scheduled GitHub Action or an internal cron, so the warehouse credentials stay server-side.

Simpler alternative if you want zero infrastructure: a Google Apps Script web app with Google Sheets as the store, a time-driven trigger pulling from DW_PROD, and domain login built in. It is the least setup but gets clunky for the trainer queue and does not grow well. Recommended only if you want the absolute minimum.

Decision needed: Firebase (recommended) or Apps Script. The rest of this doc assumes Firebase.

## 7. Data model

App-owned (Firestore collections, or tables if you prefer Postgres later):

- `app_user`: google_sub, email, display_name, role (annotator | trainer | manager), active. Created on first login, role set by a trainer.
- `identity_map`: annotator_email (work Google email) -> annotation_users.id (usr_...) -> canonical display name -> location -> active. Seeded from the EDA snapshot CSV, maintained by trainers. This is the join between a login and that person's warehouse tasks.
- `metric_slice` (mirrored, read-only, per annotator, refreshed by ingestion): annotator_email, as_of timestamp, window_start, step_a_tasks, step_b_reviewed, step_b_coverage_pct, step_b_mismatches, err_pct, avg_aht_mins.
- `correction` (mirrored, read-only, the rows an annotator can see and flag): trajectory_id, annotator_email, task_id, cosmo_batch_id, step_a_label, step_b_label, label_mismatch, step_a_annotated_date, step_b_annotated_date.
- `flag`: correction trajectory_id, raised_by (email), reason_text, status (open | resolved), created_at.
- `resolution`: flag_id, outcome (error_upheld | step_b_overturned), reason_tag, note, resolved_by, resolved_at.
- `reason_tag`: the controlled vocabulary of error reasons, grown by trainers from resolutions. This becomes the missing taxonomy.
- `discussion_point`: a resolved flag surfaced for calibration (outcome, tag, note, batch), the "points for discussion" output.
- `audit_log`: every flag and resolution event (who, what, when, before/after). Non-negotiable, since outcomes change numbers people are measured on.

Keying: everything about an annotator keys on their resolved identity (annotation_users.id / email), never on display name.

## 8. Ingestion and metric definitions

Source query: the canonical identity-resolved per-annotator and per-correction query in `../eda/identity_resolution_and_metrics.sql`. The ingestion job runs it (and a per-correction variant), filtered to the live window, and upserts the slices.

Rules the job must apply:
- Window: `step_a_annotated_date >= 2026-09-30` (the agreed start). Parameterize the start date.
- Identity: resolve through the id chain, collapsing one user_id per atdp first to avoid row fan-out.
- Location allow-list: keep only known real locations (Hyd for this app); drop junk values like `Wrt1_Batch2`.
- Exclude test and non-human accounts (start with "Deccanexpert" / `adimulam.arun@teamdeccan.com`); keep an exclusion list.
- Error metric: define it once. Use `label_mismatch = 1` as the official "Step B disagreed" signal, and note it differs slightly (about 0.8 points) from a raw label comparison. Count only reviewed tasks in the denominator.
- Coverage metric: `step_b_reviewed / step_a_tasks`. Show it, because about 65% of recent tasks are not yet reviewed and that context matters.
- Stamp every slice with an `as_of` timestamp (from `max(dw_update_ts)`), shown in the UI.
- Refresh cadence: start daily; the gold table is current, so cadence is a product choice, not a data limit.
- Later optimization: make the pull incremental by `dw_update_ts` once volumes grow.

A resolved flag adjusts how a correction counts: an overturned Step B correction is removed from the annotator's upheld-error count and credited to a Step B overturn stat. Only upheld errors count against the annotator. This keeps the error signal clean and gives a Step B accuracy number as a by-product.

## 9. Core workflows

Annotator dashboard:
- Header: my error rate (upheld), my Step B coverage, my average handling time, all with an as_of date and the window.
- My corrections: a list of my Step B corrections (what I labeled, what Step B changed it to, batch, date), each with a "Disagree" action.
- A "not yet reviewed" count so people understand most recent work is still pending Step B.

Flag:
- On a correction, the annotator clicks Disagree, writes a short required reason, submits. Status: open. It appears in the trainer queue. The annotator sees their own open and resolved flags.

Trainer queue and resolution:
- A queue of open flags across annotators, with the task context inline.
- The trainer resolves each as error upheld or Step B overturned, selects a reason tag, adds an optional note.
- On resolve: the annotator sees the outcome, metrics update, and the resolution is logged as a discussion point and into the audit log.
- Guardrails against queue overload (see risks): require the reason, cap open flags per annotator, and surface each annotator's own flag upheld-rate so low-signal flagging is visible.

## 10. Phased delivery

- v0: Google domain login + identity map seeded from the EDA snapshot + read-only annotator dashboard (my corrections, my error rate, coverage, AHT, as_of). Ships the core value: annotators finally see their feedback. No flagging yet.
- v1: Disagree button -> trainer queue -> trainer resolves with outcome + reason tag; annotator sees the outcome. Seeds the taxonomy. (Collapse v0 and v1 into one release if you want flagging from day one.)
- v2: reason-tag taxonomy management, discussion-point export for calibration, Step B overturn stats, team-level trainer analytics.
- v3: scheduled calibration support, manager read-only view, incremental ingestion, optional same-day sample pulse.

## 11. SDE practices

- Repo: single modular monorepo (client, api/functions, ingestion, infra). Conventional commits, protected main, PR review.
- Config and secrets: no credentials in code. DW_PROD read-only user and Firebase service account in a secret store (GitHub Actions secrets or Secret Manager).
- Migrations: schema or Firestore-rules changes versioned and reviewed.
- Testing: unit tests on the flag state machine and metric math; integration test on the ingestion job against a fixture DB; end-to-end test on login plus raise-and-resolve a flag.
- CI/CD: lint, type-check, test, build, deploy on merge. Separate dev and prod Firebase projects.
- IaC: Firebase project config, Firestore security rules, and scheduled-job definition in version control.
- Observability: structured logs, error tracking, an ingestion health check (last successful run, rows written, as_of freshness) visible to trainers.
- Audit: append-only audit log on all flag and resolution events.
- Access and privacy: this is individual performance data (quasi-HR). Annotators see only their own; Firestore security rules enforce row-level scoping server-side, not just in the UI. Least-privilege DB user (read-only, only the needed tables).

## 12. Risks and mitigations

- Trainer queue overload. Step B is no longer a filter, so every disagreement lands on us. Mitigate with a required reason, a per-annotator open-flag cap, visible flag upheld-rates, and batched triage. Watch volume in week one.
- Low coverage and bursty feedback. About 65% of recent tasks are unreviewed and feedback arrives in waves. Show "not yet reviewed" and the as_of date; set expectations that feedback trickles in.
- Metric trust. If the app's numbers disagree with the numbers used in calibration, the app loses credibility. Use one canonical query and one error definition everywhere.
- Gaming. If flagging or points reward the wrong thing, people flag to farm or avoid flagging to protect their rate. Tie any points to upheld, constructive resolutions, not to winning.
- Data quality. Test accounts and junk locations pollute the roster. Maintain explicit exclusion and location allow-lists in the ingestion job.
- Identity drift. New joiners or renamed accounts break the map. The trainer-maintained identity_map plus the deterministic id chain keeps this a small, visible task.

## 13. Open decisions

1. Stack: Firebase (recommended) or Apps Script.
2. Where the ingestion job runs (needs network reach to DW_PROD and a read-only user). Who can provision that?
3. v0 then v1, or ship flagging from day one.
4. "Points for discussion": confirmed as logged discussion material and taxonomy, not a visible leaderboard. Confirm no public scoreboard.
5. Reason-tag taxonomy: start from a seed list or grow purely from resolutions.
6. Whether trainers get team-level cross-annotator views in v1 or later.

## 14. Immediate next steps

1. Confirm the stack and where ingestion runs (decisions 1 and 2).
2. Build the identity_map from the EDA snapshot CSV and have you verify the 24 rows.
3. Finalize the per-correction ingestion query (the per-annotator query already exists).
4. Stand up the v0 skeleton: domain login, identity map, read-only dashboard.
