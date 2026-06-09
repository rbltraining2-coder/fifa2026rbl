import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  loginWithEmployeeCode,
  verifyEligibility,
  completeRegistration,
} from "@/lib/auth.functions";
import { compressAndUploadAvatar } from "@/lib/avatar";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import loginBg from "@/assets/login-bg.png";
import rblLogoAsset from "@/assets/new-rbl-logo.png.asset.json";
import superdryAsset from "@/assets/superdry-logo.png.asset.json";
import { Camera } from "lucide-react";
import { DobInput } from "@/components/DobInput";
import CinematicTransition from "@/components/CinematicTransition";
import { AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Goal Gurus" },
      { name: "description", content: "Sign in to the Goal Gurus RBL World Cup League 2026 with your employee code and date of birth." },
      { property: "og:title", content: "Sign in — Goal Gurus" },
      { property: "og:description", content: "Sign in to the Goal Gurus RBL World Cup League 2026 with your employee code and date of birth." },
      { property: "og:url", content: "https://fifa2026rbl.lovable.app/login" },
    ],
    links: [{ rel: "canonical", href: "https://fifa2026rbl.lovable.app/login" }],
  }),
  component: LoginPage,
});

type Mode = "login" | "register";
type Step = "creds" | "avatar";

function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [step, setStep] = useState<Step>("creds");
  const [code, setCode] = useState("");
  const [dob, setDob] = useState("");
  const [eligibleName, setEligibleName] = useState("");
  const [busy, setBusy] = useState(false);
  const [alreadyOpen, setAlreadyOpen] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();

  const login = useServerFn(loginWithEmployeeCode);
  const verify = useServerFn(verifyEligibility);
  const register = useServerFn(completeRegistration);
  const { signIn } = useAuth();

  const switchMode = (m: Mode) => {
    setMode(m);
    setStep("creds");
    setAvatarFile(null);
    setAvatarPreview(null);
  };

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !dob.trim()) return;
    setBusy(true);
    try {
      const r = await login({ data: { employeeCode: code.trim(), dateOfBirth: dob.trim() } });
      signIn(r);
      toast.success("Welcome back!");
      setTransitioning(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  const onVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !dob.trim()) return;
    setBusy(true);
    try {
      const r = await verify({ data: { employeeCode: code.trim(), dateOfBirth: dob.trim() } });
      setEligibleName(r.name);
      setStep("avatar");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Verification failed";
      if (msg === "ALREADY_REGISTERED") {
        setAlreadyOpen(true);
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const onPickAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setAvatarFile(f);
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const onCompleteRegister = async () => {
    if (!avatarFile) {
      toast.error("Please choose a profile picture");
      return;
    }
    setBusy(true);
    try {
      // Upload avatar first under a code-scoped path, then insert the row.
      const avatarUrl = await compressAndUploadAvatar(avatarFile, code.trim().toUpperCase());
      const r = await register({
        data: { employeeCode: code.trim(), dateOfBirth: dob.trim(), avatarUrl },
      });
      signIn(r);
      toast.success(`Welcome, ${eligibleName}!`);
      setTransitioning(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main
      className="min-h-screen flex items-center justify-center px-6 py-12 relative"
      style={{
        backgroundImage: `linear-gradient(180deg, rgba(8,14,30,0.55) 0%, rgba(8,14,30,0.85) 100%), url(${loginBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-10">
          <img
            src={rblLogoAsset.url}
            alt="RBL World Cup League 2026"
            className="mx-auto mb-5 object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.55)]"
            style={{ maxHeight: 200, width: "auto" }}
          />
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white leading-tight">
            RBL World Cup League 2026
          </h1>
          <p className="mt-1 text-xs uppercase tracking-[0.3em] text-white/70">
            <span className="align-middle">Powered by </span>
            <img
              src={superdryAsset.url}
              alt="Superdry"
              className="inline-block w-auto align-middle h-5 ml-1"
            />
          </p>
        </div>

        {step === "creds" ? (
          <div className="glossy-card p-6 space-y-5">
            <div className="accent-strip" />
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-black/40 border border-white/10">
              {(["login", "register"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className="py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition"
                  style={
                    mode === m
                      ? {
                          background: "var(--gradient-primary)",
                          color: "#fff",
                          boxShadow: "var(--shadow-glow-primary)",
                        }
                      : { color: "rgba(209,212,209,0.65)" }
                  }
                >
                  {m}
                </button>
              ))}
            </div>

            <form onSubmit={mode === "login" ? onLogin : onVerify} className="space-y-5">
              <label className="block">
                <span className="text-xs uppercase tracking-widest text-muted-foreground">Employee ID</span>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoFocus
                  autoComplete="off"
                  placeholder="e.g. 50161635"
                  className="mt-2 w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-lg font-mono tracking-widest text-foreground outline-none focus:border-[var(--primary-glow)]"
                  maxLength={32}
                />
              </label>
              <label className="block">
                <span className="text-xs uppercase tracking-widest text-muted-foreground">Date of Birth</span>
                <DobInput value={dob} onChange={setDob} />
                <span className="mt-1 block text-[10px] text-muted-foreground/70">Type DD/MM/YYYY or tap the calendar</span>
              </label>
              <button type="submit" disabled={busy} className="btn-glossy w-full">
                {busy
                  ? mode === "login" ? "Signing in…" : "Checking…"
                  : mode === "login" ? "Login" : "Next"}
              </button>
              <p className="text-xs text-center text-muted-foreground">
                {mode === "login"
                  ? "Use your employee ID and date of birth to sign in."
                  : "New here? We'll verify you against the corporate roster."}
              </p>
            </form>
          </div>
        ) : (
          <div className="glossy-card p-6 space-y-5 text-center">
            <div className="accent-strip" />
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Step 2 of 2</p>
            <h2 className="text-xl font-black">Upload Your Profile Picture</h2>
            <p className="text-sm text-muted-foreground">
              Welcome, <span className="text-white font-semibold">{eligibleName}</span>. Pick a photo —
              it'll be cropped and compressed automatically.
            </p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative mx-auto block w-32 h-32 rounded-full overflow-hidden border-4 border-white/15 bg-black/40"
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="Selected avatar preview" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl font-black text-white/40">
                  {eligibleName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <span
                className="absolute bottom-1 right-1 w-9 h-9 rounded-full flex items-center justify-center text-white"
                style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow-primary)" }}
              >
                <Camera size={16} />
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPickAvatar}
            />
            <button
              type="button"
              onClick={onCompleteRegister}
              disabled={busy || !avatarFile}
              className="btn-glossy w-full disabled:opacity-50"
            >
              {busy ? "Completing…" : "Submit & Complete Registration"}
            </button>
            <button
              type="button"
              onClick={() => { setStep("creds"); setAvatarFile(null); setAvatarPreview(null); }}
              className="text-xs text-muted-foreground underline"
            >
              ← Back
            </button>
          </div>
        )}

        {alreadyOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-6">
            <div className="glossy-card p-6 max-w-sm w-full text-center space-y-4">
              <div className="accent-strip" />
              <h3 className="text-lg font-black">Already Registered</h3>
              <p className="text-sm text-muted-foreground">
                This employee ID already has a profile. Please switch to <b>Login</b> to continue.
              </p>
              <button
                onClick={() => { setAlreadyOpen(false); switchMode("login"); }}
                className="btn-glossy w-full"
              >
                Go to Login
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}