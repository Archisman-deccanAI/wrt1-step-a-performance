-- WRT1 Step A Performance App - canonical EDA / ingestion queries (Postgres, DW_PROD)
-- Source of truth: gold.wrt_item_label_trajectory (updated near real time; the test.sama_wrt_* mirrors lag ~2 weeks)
-- Window used throughout: step_a_annotated_date >= 2026-09-30
-- Superset SQL Lab returns ONLY the last statement, so run these one at a time.

-- =====================================================================
-- 1) IDENTITY RESOLUTION  (the key finding)
-- The trajectory identifies annotators only by display name (step_a_agent),
-- which is NOT unique or clean. Resolve to a real account via the id chain:
--   trajectory.atdp_id -> annotation_task_data_points.id -> user_id (usr_...)
--   -> annotation_users.id -> email / full_name / role
-- One user_id per atdp (collapse first to avoid row fan-out on the join).
-- =====================================================================
WITH atdp_user AS (
  SELECT id AS atdp_id, MAX(user_id) AS user_id
  FROM bronze.annotation_task_data_points
  GROUP BY id
),
dir AS (
  SELECT id AS user_id, email, full_name, role
  FROM bronze.annotation_users
)
SELECT
  d.email                                    AS annotator_email,
  t.step_a_agent                             AS display_name,
  COUNT(*)                                   AS step_a_tasks,
  COUNT(t.step_b_label)                       AS step_b_reviewed,
  ROUND(100.0*COUNT(t.step_b_label)/COUNT(*),1)                                             AS step_b_coverage_pct,
  SUM(CASE WHEN t.label_mismatch=1 THEN 1 ELSE 0 END)                                       AS step_b_mismatches,
  ROUND(100.0*SUM(CASE WHEN t.label_mismatch=1 THEN 1 ELSE 0 END)/NULLIF(COUNT(t.step_b_label),0),1) AS step_b_err_pct,
  ROUND(AVG(t.step_a_item_submission_mins),2) AS avg_aht_mins
FROM gold.wrt_item_label_trajectory t
LEFT JOIN atdp_user au ON au.atdp_id = t.atdp_id
LEFT JOIN dir       d  ON d.user_id  = au.user_id
WHERE t.step_a_annotated_date >= DATE '2026-09-30'
  AND t.step_a_agent_location = 'Hyd'
GROUP BY d.email, t.step_a_agent
ORDER BY step_a_tasks DESC;

-- =====================================================================
-- 2) COVERAGE + SIGNAL by location (presence of Step B data)
-- =====================================================================
SELECT step_a_agent_location AS loc,
       COUNT(*)                                             AS step_a_tasks,
       COUNT(step_b_label)                                  AS with_step_b,
       ROUND(100.0*COUNT(step_b_label)/COUNT(*),1)          AS step_b_coverage_pct,
       SUM(CASE WHEN label_mismatch=1 THEN 1 ELSE 0 END)    AS mismatches,
       COUNT(DISTINCT step_a_agent)                         AS n_agents
FROM gold.wrt_item_label_trajectory
WHERE step_a_annotated_date >= DATE '2026-09-30'
GROUP BY step_a_agent_location
ORDER BY step_a_tasks DESC;

-- =====================================================================
-- 3) FRESHNESS (is the feed current?)
-- =====================================================================
SELECT MAX(step_a_annotated_date) AS max_step_a,
       MAX(step_b_annotated_date) AS max_step_b,
       MAX(dw_update_ts)          AS max_dw_update
FROM gold.wrt_item_label_trajectory
WHERE step_a_annotated_date >= DATE '2026-09-30';

-- =====================================================================
-- 4) STEP B THROUGHPUT by day (shows the bursty review pattern)
-- =====================================================================
SELECT CAST(date_trunc('day', step_b_annotated_date) AS date) AS d,
       COUNT(*) AS step_b_reviews
FROM gold.wrt_item_label_trajectory
WHERE step_b_annotated_date >= DATE '2026-09-30'
GROUP BY 1 ORDER BY 1 DESC;
