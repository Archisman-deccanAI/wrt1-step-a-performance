#!/usr/bin/env python3
"""
One-shot initial load: pushes the bundled real snapshot (app/src/seed/) into
Firestore so the app goes live with real KPIs today, no Superset pull needed.
The nightly refresh.py keeps it fresh and fills in full corrections afterwards.

Env:
  GOOGLE_APPLICATION_CREDENTIALS  path to the Firebase service-account JSON
  TRAINER_EMAILS                  comma-separated emails to make trainers
"""
import os
import json
import firebase_admin
from firebase_admin import credentials, firestore

HERE = os.path.dirname(os.path.abspath(__file__))
SEED = os.path.join(HERE, "..", "app", "src", "seed")
TRAINER_EMAILS = [e.strip() for e in os.environ.get("TRAINER_EMAILS", "").split(",") if e.strip()]


def load(name):
    with open(os.path.join(SEED, name), encoding="utf-8") as f:
        return json.load(f)


def main():
    firebase_admin.initialize_app(credentials.Certificate(os.environ["GOOGLE_APPLICATION_CREDENTIALS"]))
    db = firestore.client()

    annotators = [a for a in load("annotators.json") if not a.get("excluded")]
    corrections = load("corrections.json")
    meta = load("meta.json")

    batch = db.batch()
    for a in annotators:
        batch.set(db.collection("metric_slice").document(a["email"]), a)
    batch.commit()

    batch = db.batch()
    for i, c in enumerate(corrections):
        doc_id = f'{c["email"]}__{c["task_id"]}__{i}'
        batch.set(db.collection("correction").document(doc_id), {**c, "annotator_email": c["email"]})
        if (i + 1) % 300 == 0:
            batch.commit(); batch = db.batch()
    batch.commit()

    for em in TRAINER_EMAILS:
        db.collection("app_user").document(em).set({"email": em, "role": "trainer"}, merge=True)

    db.collection("meta").document("current").set(meta)
    print(f"Loaded {len(annotators)} annotators, {len(corrections)} corrections, trainers: {TRAINER_EMAILS}")


if __name__ == "__main__":
    main()
