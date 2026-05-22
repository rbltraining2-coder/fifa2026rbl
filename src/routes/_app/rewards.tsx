import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/rewards")({
  head: () => ({ meta: [{ title: "Rewards — Goal Gurus" }] }),
  component: RewardsPage,
});

function RewardsPage() {
  const { data } = useQuery({
    queryKey: ["weekly-winner"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_winners")
        .select("week_number, total_points, profiles!weekly_winners_user_id_fkey(name, employee_code, avatar_url, brand)")
        .order("week_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as {
        week_number: number;
        total_points: number;
        profiles: { name: string; employee_code: string; avatar_url: string | null; brand: string | null };
      } | null;
    },
  });

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-black">Rewards</h1>
      <p className="text-sm text-muted-foreground">This week's champion of the prediction league.</p>

      <div className="glossy-card p-6 text-center relative overflow-hidden">
        <div className="accent-strip" />
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">Weekly Winner</p>
        {data ? (
          <>
            <motion.div
              className="mx-auto mt-5 w-28 h-28 rounded-full flex items-center justify-center"
              style={{ background: "var(--gradient-podium-gold)", boxShadow: "0 20px 50px -20px rgba(245, 215, 110, 0.7)" }}
              animate={{ rotateY: [0, 360] }}
              transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
            >
              <Trophy size={56} className="text-yellow-900" strokeWidth={2.5} />
            </motion.div>
            <h2 className="mt-5 text-2xl font-black">{data.profiles.name || data.profiles.employee_code}</h2>
            <p className="text-xs text-muted-foreground tracking-widest mt-1">
              {data.profiles.employee_code} · WEEK {data.week_number}
            </p>
            {data.profiles.brand && (
              <span
                className="inline-block mt-3 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest"
                style={{
                  background: "rgba(42,57,141,0.25)",
                  color: "var(--primary-glow)",
                  border: "1px solid rgba(74,92,199,0.35)",
                }}
              >
                {data.profiles.brand}
              </span>
            )}
            <div
              className="mt-5 inline-block px-6 py-3 rounded-full"
              style={{ background: "var(--gradient-success)", boxShadow: "var(--shadow-glow-success)" }}
            >
              <span className="text-2xl font-black text-white">{data.total_points} PTS</span>
            </div>
          </>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">No winner declared yet this week. Keep predicting!</p>
        )}
      </div>
    </div>
  );
}