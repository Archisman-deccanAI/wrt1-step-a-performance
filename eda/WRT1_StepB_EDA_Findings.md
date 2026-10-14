# WRT1 Step A Performance App - Step B Data EDA

Date run: 2026-10-13
Source: Superset -> DW_PROD (Postgres), table `gold.wrt_item_label_trajectory`
Window: Step A annotated on or after 2026-09-30
Scope: Hyderabad Step A annotators (location = 'Hyd')

## Headline

Yes, Step B data is coming in, it is current, and it is fully attributable to individual Step A annotators. The product is feasible on this data. The one real piece of engineering is the identity map, and the EDA found a clean deterministic solution for it.

## 1. Step B data is present and fresh

`gold.wrt_item_label_trajectory` is updated to today, not two weeks behind.

- max step_a_annotated_date: 2026-10-13 13:39
- max step_b_annotated_date: 2026-10-13 12:35
- max dw_update_ts: 2026-10-13 13:41

Note: the ~2 week lag we worried about applies to the `test.sama_wrt_*` mirror tables, not to this gold table. Build the app on `gold.wrt_item_label_trajectory`.

## 2. Volume and coverage (Hyderabad, since 30 Sep)

- 102,028 Step A tasks across 24 Hyderabad annotators
- 36,211 of those (about 35%) have a Step B label so far

The ~35% is the "staircase" lag in action: Step B is still working through earlier batches, so most tasks annotated in the last two weeks have not been QC'd yet. The app will therefore show feedback on roughly a third of recent work, with the rest filling in over the following weeks. The UI needs an explicit "not yet reviewed" state and an "as of" date.

For comparison, Bangalore over the same window: 80,442 Step A tasks, 22,747 reviewed (about 28%), 23 agents.

## 3. Step B throughput is bursty, not steady

Step B reviews by day since 30 Sep: heavy on Oct 8, 9, 12, 13; near zero on Oct 2 to 7; nothing on weekends (Oct 3, 4, 10, 11). Feedback arrives in waves. An annotator may see nothing for several days, then a flood. Do not design the app around a steady daily trickle of corrections.

## 4. Disagreement signal is usable and discriminating

Among reviewed Hyderabad tasks, Step B disagreed with Step A on about 15% (`label_mismatch = 1`: 5,543 of 36,211). A direct label comparison gives about 14.5% (5,258), so the stored `label_mismatch` flag is close to but not identical to a raw comparison. Define the app's error metric explicitly against one of these and reuse it everywhere.

Per-annotator error rate ranges from about 8% to about 24%, which is a healthy spread to show people (see the CSV). One account sits at 41% (see data-quality note below).

## 5. Identity map: SOLVED deterministically (the important result)

The trajectory table names annotators only by display name (`step_a_agent`), and that name is neither unique nor clean (dirty double spaces, and display names that do not match the email, for example "Saroj Kumar" is `saroj.jena@...`).

Matching by name fails badly: of the 24 Hyderabad annotators, only 8 resolve to exactly one directory email, 10 do not match at all, and 6 are ambiguous (the name "Anshuman Sharma" alone hits 13 different user records).

The clean path is an id join, which resolves all 24 of 24 to exactly one account:

    trajectory.atdp_id
      -> bronze.annotation_task_data_points.id  (then its user_id, form usr_XXXX)
      -> bronze.annotation_users.id
      -> email, full_name, role

Build the identity map from this chain, never from names. The canonical query is in `identity_resolution_and_metrics.sql`.

## 6. Login design (changed by the data)

Annotators have managed work Google accounts, not personal gmail: every Hyderabad annotator resolves to an `@deccanteam.us` or `@teamdeccan.com` address (a few staff are on `@deccan.ai`). So:

- Google SSO can be domain restricted to `deccanteam.us`, `teamdeccan.com`, and `deccan.ai`.
- The login email maps directly, through the id chain above, to that person's Step A tasks. No separate account linking step is needed for annotators who sign in with their work account.

This reverses the earlier assumption that annotators were on personal gmail and the login could not be domain locked.

## 7. Data-quality flags for the build

- "Deccanexpert" (`adimulam.arun@teamdeccan.com`): 41% error rate, 0.16 min per task (about 10 seconds). Almost certainly a test / seed / expert account. Decide whether to exclude or investigate; do not show it as a normal annotator.
- A junk value "Wrt1_Batch2" appears in the `step_a_agent_location` field (5,288 tasks, 7 agents) alongside the real locations Hyd, Blr. Filter locations to a known allow-list.
- Display names carry inconsistent whitespace. Harmless once the id chain is the key, but do not use names as a join key anywhere.
- Joining trajectory -> atdp can fan out rows if not collapsed first. The canonical query collapses one user_id per atdp before joining, which keeps counts correct. Mirror that in the ingestion job.

## Implication for the app

Everything the product needs is in the warehouse today: fresh Step B verdicts, a clean per-annotator identity via the id chain, work Google accounts for real SSO, and a strong disagreement signal. Design the app to pull from `gold.wrt_item_label_trajectory` on a schedule, resolve identity through the id chain into a mapping table, show an "as of" date and a "not yet reviewed" state, and exclude test accounts and junk locations.

## Files

- `hyd_stepa_snapshot_from_2026-09-30.csv` - the 24 Hyderabad annotators with resolved email, volume, Step B coverage, error rate, and AHT. Doubles as the seed for the identity map.
- `identity_resolution_and_metrics.sql` - the canonical identity-resolution and metrics queries, reusable as the app's ingestion basis.
