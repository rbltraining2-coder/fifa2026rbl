import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Home, ListChecks, Trophy, Gift, User, ShieldCheck } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { compressAndUploadAvatar } from "@/lib/avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import BrandHeader from "@/components/BrandHeader";

const TABS = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/predictions", icon: ListChecks, label: "Predictions" },
  { to: "/leaderboard", icon: Trophy, label: "Leaderboard" },
  { to: "/rewards", icon: Gift, label: "Rewards" },
  { to: "/profile", icon: User, label: "Profile" },
] as const;

export default function AppShell({ children }: { children: ReactNode }) {
  const { profile, refreshProfile, user } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const url = await compressAndUploadAvatar(file, user.id);
      const { updateMyAvatar } = await import("@/lib/predictions.functions");
      await updateMyAvatar({ data: { userId: user.id, avatarUrl: url } });
      await refreshProfile();
      toast.success("Profile photo updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-[rgba(10,18,38,0.65)] border-b border-white/5">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => nav({ to: "/" })}
            className="flex items-center gap-2"
            aria-label="RBL FIFA 2026 League home"
          >
            <BrandHeader size={32} textClass="text-[12px] sm:text-sm" />
          </button>

          <div className="flex items-center gap-2">
            {profile?.employee_id === "50161635" && (
              <button
                onClick={() => nav({ to: "/admin" })}
                aria-label="Open admin dashboard"
                title="Admin Dashboard"
                className="w-10 h-10 rounded-full flex items-center justify-center text-white border border-white/20 hover:scale-105 transition"
                style={{
                  background: "linear-gradient(135deg, #16a34a 0%, #4ade80 100%)",
                  boxShadow: "0 8px 24px -8px rgba(34,197,94,0.6)",
                }}
              >
                <ShieldCheck size={18} />
              </button>
            )}
            <button
            onClick={() => fileRef.current?.click()}
            className="relative w-11 h-11 rounded-full overflow-hidden border-2 border-white/15 bg-card shadow-md hover:border-[var(--primary-glow)] transition"
            aria-label="Update avatar"
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="Your avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm font-bold text-foreground/70">
                {profile?.name?.slice(0, 2).toUpperCase() ?? "?"}
              </div>
            )}
            {uploading && (
              <span className="absolute inset-0 bg-black/60 text-[10px] text-white flex items-center justify-center">
                …
              </span>
            )}
          </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarPick}
          />
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-2xl px-4 pb-28 pt-4">{children}</main>

      <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-white/5 bg-[rgba(10,18,38,0.88)] backdrop-blur-xl">
        <div className="mx-auto max-w-2xl grid grid-cols-5">
          {TABS.map((t) => {
            const active =
              t.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(t.to);
            const Icon = t.icon;
            return (
              <Link
                key={t.to}
                to={t.to}
                className="flex flex-col items-center justify-center py-2.5 gap-1 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: active ? "var(--primary-glow)" : "rgba(209,212,209,0.55)" }}
              >
                <span
                  className="w-10 h-10 rounded-2xl flex items-center justify-center transition"
                  style={
                    active
                      ? {
                          background: "var(--gradient-primary)",
                          boxShadow: "var(--shadow-glow-primary)",
                          color: "#fff",
                        }
                      : undefined
                  }
                >
                  <Icon size={20} />
                </span>
                <span>{t.label}</span>
              </Link>
            );
          })}
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </div>
  );
}