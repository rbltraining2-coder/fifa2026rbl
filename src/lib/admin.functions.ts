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
  brand_name: z.string().trim().max(64).optional().nullable(),
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
      brand_name: e.brand_name?.trim() ? e.brand_name.trim() : null,
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

    // Sync brand_name onto already-registered users so existing rosters update too.
    // Run updates in parallel, chunked to avoid overwhelming the database.
    const CHUNK_SIZE = 50;
    for (let i = 0; i < deduped.length; i += CHUNK_SIZE) {
      const chunk = deduped.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map((r) =>
          supabaseAdmin
            .from("registered_users")
            .update({ brand_name: r.brand_name })
            .eq("employee_id", r.employee_id),
        ),
      );
    }
    return { inserted: count ?? deduped.length };
  });

/* ------------------------------------------------------------------ */
/* Manual single-user CRUD                                            */
/* ------------------------------------------------------------------ */

const ADMIN_ID = "50161635";

async function assertAdmin(adminEmployeeId: string) {
  if (adminEmployeeId.toUpperCase() !== ADMIN_ID) {
    throw new Error("Forbidden: admin access required.");
  }
}

const addEmployeeSchema = z.object({
  adminEmployeeId: z.string().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/),
  employee_id: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/),
  date_of_birth: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(128),
  brand_name: z.string().trim().max(64).optional().nullable(),
});

export const addEligibleEmployee = createServerFn({ method: "POST" })
  .inputValidator((d) => addEmployeeSchema.parse(d))
  .handler(async ({ data }) => {
    await assertAdmin(data.adminEmployeeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      employee_id: data.employee_id.toUpperCase(),
      date_of_birth: data.date_of_birth,
      name: data.name,
      brand_name: data.brand_name?.trim() ? data.brand_name.trim() : null,
    };
    // Remove any existing row with the same id, then insert fresh.
    await supabaseAdmin.from("eligible_employees").delete().eq("employee_id", row.employee_id);
    const { error } = await supabaseAdmin.from("eligible_employees").insert(row);
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("registered_users")
      .update({ brand_name: row.brand_name })
      .eq("employee_id", row.employee_id);
    return { ok: true, employee_id: row.employee_id };
  });

const listSchema = z.object({
  adminEmployeeId: z.string().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/),
});

export type AdminUserRow = {
  employee_id: string;
  name: string;
  date_of_birth: string;
  brand_name: string | null;
  registered: boolean;
  last_login_at: string | null;
};

export const listAllUsers = createServerFn({ method: "POST" })
  .inputValidator((d) => listSchema.parse(d))
  .handler(async ({ data }): Promise<{ users: AdminUserRow[] }> => {
    await assertAdmin(data.adminEmployeeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [eligible, registered] = await Promise.all([
      supabaseAdmin.from("eligible_employees").select("employee_id, name, date_of_birth, brand_name").limit(10000),
      supabaseAdmin.from("registered_users").select("employee_id, name, date_of_birth, brand_name, last_login_at").limit(10000),
    ]);
    if (eligible.error) throw new Error(eligible.error.message);
    if (registered.error) throw new Error(registered.error.message);

    const regMap = new Map((registered.data ?? []).map((r) => [r.employee_id, r]));
    const map = new Map<string, AdminUserRow>();
    for (const r of eligible.data ?? []) {
      map.set(r.employee_id, {
        employee_id: r.employee_id,
        name: r.name,
        date_of_birth: r.date_of_birth,
        brand_name: r.brand_name ?? regMap.get(r.employee_id)?.brand_name ?? null,
        registered: regMap.has(r.employee_id),
        last_login_at: (regMap.get(r.employee_id) as any)?.last_login_at ?? null,
      });
    }
    // Surface registered-only rows too (in case someone slipped into the roster).
    for (const r of registered.data ?? []) {
      if (!map.has(r.employee_id)) {
        map.set(r.employee_id, {
          employee_id: r.employee_id,
          name: r.name,
          date_of_birth: r.date_of_birth,
          brand_name: r.brand_name ?? null,
          registered: true,
          last_login_at: (r as any).last_login_at ?? null,
        });
      }
    }
    const users = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    return { users };
  });

const deleteSchema = z.object({
  adminEmployeeId: z.string().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/),
  employee_id: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/),
});

export const deleteUserEverywhere = createServerFn({ method: "POST" })
  .inputValidator((d) => deleteSchema.parse(d))
  .handler(async ({ data }) => {
    await assertAdmin(data.adminEmployeeId);
    const target = data.employee_id.toUpperCase();
    if (target === ADMIN_ID) {
      throw new Error("The primary admin account cannot be deleted.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [a, b] = await Promise.all([
      supabaseAdmin.from("eligible_employees").delete().eq("employee_id", target),
      supabaseAdmin.from("registered_users").delete().eq("employee_id", target),
    ]);
    if (a.error) throw new Error(a.error.message);
    if (b.error) throw new Error(b.error.message);
    return { ok: true };
  });

const addMatchSchema = z.object({
  adminEmployeeId: z.string().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/),
  home_team: z.string().trim().min(1).max(64),
  away_team: z.string().trim().min(1).max(64),
  match_time: z.string().trim().min(1).max(64),
  stage_name: z.string().trim().max(64).optional().nullable(),
});

export const addMatchManually = createServerFn({ method: "POST" })
  .inputValidator((d) => addMatchSchema.parse(d))
  .handler(async ({ data }) => {
    await assertAdmin(data.adminEmployeeId);
    const iso = toIso(data.match_time);
    if (!iso) throw new Error(`Invalid match_time "${data.match_time}"`);
    if (data.home_team.trim().toLowerCase() === data.away_team.trim().toLowerCase()) {
      throw new Error("Home and away teams must be different.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inserted, error } = await supabaseAdmin
      .from("matches")
      .insert({
        home_team: data.home_team.trim(),
        away_team: data.away_team.trim(),
        match_time: iso,
        stage_name: data.stage_name?.trim() || null,
        status: "scheduled",
        home_score: 0,
        away_score: 0,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: inserted?.id };
  });
