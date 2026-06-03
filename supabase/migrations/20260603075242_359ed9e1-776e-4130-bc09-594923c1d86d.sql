CREATE INDEX IF NOT EXISTS idx_predictions_match_user_created
ON public.predictions (match_id, user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_predictions_user_created
ON public.predictions (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_matches_completed_scoring
ON public.matches (status, match_time)
WHERE home_score IS NOT NULL AND away_score IS NOT NULL;

CREATE OR REPLACE FUNCTION public.recalculate_rewards_and_badges()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rewards_count integer := 0;
  badges_count  integer := 0;
BEGIN
  WITH scored AS (
    SELECT
      p.user_id,
      p.points_earned,
      p.created_at,
      m.id AS match_id,
      m.home_score,
      m.away_score,
      m.match_time,
      (m.match_time AT TIME ZONE 'Asia/Kolkata') AS ist_ts
    FROM public.predictions p
    JOIN public.matches m ON m.id = p.match_id
    WHERE m.status = 'completed'
      AND m.home_score IS NOT NULL
      AND m.away_score IS NOT NULL
  ),
  daily AS (
    SELECT
      'daily'::text AS period_type,
      to_char(ist_ts, 'YYYY-MM-DD') AS period_key,
      to_char(ist_ts, 'Dy, DD Mon') AS period_label,
      date_trunc('day', ist_ts) AT TIME ZONE 'Asia/Kolkata' AS period_start,
      (date_trunc('day', ist_ts) + interval '1 day') AT TIME ZONE 'Asia/Kolkata' AS period_end,
      user_id,
      SUM(points_earned)::int AS total_points,
      COUNT(*) FILTER (WHERE points_earned = 3)::int AS exact_score_hits,
      COUNT(*) FILTER (WHERE points_earned = 1)::int AS correct_winner_hits,
      MIN(created_at) AS first_prediction_at
    FROM scored
    GROUP BY 2,3,4,5,6
    HAVING SUM(points_earned) > 0
  ),
  weekly AS (
    SELECT
      'weekly'::text AS period_type,
      to_char(date_trunc('week', ist_ts), 'IYYY-"W"IW') AS period_key,
      'Week ' || to_char(date_trunc('week', ist_ts), 'IW')
        || ' (' || to_char(date_trunc('week', ist_ts), 'DD Mon')
        || '–' || to_char(date_trunc('week', ist_ts) + interval '6 days', 'DD Mon') || ')' AS period_label,
      date_trunc('week', ist_ts) AT TIME ZONE 'Asia/Kolkata' AS period_start,
      (date_trunc('week', ist_ts) + interval '7 days') AT TIME ZONE 'Asia/Kolkata' AS period_end,
      user_id,
      SUM(points_earned)::int AS total_points,
      COUNT(*) FILTER (WHERE points_earned = 3)::int AS exact_score_hits,
      COUNT(*) FILTER (WHERE points_earned = 1)::int AS correct_winner_hits,
      MIN(created_at) AS first_prediction_at
    FROM scored
    GROUP BY 2,3,4,5,6
    HAVING SUM(points_earned) > 0
  ),
  monthly AS (
    SELECT
      'monthly'::text AS period_type,
      to_char(ist_ts, 'YYYY-MM') AS period_key,
      to_char(ist_ts, 'FMMonth YYYY') AS period_label,
      date_trunc('month', ist_ts) AT TIME ZONE 'Asia/Kolkata' AS period_start,
      (date_trunc('month', ist_ts) + interval '1 month') AT TIME ZONE 'Asia/Kolkata' AS period_end,
      user_id,
      SUM(points_earned)::int AS total_points,
      COUNT(*) FILTER (WHERE points_earned = 3)::int AS exact_score_hits,
      COUNT(*) FILTER (WHERE points_earned = 1)::int AS correct_winner_hits,
      MIN(created_at) AS first_prediction_at
    FROM scored
    GROUP BY 2,3,4,5,6
    HAVING SUM(points_earned) > 0
  ),
  season AS (
    SELECT
      'season'::text AS period_type,
      'season'::text AS period_key,
      'Tournament Season'::text AS period_label,
      (SELECT MIN(match_time) FROM scored) AS period_start,
      (SELECT MAX(match_time) FROM scored) AS period_end,
      user_id,
      SUM(points_earned)::int AS total_points,
      COUNT(*) FILTER (WHERE points_earned = 3)::int AS exact_score_hits,
      COUNT(*) FILTER (WHERE points_earned = 1)::int AS correct_winner_hits,
      MIN(created_at) AS first_prediction_at
    FROM scored
    GROUP BY user_id
    HAVING SUM(points_earned) > 0
  ),
  all_periods AS (
    SELECT * FROM daily
    UNION ALL SELECT * FROM weekly
    UNION ALL SELECT * FROM monthly
    UNION ALL SELECT * FROM season
  ),
  ranked AS (
    SELECT
      period_type, period_key, period_label, period_start, period_end,
      user_id, total_points, exact_score_hits, correct_winner_hits, first_prediction_at,
      RANK() OVER (PARTITION BY period_type, period_key ORDER BY total_points DESC) AS rk
    FROM all_periods
  ),
  wipe AS (
    DELETE FROM public.reward_winners
    WHERE period_type IN ('daily','weekly','monthly','season')
    RETURNING 1
  )
  INSERT INTO public.reward_winners
    (period_type, period_key, period_label, period_start, period_end,
     user_id, total_points, rank, computed_at)
  SELECT period_type, period_key, period_label, period_start, period_end,
         user_id, total_points, rk, now()
  FROM ranked, (SELECT COUNT(*) FROM wipe) _
  ORDER BY period_type, period_key, total_points DESC, exact_score_hits DESC,
           correct_winner_hits DESC, first_prediction_at ASC, user_id ASC;
  GET DIAGNOSTICS rewards_count = ROW_COUNT;

  WITH scored AS (
    SELECT p.user_id, p.points_earned,
           p.predicted_home_score, p.predicted_away_score,
           m.home_score, m.away_score, m.match_time
    FROM public.predictions p
    JOIN public.matches m ON m.id = p.match_id
    WHERE m.status = 'completed'
      AND m.home_score IS NOT NULL
      AND m.away_score IS NOT NULL
  ),
  user_stats AS (
    SELECT
      user_id,
      SUM(points_earned)::int AS total_pts,
      COUNT(*) FILTER (WHERE points_earned = 3)::int AS exact_count,
      COUNT(*) FILTER (WHERE points_earned >= 1)::int AS correct_count,
      COUNT(*)::int AS played_count
    FROM scored
    GROUP BY user_id
  ),
  first_win AS (
    SELECT user_id FROM user_stats WHERE correct_count >= 1
  ),
  centurion AS (
    SELECT user_id FROM user_stats WHERE total_pts >= 100
  ),
  perfect_pundit AS (
    SELECT user_id FROM user_stats WHERE exact_count >= 5
  ),
  veteran AS (
    SELECT user_id FROM user_stats WHERE played_count >= 10
  ),
  oracle AS (
    SELECT user_id FROM user_stats WHERE exact_count >= 10
  ),
  daily_champ AS (
    SELECT DISTINCT user_id FROM public.reward_winners WHERE period_type='daily' AND rank=1
  ),
  weekly_champ AS (
    SELECT DISTINCT user_id FROM public.reward_winners WHERE period_type='weekly' AND rank=1
  ),
  monthly_champ AS (
    SELECT DISTINCT user_id FROM public.reward_winners WHERE period_type='monthly' AND rank=1
  ),
  all_badges AS (
    SELECT user_id, 'first_win' AS code, 'First Blood' AS label, 'Scored your first prediction points' AS descr FROM first_win
    UNION ALL SELECT user_id, 'centurion', 'Centurion', '100 points and counting' FROM centurion
    UNION ALL SELECT user_id, 'perfect_pundit', 'Perfect Pundit', '5 exact score predictions' FROM perfect_pundit
    UNION ALL SELECT user_id, 'oracle', 'Oracle', '10 exact score predictions' FROM oracle
    UNION ALL SELECT user_id, 'veteran', 'Veteran', 'Predicted 10+ completed matches' FROM veteran
    UNION ALL SELECT user_id, 'daily_champion', 'Daily Champion', 'Topped a daily leaderboard' FROM daily_champ
    UNION ALL SELECT user_id, 'weekly_champion', 'Weekly Champion', 'Topped a weekly leaderboard' FROM weekly_champ
    UNION ALL SELECT user_id, 'monthly_champion', 'Monthly Champion', 'Topped a monthly leaderboard' FROM monthly_champ
  ),
  ins AS (
    INSERT INTO public.user_badges (user_id, badge_code, badge_label, badge_description)
    SELECT user_id, code, label, descr FROM all_badges
    ON CONFLICT (user_id, badge_code) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO badges_count FROM ins;

  RETURN jsonb_build_object(
    'rewards_written', rewards_count,
    'badges_awarded', badges_count
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_scoring_totals_rewards(_match_ids uuid[] DEFAULT NULL)
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
        WHEN p.predicted_home_score = m.home_score AND p.predicted_away_score = m.away_score THEN 3
        WHEN p.winner IS NOT NULL AND p.winner = m.actual_winner THEN 1
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