import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { loginWithEmployeeCode } from "@/lib/auth.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Goal Gurus" },
      { name: "description", content: "Sign in to Goal Gurus with your employee code." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const login = useServerFn(loginWithEmployeeCode);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    try {
      const r = await login({ data: { employeeCode: code.trim() } });
      const { error } = await supabase.auth.setSession({
        access_token: r.access_token,
        refresh_token: r.refresh_token,
      });
      if (error) throw error;
      toast.success(`Welcome, ${r.employee_code}!`);
      nav({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div
            className="mx-auto mb-6 inline-block px-5 py-3 rounded-2xl tilt-card"
            style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow-primary)" }}
          >
            <span className="block text-[10px] tracking-[0.4em] text-white/70 font-semibold">PREDICT • COMPETE • WIN</span>
          </div>
          <h1
            className="text-5xl font-black tracking-tight"
            style={{
              backgroundImage: "linear-gradient(180deg,#fff 0%, #b8bbb8 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              textShadow: "0 4px 18px rgba(0,0,0,0.45)",
            }}
          >
            GOAL GURUS
          </h1>
          <p className="mt-2 text-sm text-muted-foreground uppercase tracking-[0.3em]">
            Football Prediction League
          </p>
        </div>

        <form onSubmit={onSubmit} className="glossy-card p-6 space-y-5">
          <div className="accent-strip" />
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Employee Code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              autoComplete="off"
              placeholder="e.g. EMP1024"
              className="mt-2 w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-lg font-mono tracking-widest text-foreground outline-none focus:border-[var(--primary-glow)]"
              maxLength={32}
            />
          </label>
          <button type="submit" disabled={busy} className="btn-glossy w-full">
            {busy ? "Signing in…" : "Login"}
          </button>
          <p className="text-xs text-center text-muted-foreground">
            Use your corporate employee code. No password required.
          </p>
        </form>
      </div>
    </main>
  );
}