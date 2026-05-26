import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import championBanner from "@/assets/champion-cup-banner.png";

export const Route = createFileRoute("/_app/rewards")({
  head: () => ({
    meta: [
      { title: "Rewards — Goal Gurus" },
      { name: "description", content: "Meet this week's Goal Gurus prediction champion and see the trophy on the line." },
      { property: "og:title", content: "Rewards — Goal Gurus" },
      { property: "og:description", content: "Meet this week's Goal Gurus prediction champion and see the trophy on the line." },
      { property: "og:url", content: "https://fifa2026rbl.lovable.app/rewards" },
    ],
    links: [{ rel: "canonical", href: "https://fifa2026rbl.lovable.app/rewards" }],
  }),
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

      <section
        aria-label="Champion Cup banner"
        className="w-full rounded-2xl overflow-hidden"
        style={{ boxShadow: "0 20px 60px -20px rgba(120,60,220,0.55)" }}
      >
        <img
          src={championBanner}
          alt="RBL FIFA 2026 League — Play. Predict. Win!"
          className="w-full h-auto block"
          loading="eager"
        />
      </section>

      <div className="glossy-card p-6 text-center relative overflow-hidden">
        <div className="accent-strip" />
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">Weekly Winner</p>
        {data ? (
          <>
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