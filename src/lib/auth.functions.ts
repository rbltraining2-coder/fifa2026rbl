import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Accepts: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD/MM/YY, DD-MM-YY (zero-padded too).
// Returns ISO YYYY-MM-DD or null if unparseable.
function normalizeDob(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/);
  if (!m) return null;
  const d = m[1].padStart(2, "0");
  const mo = m[2].padStart(2, "0");
  let y = m[3];
  if (y.length === 2) {
    const yi = parseInt(y, 10);
    y = (yi < 30 ? 2000 + yi : 1900 + yi).toString();
  }
  return `${y}-${mo}-${d}`;
}

function derivePassword(code: string): Promise<string> {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "fallback-secret";
  return crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(`${secret}:${code}`))
    .then((buf) =>
      Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 48),
    );
}

const credsSchema = z.object({
  employeeCode: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/, "Only letters, numbers, _ and - allowed"),
  dateOfBirth: z.string().trim().min(1).max(32),
});

// Step 1 of register: verify the (id, dob) pair against the master roster
// and confirm the user is not already registered.
export const verifyEligibility = createServerFn({ method: "POST" })
  .inputValidator((d) => credsSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const code = data.employeeCode.toUpperCase();
    const dob = normalizeDob(data.dateOfBirth);
    if (!dob) throw new Error("Invalid date of birth format. Use DD/MM/YYYY.");

    // Step 1: registered_users first — block if already registered.
    const { data: existing } = await supabaseAdmin
      .from("registered_users")
      .select("id")
      .eq("employee_id", code)
      .maybeSingle();
    if (existing) {
      throw new Error("ALREADY_REGISTERED");
    }

    // Step 2: master roster lookup.
    const { data: emp, error } = await supabaseAdmin
      .from("eligible_employees")
      .select("employee_id, name, date_of_birth")
      .eq("employee_id", code)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!emp || normalizeDob(emp.date_of_birth) !== dob) {
      throw new Error("Credentials not found in corporate roster. Please contact admin.");
    }

    return { employeeId: emp.employee_id, name: emp.name };
  });

// Step 2 of register: create the auth user + registered_users row, return session.
export const completeRegistration = createServerFn({ method: "POST" })
  .inputValidator((d) => credsSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createClient } = await import("@supabase/supabase-js");

    const code = data.employeeCode.toUpperCase();
    const dob = normalizeDob(data.dateOfBirth);
    if (!dob) throw new Error("Invalid date of birth format.");

    // Re-verify roster + not-registered.
    const { data: emp } = await supabaseAdmin
      .from("eligible_employees")
      .select("employee_id, name, date_of_birth")
      .eq("employee_id", code)
      .maybeSingle();
    if (!emp || normalizeDob(emp.date_of_birth) !== dob) {
      throw new Error("Credentials not found in corporate roster.");
    }
    const { data: existing } = await supabaseAdmin
      .from("registered_users")
      .select("id")
      .eq("employee_id", code)
      .maybeSingle();
    if (existing) throw new Error("ALREADY_REGISTERED");

    const email = `${code.toLowerCase()}@goalgurus.local`;
    const password = await derivePassword(code);

    const { data: created, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { employee_code: code },
      });
    if (createErr || !created.user) {
      throw new Error(createErr?.message ?? "Could not create user");
    }

    const { error: insErr } = await supabaseAdmin.from("registered_users").insert({
      id: created.user.id,
      employee_id: code,
      name: emp.name,
      date_of_birth: dob,
    });
    if (insErr) {
      // Roll back the auth user so the user can retry cleanly.
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw new Error(insErr.message);
    }

    const url = process.env.SUPABASE_URL!;
    const anon = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const tmp = createClient(url, anon, { auth: { persistSession: false } });
    const signed = await tmp.auth.signInWithPassword({ email, password });
    if (signed.error || !signed.data.session) {
      throw new Error(signed.error?.message ?? "Could not start session");
    }
    return {
      access_token: signed.data.session.access_token,
      refresh_token: signed.data.session.refresh_token,
      employee_code: code,
    };
  });

export const loginWithEmployeeCode = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    credsSchema.parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createClient } = await import("@supabase/supabase-js");

    const code = data.employeeCode.toUpperCase();
    const dob = normalizeDob(data.dateOfBirth);
    if (!dob) throw new Error("Invalid date of birth format. Use DD/MM/YYYY.");

    // Verify against registered_users only.
    const { data: reg, error: regErr } = await supabaseAdmin
      .from("registered_users")
      .select("id, date_of_birth")
      .eq("employee_id", code)
      .maybeSingle();
    if (regErr) throw new Error(regErr.message);
    if (!reg) throw new Error("Profile not found. Please register first.");
    if (normalizeDob(reg.date_of_birth) !== dob) {
      throw new Error("Profile not found. Please register first.");
    }

    const email = `${code.toLowerCase()}@goalgurus.local`;
    const password = await derivePassword(code);

    const url = process.env.SUPABASE_URL!;
    const anon = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const tmp = createClient(url, anon, { auth: { persistSession: false } });
    const signed = await tmp.auth.signInWithPassword({ email, password });
    if (signed.error || !signed.data.session) {
      throw new Error(signed.error?.message ?? "Could not start session");
    }

    return {
      access_token: signed.data.session.access_token,
      refresh_token: signed.data.session.refresh_token,
      employee_code: code,
    };
  });