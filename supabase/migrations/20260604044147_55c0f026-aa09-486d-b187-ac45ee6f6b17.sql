CREATE OR REPLACE FUNCTION public.refresh_scoring_totals_rewards(_match_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  predictions_changed integer := 0;
  users_refreshed integer := 0;
  rewards_result jsonb := '{}'::jsonb;
BEGIN
  -- Normalize stored `winner` to match the predicted scoreline (source of truth).
  UPDATE public.predictions p
  SET winner = CASE
        WHEN p.predicted_home_score > p.predicted_away_score THEN 'home'
        WHEN p.predicted_home_score < p.predicted_away_score THEN 'away'
        ELSE 'draw'
      END,
      updated_at = now()
  WHERE p.predicted_home_score IS NOT NULL
    AND p.predicted_away_score IS NOT NULL
    AND p.winner IS DISTINCT FROM (
      CASE
        WHEN p.predicted_home_score > p.predicted_away_score THEN 'home'
        WHEN p.predicted_home_score < p.predicted_away_score THEN 'away'
        ELSE 'draw'
      END
    );

  WITH scoped_matches AS (
    SELECT id, home_score, away_score,
      CASE
        WHEN home_score > away_score THEN 'home'
        WHEN home_score < away_score THEN 'away'
        ELSE 'draw'
      END AS actual_winner
    FROM public.matches
    WHERE status = 'completed'
      AND home_score IS NOT NULL
      AND away_score IS NOT NULL
      AND (_match_ids IS NULL OR id = ANY(_match_ids))
  ),
  recalculated AS (
    SELECT
      p.id,
      CASE
        WHEN p.predicted_home_score = m.home_score
         AND p.predicted_away_score = m.away_score THEN 3
        WHEN p.predicted_home_score IS NOT NULL
         AND p.predicted_away_score IS NOT NULL
         AND (
           CASE
             WHEN p.predicted_home_score > p.predicted_away_score THEN 'home'
             WHEN p.predicted_home_score < p.predicted_away_score THEN 'away'
             ELSE 'draw'
           END
         ) = m.actual_winner THEN 1
        ELSE 0
      END AS new_points
    FROM public.predictions p
    JOIN scoped_matches m ON m.id = p.match_id
  ),
  upd AS (
    UPDATE public.predictions p
    SET points_earned = r.new_points,
        updated_at = now()
    FROM recalculated r
    WHERE p.id = r.id
      AND p.points_earned IS DISTINCT FROM r.new_points
    RETURNING p.user_id
  )
  SELECT COUNT(*)::int INTO predictions_changed FROM upd;

  WITH affected_users AS (
    SELECT DISTINCT p.user_id
    FROM public.predictions p
    WHERE _match_ids IS NULL OR p.match_id = ANY(_match_ids)
  ),
  target_users AS (
    SELECT employee_id AS user_id, total_points AS old_total
    FROM public.registered_users
    WHERE _match_ids IS NULL OR employee_id IN (SELECT user_id FROM affected_users)
  ),
  totals AS (
    SELECT
      tu.user_id,
      COALESCE(SUM(p.points_earned) FILTER (
        WHERE m.status = 'completed'
          AND m.home_score IS NOT NULL
          AND m.away_score IS NOT NULL
      ), 0)::int AS new_total,
      tu.old_total
    FROM target_users tu
    LEFT JOIN public.predictions p ON p.user_id = tu.user_id
    LEFT JOIN public.matches m ON m.id = p.match_id
    GROUP BY tu.user_id, tu.old_total
  ),
  upd_users AS (
    UPDATE public.registered_users ru
    SET total_points = t.new_total,
        updated_at = now()
    FROM totals t
    WHERE ru.employee_id = t.user_id
      AND ru.total_points IS DISTINCT FROM t.new_total
    RETURNING ru.employee_id
  )
  SELECT COUNT(*)::int INTO users_refreshed FROM upd_users;

  SELECT public.recalculate_rewards_and_badges() INTO rewards_result;

  RETURN jsonb_build_object(
    'predictions_changed', predictions_changed,
    'users_refreshed', users_refreshed,
    'rewards', rewards_result
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.refresh_scoring_totals_rewards(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_scoring_totals_rewards(uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.refresh_scoring_totals_rewards(uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_scoring_totals_rewards(uuid[]) TO service_role;

-- Backfill: fix the Philippines vs Guam case and any similar mismatches.
SELECT public.refresh_scoring_totals_rewards(NULL);