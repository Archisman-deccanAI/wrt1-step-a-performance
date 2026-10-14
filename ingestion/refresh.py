#!/usr/bin/env python3
"""
WRT1 Step A Performance - nightly refresh.

Reads from the warehouse THROUGH the Superset API (no direct DB networking),
resolves annotator identity via the id chain, and writes per-annotator slices
and corrections into Firestore. Designed to run as a scheduled GitHub Action.

Environment variables:
  SUPERSET_URL        e.g. https://superset.soulhq.ai
  SUPERSET_USERNAME   a Superset login (ideally a dedicated read-only account)
  SUPERSET_PASSWORD   that account's password
  SUPERSET_DB_ID      database id (DW_PROD = 1)
  GOOGLE_APPLICATION_CREDENTIALS  path to the Firebase service-account JSON
  WINDOW_START        default 2026-09-30
  LOCATION            default Hyd
"""
import os
import sys
import requests
import firebase_admin
from firebase_admin import credentials, firestore

SUPERSET_URL = os.environ.get("SUPERSET_URL", "https://superset.soulhq.ai").rstrip("/")
USERNAME = os.environ["SUPERSET_USERNAME"]
PASSWORD = os.environ["SUPERSET_PASSWORD"]
DB_ID = int(os.environ.get("SUPERSET_DB_ID", "1"))
WINDOW_START = os.environ.get("WINDOW_START", "2026-09-30")
LOCATION = os.environ.get("LOCATION", "Hyd")

# Accounts to exclude (test / non-human). Extend as needed.
EXCLUDE_EMAILS = {"adimulam.arun@teamdeccan.com"}  # "Deccanexpert"
TRAINER_EMAILS = [e.strip() for e in os.environ.get("TRAINER_EMAILS", "").split(",") if e.strip()]

PER_ANNOTATOR_SQL = f"""
WITH atdp_user AS (
  SELECT id AS atdp_id, MAX(user_id) AS uid
  FROM bronze.annotation_task_data_points GROUP BY id
)
SELECT au.email AS annotator_email,
       t.step_a_agent AS display_name,
       COUNT(*) AS step_a_tasks,
       COUNT(t.step_b_label) AS step_b_reviewed,
       ROUND(100.0*COUNT(t.step_b_label)/COUNT(*),1) AS step_b_coverage_pct,
       SUM(CASE WHEN t.label_mismatch=1 THEN 1 ELSE 0 END) AS step_b_mismatches,
       ROUND(100.0*SUM(CASE WHEN t.label_mismatch=1 THEN 1 ELSE 0 END)/NULLIF(COUNT(t.step_b_label),0),1) AS err_pct,
       ROUND(AVG(t.step_a_item_submission_mins),2) AS avg_aht_mins,
       CAST(MAX(t.step_b_annotated_date) AS date) AS last_step_b_date
FROM gold.wrt_item_label_trajectory t
LEFT JOIN atdp_user a ON a.atdp_id = t.atdp_id
LEFT JOIN bronze.annotation_users au ON au.id = a.uid
WHERE t.step_a_annotated_date >= DATE '{WINDOW_START}'
  AND t.step_a_agent_location = '{LOCATION}'
GROUP BY au.email, t.step_a_agent
HAVING au.email IS NOT NULL
ORDER BY step_a_tasks DESC
"""

# Only the tasks Step B actually changed (the feedback each annotator needs).
# wrt_all_key is deduped to one row per atdp_id so the product join can't fan out.
PER_CORRECTION_SQL = f"""
WITH atdp_user AS (
  SELECT id AS atdp_id, MAX(user_id) AS uid
  FROM bronze.annotation_task_data_points GROUP BY id
),
keyd AS (
  SELECT DISTINCT ON (atdp_id) atdp_id, product_name, brand_nm, prod_type_nm,
         primary_image_url, product_short_description
  FROM gold.wrt_all_key ORDER BY atdp_id, product_name
)
SELECT au.email AS annotator_email,
       t.task_id, t.cosmo_batch_id AS batch,
       LEFT(t.step_a_label,120) AS step_a_label,
       LEFT(t.step_b_label,120) AS step_b_label,
       1 AS mismatch,
       CAST(t.step_b_annotated_date AS date) AS date,
       LEFT(k.product_name,160) AS product_name,
       k.brand_nm AS brand,
       k.prod_type_nm AS prod_type,
       k.primary_image_url AS image_url,
       LEFT(regexp_replace(COALESCE(k.product_short_description,''),'<[^>]*>',' ','g'),200) AS description
FROM gold.wrt_item_label_trajectory t
LEFT JOIN atdp_user a ON a.atdp_id = t.atdp_id
LEFT JOIN bronze.annotation_users au ON au.id = a.uid
LEFT JOIN keyd k ON k.atdp_id = t.atdp_id
WHERE t.step_a_annotated_date >= DATE '{WINDOW_START}'
  AND t.step_a_agent_location = '{LOCATION}'
  AND t.step_b_label IS NOT NULL
  AND t.label_mismatch = 1
  AND au.email IS NOT NULL
ORDER BY date DESC
"""


CONFUSION_SQL = f"""
WITH atdp_user AS (
  SELECT id AS atdp_id, MAX(user_id) AS uid
  FROM bronze.annotation_task_data_points GROUP BY id
)
SELECT au.email AS annotator_email,
       t.step_a_agent AS display_name,
       t.step_a_label AS a_label,
       t.step_b_label AS b_label,
       COUNT(*) AS n
FROM gold.wrt_item_label_trajectory t
LEFT JOIN atdp_user a ON a.atdp_id = t.atdp_id
LEFT JOIN bronze.annotation_users au ON au.id = a.uid
WHERE t.step_a_annotated_date >= DATE '{WINDOW_START}'
  AND t.step_a_agent_location = '{LOCATION}'
  AND t.label_mismatch = 1
  AND t.step_a_label IS NOT NULL
  AND t.step_b_label IS NOT NULL
  AND au.email IS NOT NULL
GROUP BY au.email, t.step_a_agent, t.step_a_label, t.step_b_label
"""

# How many confusion pairs the coaching view shows.
TOP_PAIRS = 12


def build_agg(rows):
    """rows: [{annotator_email, display_name, a_label, b_label, n}] -> agg doc."""
    rows = [r for r in rows if r["annotator_email"] not in EXCLUDE_EMAILS]
    pair_tot = {}
    for r in rows:
        key = (r["a_label"], r["b_label"])
        pair_tot[key] = pair_tot.get(key, 0) + int(r["n"])
    top = sorted(pair_tot.items(), key=lambda kv: kv[1], reverse=True)[:TOP_PAIRS]
    pairs = [{"f": a, "t": b} for (a, b), _ in top]
    index = {(p["f"], p["t"]): i for i, p in enumerate(pairs)}

    by_name = {}
    for r in rows:
        key = (r["a_label"], r["b_label"])
        if key not in index:
            continue
        name = r["display_name"] or r["annotator_email"]
        vec = by_name.setdefault(name, [0] * len(pairs))
        vec[index[key]] += int(r["n"])

    out = [{"name": n, "c": c} for n, c in by_name.items() if sum(c) > 0]
    out.sort(key=lambda x: sum(x["c"]), reverse=True)
    return {"pairs": pairs, "rows": out}


def superset_session():
    s = requests.Session()
    r = s.post(f"{SUPERSET_URL}/api/v1/security/login",
               json={"username": USERNAME, "password": PASSWORD, "provider": "db", "refresh": True},
               timeout=30)
    r.raise_for_status()
    token = r.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    csrf = s.get(f"{SUPERSET_URL}/api/v1/security/csrf_token/", timeout=30).json()["result"]
    s.headers.update({"X-CSRFToken": csrf, "Referer": SUPERSET_URL})
    return s


def run_sql(session, sql):
    body = {"database_id": DB_ID, "runAsync": False, "sql": sql,
            "schema": "gold", "queryLimit": 1000000, "expand_data": True}
    r = session.post(f"{SUPERSET_URL}/api/v1/sqllab/execute/", json=body, timeout=300)
    r.raise_for_status()
    return r.json()["data"]


def main():
    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    firebase_admin.initialize_app(credentials.Certificate(cred_path) if cred_path else credentials.ApplicationDefault())
    db = firestore.client()

    s = superset_session()
    annotators = [r for r in run_sql(s, PER_ANNOTATOR_SQL) if r["annotator_email"] not in EXCLUDE_EMAILS]
    corrections = [r for r in run_sql(s, PER_CORRECTION_SQL) if r["annotator_email"] not in EXCLUDE_EMAILS]

    batch = db.batch()
    for a in annotators:
        doc = {
            "email": a["annotator_email"],
            "name": a.get("display_name") or a["annotator_email"],
            "step_a_tasks": a["step_a_tasks"],
            "step_b_reviewed": a["step_b_reviewed"],
            "step_b_coverage_pct": a["step_b_coverage_pct"],
            "step_b_mismatches": a["step_b_mismatches"],
            "err_pct": a["err_pct"],
            "avg_aht_mins": a["avg_aht_mins"],
            "last_step_b_date": a.get("last_step_b_date"),
        }
        batch.set(db.collection("metric_slice").document(a["annotator_email"]), doc)
    batch.commit()
    # replace corrections keyed by annotator+task so re-runs are idempotent
    batch = db.batch(); seen = {}
    for i, c in enumerate(corrections):
        key = (c["annotator_email"], c["task_id"]); seen[key] = seen.get(key, 0) + 1
        doc_id = f'{c["annotator_email"]}__{c["task_id"]}__{seen[key]}'
        batch.set(db.collection("correction").document(doc_id), c)
        if (i + 1) % 400 == 0:
            batch.commit(); batch = db.batch()
    batch.commit()

    for em in TRAINER_EMAILS:
        db.collection("app_user").document(em).set({"email": em, "role": "trainer"}, merge=True)

    confusion = run_sql(s, CONFUSION_SQL)
    agg = build_agg(confusion)
    agg["as_of"] = WINDOW_START
    db.collection("agg").document("trainer").set(agg)

    db.collection("meta").document("current").set({
        "as_of": firestore.SERVER_TIMESTAMP,
        "window_start": WINDOW_START,
        "location": LOCATION,
        "annotators": len(annotators),
        "corrections": len(corrections),
    })
    print(f"Wrote {len(annotators)} annotators, {len(corrections)} corrections, "
          f"{len(agg['pairs'])} confusion pairs x {len(agg['rows'])} annotators.")


if __name__ == "__main__":
    sys.exit(main())
