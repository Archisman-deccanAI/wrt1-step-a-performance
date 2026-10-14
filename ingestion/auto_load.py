#!/usr/bin/env python3
"""
One-tap refresh loader. Reads the wrt_load.json that the Superset bookmarklet
downloads into the app folder and pushes it live to Firestore. Idempotent:
skips the load when the file's export timestamp matches what is already live.

Writes metric_slice, correction and the coaching aggregate (agg/trainer),
updates meta/current, and keeps the trainer roles + the preview test account.

Env: GOOGLE_APPLICATION_CREDENTIALS (defaults to ingestion/serviceAccount.json
next to this file). EXPORT_PATH overrides where to read wrt_load.json.
"""
import os, sys, json, firebase_admin
from firebase_admin import credentials, firestore

HERE = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.dirname(HERE)  # 15_StepA_Performance_App
SA = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", os.path.join(HERE, "serviceAccount.json"))
EXPORT = os.environ.get("EXPORT_PATH", os.path.join(APP_DIR, "wrt_load.json"))

EXCLUDE = {"adimulam.arun@teamdeccan.com"}       # Deccanexpert (QC bench, not an annotator)
TEST = "archisman.hes@teamdeccan.com"            # preview test account, left untouched
TRAINERS = ["ext.archisman@deccan.ai", "bhavya.thammineni@deccan.ai"]
TOP_PAIRS = 12


def wipe(db, coll, keep):
    n = 0; b = db.batch(); i = 0
    for doc in db.collection(coll).stream():
        d = doc.to_dict() or {}
        em = d.get("annotator_email") or d.get("email") or doc.id
        if em in keep:
            continue
        b.delete(doc.reference); i += 1; n += 1
        if i % 400 == 0:
            b.commit(); b = db.batch(); i = 0
    if i:
        b.commit()
    return n


def build_agg(corr, name):
    pt = {}
    for c in corr:
        k = (c["step_a_label"], c["step_b_label"]); pt[k] = pt.get(k, 0) + 1
    top = sorted(pt.items(), key=lambda kv: kv[1], reverse=True)[:TOP_PAIRS]
    pairs = [{"f": a, "t": b} for (a, b), _ in top]
    idx = {(p["f"], p["t"]): i for i, p in enumerate(pairs)}
    bn = {}
    for c in corr:
        k = (c["step_a_label"], c["step_b_label"])
        if k not in idx:
            continue
        nm = name.get(c["annotator_email"], c["annotator_email"])
        v = bn.setdefault(nm, [0] * len(pairs)); v[idx[k]] += 1
    rows = [{"name": n, "c": v} for n, v in bn.items() if sum(v) > 0]
    rows.sort(key=lambda x: sum(x["c"]), reverse=True)
    return {"pairs": pairs, "rows": rows}


def main():
    if not os.path.exists(EXPORT):
        print("no export file at", EXPORT); return 0
    d = json.load(open(EXPORT, encoding="utf-8"))
    exported_at = d.get("exported_at", "")

    firebase_admin.initialize_app(credentials.Certificate(SA))
    db = firestore.client()

    cur = db.collection("meta").document("current").get()
    if cur.exists and exported_at and cur.to_dict().get("loaded_export_at") == exported_at:
        print("already live (export", exported_at, ") - nothing to do"); return 0

    slices = [s for s in d["slices"] if s["annotator_email"] not in EXCLUDE]
    corr = [c for c in d["corrections"] if c["annotator_email"] not in EXCLUDE]
    name = {s["annotator_email"]: s["display_name"] for s in d["slices"]}

    # metric_slice: one small doc per annotator (~23 writes)
    b = db.batch()
    for s in slices:
        b.set(db.collection("metric_slice").document(s["annotator_email"]), {
            "email": s["annotator_email"], "name": s["display_name"],
            "step_a_tasks": int(s["step_a_tasks"]), "step_b_reviewed": int(s["step_b_reviewed"]),
            "step_b_coverage_pct": float(s["step_b_coverage_pct"]),
            "step_b_mismatches": int(s["step_b_mismatches"]), "err_pct": float(s["err_pct"]),
            "avg_aht_mins": float(s["avg_aht_mins"]) if s["avg_aht_mins"] is not None else None,
            "last_step_b_date": s.get("last_step_b_date"),
        })
    b.commit()

    # correction_bundle: all of one annotator's rows in a single doc (~23 writes
    # total instead of thousands). Keeps the whole thing inside the free tier.
    CAP = 1500  # stay well under Firestore's 1 MB per-document limit
    bundles = {}
    for c in corr:
        bundles.setdefault(c["annotator_email"], []).append({
            "task_id": c["task_id"], "batch": c.get("batch"),
            "step_a_label": c.get("step_a_label"), "step_b_label": c.get("step_b_label"),
            "mismatch": 1, "date": c.get("date"), "product_name": c.get("product_name"),
            "brand": c.get("brand"), "prod_type": c.get("prod_type"),
            "image_url": c.get("image_url"), "description": c.get("description"),
        })
    b = db.batch()
    for em, rows in bundles.items():
        rows.sort(key=lambda r: str(r.get("date") or ""), reverse=True)
        b.set(db.collection("correction_bundle").document(em),
              {"email": em, "name": name.get(em, em), "count": len(rows), "rows": rows[:CAP]})
    b.commit()

    db.collection("agg").document("trainer").set(build_agg(corr, name))
    for em in TRAINERS:
        db.collection("app_user").document(em).set({"email": em, "role": "trainer"}, merge=True)
    db.collection("meta").document("current").set({
        "as_of": firestore.SERVER_TIMESTAMP, "window_start": d.get("as_of", "2026-09-30"),
        "location": d.get("location", "Hyd"), "annotators": len(slices), "corrections": len(corr),
        "loaded_export_at": exported_at,
        "note": "Step B mismatches since 2026-09-30 (Hyderabad).",
    })
    print(f"LOADED {len(slices)} annotators, {len(corr)} corrections (export {exported_at})")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        from google.api_core.exceptions import ResourceExhausted, RetryError
        msg = str(e)
        if isinstance(e, (ResourceExhausted, RetryError)) or "Quota exceeded" in msg or "429" in msg:
            print("Firestore daily write quota not reset yet; will load on the next run.")
            sys.exit(0)
        raise
