-- Reference copy of the two queries the refresh job runs (also embedded in refresh.py).
-- Full EDA / canonical versions live in ../eda/identity_resolution_and_metrics.sql.
-- Window and location are templated by refresh.py (defaults: 2026-09-30, Hyd).

-- Per-annotator slice (one row per annotator):
--   trajectory.atdp_id -> annotation_task_data_points.user_id -> annotation_users.email
-- Collapses one user_id per atdp first to avoid row fan-out.

-- Per-correction feed (one row per reviewed item), used for the "my feedback" list.

-- See refresh.py for the exact SQL text.
