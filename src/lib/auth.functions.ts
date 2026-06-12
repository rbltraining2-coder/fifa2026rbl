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

const credsSchema = z.object({
  employeeCode: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/, "Only letters, numbers, _ and - allowed"),
  dateOfBirth: z.string().trim().min(1).max(32),
});

// Step 1 of register: confirm the user is not already registered,
// then verify the (employee_id, date_of_birth) pair against the master roster.
export const verifyEligibility = createServerFn({ method: "POST" })
  .inputValidator((d) => credsSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const code = data.employeeCode.toUpperCase();
    const dob = normalizeDob(data.dateOfBirth);
    if (!dob) throw new Error("Invalid date format. Use DD/MM/YYYY.");

    const { data: existing } = await supabaseAdmin
      .from("registered_users")
      .select("id")
      .eq("employee_id", code)
      .maybeSingle();
    if (existing) {
      throw new Error("ALREADY_REGISTERED");
    }

    const { data: emp, error } = await supabaseAdmin
      .from("eligible_employees")
      .select("employee_id, name, date_of_birth, brand_name")
      .eq("employee_id", code)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!emp || normalizeDob(emp.date_of_birth) !== dob) {
      throw new Error("Credentials not found in corporate roster. Please contact admin.");
    }

    return { employeeId: emp.employee_id, name: emp.name, brand_name: emp.brand_name ?? null };
  });

// Step 2 of register: insert directly into registered_users (no Supabase auth).
export const completeRegistration = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    credsSchema.extend({ avatarUrl: z.string().url().max(1024).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const code = data.employeeCode.toUpperCase();
    const dob = normalizeDob(data.dateOfBirth);
    if (!dob) throw new Error("Invalid date format.");

    const { data: emp } = await supabaseAdmin
      .from("eligible_employees")
      .select("employee_id, name, date_of_birth, brand_name")
      .eq("employee_id", code)
      .maybeSingle();
    if (!emp || normalizeDob(emp.date_of_birth) !== dob) {
      throw new Error("Credentials not found in corporate roster. Please contact admin.");
    }
    const { data: existing } = await supabaseAdmin
      .from("registered_users")
      .select("id")
      .eq("employee_id", code)
      .maybeSingle();
    if (existing) throw new Error("ALREADY_REGISTERED");

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("registered_users")
      .insert({
        employee_id: code,
        name: emp.name,
        date_of_birth: dob,
        avatar_url: data.avatarUrl ?? null,
        brand_name: emp.brand_name ?? null,
        is_admin: code === "50161635",
        last_login_at: new Date().toISOString(),
      })
      .select("id, employee_id, name, avatar_url, total_points, rank, is_admin, brand_name")
      .single();
    if (insErr || !inserted) throw new Error(insErr?.message ?? "Registration failed");

    return inserted;
  });

// Login: query ONLY registered_users.
export const loginWithEmployeeCode = createServerFn({ method: "POST" })
  .inputValidator((d) => credsSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const code = data.employeeCode.toUpperCase();
    const dob = normalizeDob(data.dateOfBirth);
    if (!dob) throw new Error("Invalid date format. Use DD/MM/YYYY.");

    const { data: reg } = await supabaseAdmin
      .from("registered_users")
      .select("id, employee_id, name, avatar_url, total_points, rank, is_admin, date_of_birth, brand_name")
      .eq("employee_id", code)
      .maybeSingle();
    if (!reg || normalizeDob(reg.date_of_birth) !== dob) {
      throw new Error("Profile not found. Please register first.");
    }
    // Stamp last login (best-effort; ignore errors).
    await supabaseAdmin
      .from("registered_users")
      .update({ last_login_at: new Date().toISOString() })
      .eq("employee_id", code);
    const { date_of_birth: _dob, ...safe } = reg;
    return safe;
  });

// Session guard: re-load profile by employee_id stored in localStorage.
export const getProfileByEmployeeId = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ employeeId: z.string().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: reg } = await supabaseAdmin
      .from("registered_users")
      .select("id, employee_id, name, avatar_url, total_points, rank, is_admin, brand_name")
      .eq("employee_id", data.employeeId.toUpperCase())
      .maybeSingle();
    return reg ?? null;
  });