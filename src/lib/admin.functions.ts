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
  last_login?: string | null;
  last_prediction?: { time: string; match_name: string } | null;
};

export const listAllUsers = createServerFn({ method: "POST" })
  .inputValidator((d) => listSchema.parse(d))
  .handler(async ({ data }): Promise<{ users: AdminUserRow[] }> => {
    await assertAdmin(data.adminEmployeeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pageSize = 1000;
    async function fetchAll<T>(table: "eligible_employees" | "registered_users", columns: string): Promise<T[]> {
      const all: T[] = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabaseAdmin
          .from(table)
          .select(columns)
          .range(from, from + pageSize - 1);
        if (error) throw new Error(error.message);
        const rows = (data ?? []) as T[];
        all.push(...rows);
        if (rows.length < pageSize) break;
      }
      return all;
    }
    const [eligibleRows, registeredRows] = await Promise.all([
      fetchAll<{ employee_id: string; name: string; date_of_birth: string; brand_name: string | null }>(
        "eligible_employees",
        "employee_id, name, date_of_birth, brand_name",
      ),
      fetchAll<{ employee_id: string; name: string; date_of_birth: string; brand_name: string | null; last_login_at: string | null; created_at: string | null }>(
        "registered_users",
        "employee_id, name, date_of_birth, brand_name, last_login_at, created_at",
      ),
    ]);

    const regMap = new Map(registeredRows.map((r) => [r.employee_id, r]));

    // Fetch latest prediction per user (with match info).
    type PredRow = {
      user_id: string;
      created_at: string;
      matches: { home_team: string; away_team: string } | null;
    };
    const latestPredByUser = new Map<string, { time: string; match_name: string }>();
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabaseAdmin
        .from("predictions")
        .select("user_id, created_at, matches(home_team, away_team)")
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as PredRow[];
      for (const r of rows) {
        if (latestPredByUser.has(r.user_id)) continue;
        const m = r.matches;
        latestPredByUser.set(r.user_id, {
          time: r.created_at,
          match_name: m ? `${m.home_team} vs ${m.away_team}` : "Unknown match",
        });
      }
      if (rows.length < pageSize) break;
    }

    const map = new Map<string, AdminUserRow>();
    for (const r of eligibleRows) {
      const reg = regMap.get(r.employee_id);
      const lastLogin = reg ? (reg.last_login_at ?? reg.created_at ?? null) : null;
      map.set(r.employee_id, {
        employee_id: r.employee_id,
        name: r.name,
        date_of_birth: r.date_of_birth,
        brand_name: r.brand_name ?? reg?.brand_name ?? null,
        registered: !!reg,
        last_login_at: lastLogin,
        last_login: lastLogin,
        last_prediction: latestPredByUser.get(r.employee_id) ?? null,
      });
    }
    // Surface registered-only rows too (in case someone slipped into the roster).
    for (const r of registeredRows) {
      if (!map.has(r.employee_id)) {
        const lastLogin = r.last_login_at ?? r.created_at ?? null;
        map.set(r.employee_id, {
          employee_id: r.employee_id,
          name: r.name,
          date_of_birth: r.date_of_birth,
          brand_name: r.brand_name ?? null,
          registered: true,
          last_login_at: lastLogin,
          last_login: lastLogin,
          last_prediction: latestPredByUser.get(r.employee_id) ?? null,
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

const storageSchema = z.object({
  adminEmployeeId: z.string().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/),
});

export const checkDatabaseStorage = createServerFn({ method: "POST" })
  .inputValidator((d) => storageSchema.parse(d))
  .handler(async ({ data }) => {
    await assertAdmin(data.adminEmployeeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: bytes, error } = await supabaseAdmin.rpc("get_db_size_bytes");
    if (error) throw new Error(error.message);
    const usedBytes = Number(bytes ?? 0);
    const totalBytes = 500 * 1024 * 1024;
    const availableBytes = Math.max(0, totalBytes - usedBytes);
    return { usedBytes, totalBytes, availableBytes };
  });

export type RosterActivityRow = {
  "Employee ID": string;
  Name: string;
  Brand: string;
  DOB: string;
  Status: "Registered" | "Not Registered";
  "Last Login": string;
  "Last Prediction": string;
};

export const exportRosterActivity = createServerFn({ method: "POST" })
  .inputValidator((d) => listSchema.parse(d))
  .handler(async ({ data }): Promise<{ rows: RosterActivityRow[] }> => {
    await assertAdmin(data.adminEmployeeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pageSize = 1000;
    async function fetchAll<T>(
      table: "eligible_employees" | "registered_users" | "predictions",
      columns: string,
    ): Promise<T[]> {
      const all: T[] = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabaseAdmin
          .from(table)
          .select(columns)
          .range(from, from + pageSize - 1);
        if (error) throw new Error(error.message);
        const rows = (data ?? []) as T[];
        all.push(...rows);
        if (rows.length < pageSize) break;
      }
      return all;
    }

    const [eligibleRows, registeredRows, predictionRows] = await Promise.all([
      fetchAll<{ employee_id: string; name: string; date_of_birth: string; brand_name: string | null }>(
        "eligible_employees",
        "employee_id, name, date_of_birth, brand_name",
      ),
      fetchAll<{ id: string; employee_id: string; last_login_at: string | null; name: string; date_of_birth: string; brand_name: string | null }>(
        "registered_users",
        "id, employee_id, last_login_at, created_at, name, date_of_birth, brand_name",
      ),
      fetchAll<{ user_id: string; created_at: string }>(
        "predictions",
        "user_id, created_at",
      ),
    ]);

    // latest prediction per user_id (registered_users.id)
    const latestPredByUserId = new Map<string, string>();
    for (const p of predictionRows) {
      const prev = latestPredByUserId.get(p.user_id);
      if (!prev || new Date(p.created_at).getTime() > new Date(prev).getTime()) {
        latestPredByUserId.set(p.user_id, p.created_at);
      }
    }

    const regByEmpId = new Map(
      registeredRows.map((r) => [r.employee_id, r as typeof r & { created_at?: string | null }]),
    );
    const pad = (n: number) => n.toString().padStart(2, "0");
    const fmt = (iso: string | null | undefined) => {
      if (!iso) return "Never";
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "Never";
      const day = pad(d.getDate());
      const month = pad(d.getMonth() + 1);
      const year = d.getFullYear();
      let hours = d.getHours();
      const minutes = pad(d.getMinutes());
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12 || 12;
      return `${day}-${month}-${year}, ${pad(hours)}:${minutes} ${ampm}`;
    };

    const map = new Map<string, RosterActivityRow>();
    for (const e of eligibleRows) {
      const reg = regByEmpId.get(e.employee_id);
      const lastPred = reg ? latestPredByUserId.get(reg.id) ?? null : null;
      const loginTime = reg ? (reg.last_login_at ?? (reg as any).created_at ?? null) : null;
      map.set(e.employee_id, {
        "Employee ID": e.employee_id,
        Name: e.name,
        Brand: e.brand_name ?? reg?.brand_name ?? "",
        DOB: e.date_of_birth,
        Status: reg ? "Registered" : "Not Registered",
        "Last Login": fmt(loginTime),
        "Last Prediction": fmt(lastPred),
      });
    }
    for (const r of registeredRows) {
      if (map.has(r.employee_id)) continue;
      const lastPred = latestPredByUserId.get(r.id) ?? null;
      const loginTime = r.last_login_at ?? (r as any).created_at ?? null;
      map.set(r.employee_id, {
        "Employee ID": r.employee_id,
        Name: r.name,
        Brand: r.brand_name ?? "",
        DOB: r.date_of_birth,
        Status: "Registered",
        "Last Login": fmt(loginTime),
        "Last Prediction": fmt(lastPred),
      });
    }
    const rows = Array.from(map.values()).sort((a, b) =>
      a.Name.localeCompare(b.Name),
    );
    return { rows };
  });
