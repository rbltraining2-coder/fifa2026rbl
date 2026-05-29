import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Camera, ChevronRight, ListChecks, Activity, Award, LogOut, Trophy, Star, Target, Zap, Medal, Crown } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { compressAndUploadAvatar } from "@/lib/avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/profile")({
  head: () => ({
    meta: [
      { title: "My Profile — Goal Gurus" },
      { name: "description", content: "View your Goal Gurus profile, total points, rank, badges and prediction history." },
      { property: "og:title", content: "My Profile — Goal Gurus" },
      { property: "og:description", content: "View your Goal Gurus profile, total points, rank, badges and prediction history." },
      { property: "og:url", content: "https://fifa2026rbl.lovable.app/profile" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://fifa2026rbl.lovable.app/profile" }],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { profile, user, refreshProfile, signOut } = useAuth();
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ["my-stats", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [{ count: matches }, { count: rank }] = await Promise.all([
        supabase.from("predictions").select("*", { count: "exact", head: true }).eq("user_id", user!.id),
        supabase
          .from("registered_users")
          .select("*", { count: "exact", head: true })
          .gt("total_points", profile?.total_points ?? 0),
      ]);
      return { matches: matches ?? 0, rank: (rank ?? 0) + 1 };
    },
  });

  const { data: badges } = useQuery({
    queryKey: ["my-badges", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_badges")
        .select("badge_code, badge_label, badge_description, awarded_at")
        .eq("user_id", user!.id)
        .order("awarded_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const url = await compressAndUploadAvatar(file, user.id);
      const { updateMyAvatar } = await import("@/lib/predictions.functions");
      await updateMyAvatar({ data: { userId: user.id, avatarUrl: url } });
      await refreshProfile();
      toast.success("Photo updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-5">
      <h1 className="sr-only">My Profile</h1>
      <section className="glossy-card p-6 text-center">
        <div className="accent-strip" />
        <button
          onClick={() => fileRef.current?.click()}
          className="relative mx-auto block w-28 h-28 rounded-full overflow-hidden border-4 border-white/10 bg-black/40"
        >
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="Your avatar" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl font-black">
              {profile?.name?.slice(0, 2).toUpperCase() ?? "?"}
            </div>
          )}
          <span
            className="absolute bottom-1 right-1 w-8 h-8 rounded-full flex items-center justify-center text-white"
            style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow-primary)" }}
          >
            <Camera size={14} />
          </span>
          {uploading && (
            <span className="absolute inset-0 bg-black/60 text-xs text-white flex items-center justify-center">
              Uploading…
            </span>
          )}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
        <p className="mt-3 text-xl font-black">{profile?.name}</p>
      </section>

      <section className="grid grid-cols-3 gap-3">
        <Stat label="Total Points" value={profile?.total_points ?? 0} accent="var(--success)" />
        <Stat label="Rank" value={stats ? `#${stats.rank}` : "—"} accent="var(--primary-glow)" />
        <Stat label="Played" value={stats?.matches ?? 0} accent="#D1D4D1" />
      </section>

      <section className="glossy-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
            <Award size={14} className="text-[color:var(--primary-glow)]" />
            Badges
          </h2>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
            {badges?.length ?? 0} earned
          </span>
        </div>
        {!badges || badges.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            No badges yet — predict matches to start earning achievements.
          </p>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {badges.map((b) => (
              <li
                key={b.badge_code}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-white/5"
                style={{
                  background: "linear-gradient(135deg, rgba(245,215,110,0.10), rgba(46,125,70,0.06))",
                }}
                title={b.badge_description}
              >
                <BadgeIcon code={b.badge_code} />
                <div className="min-w-0">
                  <p className="text-xs font-black truncate">{b.badge_label}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{b.badge_description}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="glossy-card overflow-hidden">
        <MenuItem icon={<ListChecks size={18} />} label="My Predictions" onClick={() => nav({ to: "/predictions" })} />
        <MenuItem icon={<Activity size={18} />} label="My Performance" onClick={() => toast("Coming soon")} />
        <MenuItem
          icon={<Award size={18} />}
          label={`Badges (${badges?.length ?? 0})`}
          onClick={() => {
            const el = document.querySelector("[data-badges-section]");
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        />
        <MenuItem
          icon={<LogOut size={18} />}
          label="Logout"
          danger
          onClick={async () => {
            await signOut();
            nav({ to: "/login" });
          }}
        />
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="glossy-card p-3 text-center">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-xl font-black mt-1" style={{ color: accent }}>{value}</p>
    </div>
  );
}

const BADGE_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  first_win: Star,
  centurion: Trophy,
  perfect_pundit: Target,
  oracle: Zap,
  veteran: Medal,
  daily_champion: Crown,
  weekly_champion: Crown,
  monthly_champion: Crown,
};

function BadgeIcon({ code }: { code: string }) {
  const Icon = BADGE_ICONS[code] ?? Award;
  return (
    <span
      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
      style={{
        background: "linear-gradient(135deg, rgba(245,215,110,0.25), rgba(245,215,110,0.05))",
        color: "#f5d76e",
        border: "1px solid rgba(245,215,110,0.35)",
      }}
    >
      <Icon size={15} />
    </span>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-3.5 flex items-center gap-3 border-b border-white/5 last:border-b-0 hover:bg-white/5 transition"
    >
      <span
        className="w-8 h-8 rounded-lg flex items-center justify-center"
        style={{
          background: danger ? "rgba(230,29,37,0.15)" : "rgba(42,57,141,0.25)",
          color: danger ? "var(--destructive)" : "var(--primary-glow)",
        }}
      >
        {icon}
      </span>
      <span className="flex-1 text-left text-sm font-semibold" style={danger ? { color: "var(--destructive)" } : undefined}>
        {label}
      </span>
      <ChevronRight size={16} className="text-muted-foreground" />
    </button>
  );
}