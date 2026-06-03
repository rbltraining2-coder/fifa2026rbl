REVOKE ALL ON FUNCTION public.recalculate_rewards_and_badges() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_scoring_totals_rewards(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_rewards_and_badges() TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_scoring_totals_rewards(uuid[]) TO service_role;