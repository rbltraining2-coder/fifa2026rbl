import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const matchSchema = z.object({
  home_team: z.string().trim().min(1).max(64),
  away_team: z.string().trim().min(1).max(64),
  match_time: z.string().trim().min(1).max(64),
  stage_name: z.string().trim().max(64).optional().nullable(),
  status: z.string().trim().max(32).optional().nullable(),
});

const payloadSchema = z.object({
  adminEmployeeId: z.string().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/),
  matches: z.array(matchSchema).min(1).max(2000),
});

// Parses a date string into ISO. Accepts ISO, or "DD/MM/YYYY HH:mm",
// "YYYY-MM-DD HH:mm", and similar common shapes.
function toIso(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  // Direct ISO / parseable
  const direct = new Date(s);
  if (!isNaN(direct.getTime())) return direct.toISOString();
  // DD/MM/YYYY [HH:mm[:ss]]
  const m = s.match(
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (m) {
    let [, d, mo, y, hh, mm, ss] = m;
    if (y.length === 2) y = (parseInt(y, 10) < 50 ? "20" : "19") + y;
    const iso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}T${(hh ?? "00").padStart(2, "0")}:${mm ?? "00"}:${ss ?? "00"}`;
    const dt = new Date(iso);
    if (!isNaN(dt.getTime())) return dt.toISOString();
  }
  return null;
}

export const importMatches = createServerFn({ method: "POST" })
  .inputValidator((d) => payloadSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verify caller is THE admin (hardcoded employee id).
    if (data.adminEmployeeId.toUpperCase() !== "50161635") {
      throw new Error("Forbidden: admin access required.");
    }
    const { data: caller } = await supabaseAdmin
      .from("registered_users")
      .select("is_admin")
      .eq("employee_id", data.adminEmployeeId.toUpperCase())
      .maybeSingle();
    if (!caller?.is_admin) throw new Error("Forbidden: admin access required.");

    const rows = data.matches.map((m, i) => {
      const iso = toIso(m.match_time);
      if (!iso) throw new Error(`Row ${i + 1}: invalid match_time "${m.match_time}"`);
      return {
        home_team: m.home_team,
        away_team: m.away_team,
        match_time: iso,
        stage_name: m.stage_name?.trim() || null,
        status: (m.status?.trim() || "upcoming") as string,
      };
    });

    // Clear placeholders and bulk insert.
    const { error: delErr } = await supabaseAdmin
      .from("matches")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (delErr) throw new Error(delErr.message);

    const { error: insErr, count } = await supabaseAdmin
      .from("matches")
      .insert(rows, { count: "exact" });
    if (insErr) throw new Error(insErr.message);

    return { inserted: count ?? rows.length };
  });

const wipeSchema = z.object({
  adminEmployeeId: z.string().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/),
});

export const wipeMatches = createServerFn({ method: "POST" })
  .inputValidator((d) => wipeSchema.parse(d))
  .handler(async ({ data }) => {
    if (data.adminEmployeeId.toUpperCase() !== "50161635") {
      throw new Error("Forbidden: admin access required.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: caller } = await supabaseAdmin
      .from("registered_users")
      .select("is_admin")
      .eq("employee_id", "50161635")
      .maybeSingle();
    if (!caller?.is_admin) throw new Error("Forbidden: admin access required.");

    const { error, count } = await supabaseAdmin
      .from("matches")
      .delete({ count: "exact" })
      .neq("status", "void");
    if (error) throw new Error(error.message);
    return { deleted: count ?? 0 };
  });

const employeeSchema = z.object({
  employee_id: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/),
  date_of_birth: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(128),
});

const employeesPayloadSchema = z.object({
  adminEmployeeId: z.string().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/),
  employees: z.array(employeeSchema).min(1).max(5000),
});

export const importEligibleEmployees = createServerFn({ method: "POST" })
  .inputValidator((d) => employeesPayloadSchema.parse(d))
  .handler(async ({ data }) => {
    if (data.adminEmployeeId.toUpperCase() !== "50161635") {
      throw new Error("Forbidden: admin access required.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: caller } = await supabaseAdmin
      .from("registered_users")
      .select("is_admin")
      .eq("employee_id", "50161635")
      .maybeSingle();
    if (!caller?.is_admin) throw new Error("Forbidden: admin access required.");

    const rows = data.employees.map((e) => ({
      employee_id: e.employee_id.toUpperCase(),
      date_of_birth: e.date_of_birth,
      name: e.name,
    }));

    // Dedupe by employee_id to avoid unique-constraint clashes inside one batch.
    const seen = new Set<string>();
    const deduped = rows.filter((r) => {
      if (seen.has(r.employee_id)) return false;
      seen.add(r.employee_id);
      return true;
    });

    const { error: delErr } = await supabaseAdmin
      .from("eligible_employees")
      .delete()
      .in("employee_id", deduped.map((r) => r.employee_id));
    if (delErr) throw new Error(delErr.message);

    const { error: insErr, count } = await supabaseAdmin
      .from("eligible_employees")
      .insert(deduped, { count: "exact" });
    if (insErr) throw new Error(insErr.message);
    return { inserted: count ?? deduped.length };
  });