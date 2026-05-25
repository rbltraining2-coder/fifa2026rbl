import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Accepts: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD/MM/YY, DD-MM-YY (and zero-padded variants).
// Returns ISO YYYY-MM-DD or null if unparseable.
function normalizeDob(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  // ISO already
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // DD[/-]MM[/-]YYYY or YY
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/);
  if (!m) return null;
  const d = m[1].padStart(2, "0");
  const mo = m[2].padStart(2, "0");
  let y = m[3];
  if (y.length === 2) {
    const yi = parseInt(y, 10);
    // 2-digit year: 00-29 → 2000s, 30-99 → 1900s
    y = (yi < 30 ? 2000 + yi : 1900 + yi).toString();
  }
  return `${y}-${mo}-${d}`;
}

export const loginWithEmployeeCode = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        employeeCode: z
          .string()
          .trim()
          .min(1)
          .max(32)
          .regex(/^[A-Za-z0-9_-]+$/, "Only letters, numbers, _ and - allowed"),
        dateOfBirth: z.string().trim().min(1).max(32),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createClient } = await import("@supabase/supabase-js");

    const code = data.employeeCode.toUpperCase();
    const email = `${code.toLowerCase()}@goalgurus.local`;

    const normalizedDob = normalizeDob(data.dateOfBirth);
    if (!normalizedDob) {
      throw new Error("Invalid date of birth format. Use DD/MM/YYYY.");
    }

    // Verify (employee_code, date_of_birth) matches the credentials table.
    const { data: cred, error: credErr } = await supabaseAdmin
      .from("employee_credentials")
      .select("date_of_birth")
      .eq("employee_code", code)
      .maybeSingle();
    if (credErr) throw new Error(credErr.message);
    if (!cred || cred.date_of_birth !== normalizedDob) {
      throw new Error("Invalid Employee Code or Date of Birth.");
    }

    // Deterministic password derived from a server-only secret.
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "fallback-secret";
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest("SHA-256", enc.encode(`${secret}:${code}`));
    const password = Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 48);

    const url = process.env.SUPABASE_URL!;
    const anon = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const tmp = createClient(url, anon, { auth: { persistSession: false } });

    let signed = await tmp.auth.signInWithPassword({ email, password });

    if (signed.error) {
      // Create the auth user + matching profile on first login.
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { employee_code: code },
      });
      if (createErr || !created.user) {
        throw new Error(createErr?.message ?? "Could not create user");
      }
      const { error: profErr } = await supabaseAdmin.from("profiles").insert({
        id: created.user.id,
        employee_code: code,
        name: code,
      });
      if (profErr) {
        // Non-fatal: profile may already exist if a previous attempt partially succeeded.
        console.warn("profile insert:", profErr.message);
      }
      signed = await tmp.auth.signInWithPassword({ email, password });
      if (signed.error || !signed.data.session) {
        throw new Error(signed.error?.message ?? "Could not start session");
      }
    }

    return {
      access_token: signed.data.session!.access_token,
      refresh_token: signed.data.session!.refresh_token,
      employee_code: code,
    };
  });