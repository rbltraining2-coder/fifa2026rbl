import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ADMIN_ID = "50161635";

async function assertAdmin(adminEmployeeId: string) {
  if (adminEmployeeId.toUpperCase() !== ADMIN_ID) {
    throw new Error("Forbidden: admin access required.");
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: caller } = await (supabaseAdmin as any)
    .from("registered_users")
    .select("is_admin")
    .eq("employee_id", ADMIN_ID)
    .maybeSingle();
  if (!caller?.is_admin) throw new Error("Forbidden: admin access required.");
}

const adminSchema = z.string().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/);

/* ========== Season Merchandise ========== */

export type Merchandise = {
  id: string;
  rank: number;
  name: string;
  description: string | null;
  image_url: string | null;
  active: boolean;
};

const merchSchema = z.object({
  adminEmployeeId: adminSchema,
  id: z.string().uuid().optional(),
  rank: z.number().int().min(1).max(100),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  image_url: z.string().trim().max(1024).url().optional().nullable().or(z.literal("")),
  active: z.boolean().default(true),
});

export const upsertMerchandise = createServerFn({ method: "POST" })
  .inputValidator((d) => merchSchema.parse(d))
  .handler(async ({ data }) => {
    await assertAdmin(data.adminEmployeeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      rank: data.rank,
      name: data.name,
      description: data.description?.trim() || null,
      image_url: data.image_url?.trim() || null,
      active: data.active,
    };
    if (data.id) {
      const { error } = await (supabaseAdmin as any).from("season_merchandise").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: ins, error } = await (supabaseAdmin as any)
      .from("season_merchandise").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: ins!.id };
  });

export const deleteMerchandise = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ adminEmployeeId: adminSchema, id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await assertAdmin(data.adminEmployeeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("season_merchandise").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMerchandise = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ adminEmployeeId: adminSchema }).parse(d))
  .handler(async ({ data }) => {
    await assertAdmin(data.adminEmployeeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("season_merchandise").select("*").order("rank", { ascending: true });
    if (error) throw new Error(error.message);
    return { items: (rows ?? []) as Merchandise[] };
  });

/* ========== Announcements ========== */

export type Announcement = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  start_date: string | null;
  end_date: string | null;
  active: boolean;
  sort_order: number;
};

const annSchema = z.object({
  adminEmployeeId: adminSchema,
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional().nullable(),
  image_url: z.string().trim().max(1024).url().optional().nullable().or(z.literal("")),
  start_date: z.string().trim().max(64).optional().nullable().or(z.literal("")),
  end_date: z.string().trim().max(64).optional().nullable().or(z.literal("")),
  active: z.boolean().default(true),
  sort_order: z.number().int().min(0).max(10000).default(0),
});

export const upsertAnnouncement = createServerFn({ method: "POST" })
  .inputValidator((d) => annSchema.parse(d))
  .handler(async ({ data }) => {
    await assertAdmin(data.adminEmployeeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const toIso = (v: string | null | undefined) => {
      if (!v) return null;
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d.toISOString();
    };
    const row = {
      title: data.title,
      description: data.description?.trim() || null,
      image_url: data.image_url?.trim() || null,
      start_date: toIso(data.start_date ?? null),
      end_date: toIso(data.end_date ?? null),
      active: data.active,
      sort_order: data.sort_order,
    };
    if (data.id) {
      const { error } = await (supabaseAdmin as any).from("announcements").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: ins, error } = await (supabaseAdmin as any)
      .from("announcements").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: ins!.id };
  });

export const deleteAnnouncement = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ adminEmployeeId: adminSchema, id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await assertAdmin(data.adminEmployeeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("announcements").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAnnouncementsAdmin = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ adminEmployeeId: adminSchema }).parse(d))
  .handler(async ({ data }) => {
    await assertAdmin(data.adminEmployeeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("announcements")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { items: (rows ?? []) as Announcement[] };
  });

/* ========== Prize Labels (Daily/Weekly/Monthly/Season) ========== */

export type PrizeLabelPeriod = "daily" | "weekly" | "monthly" | "season";
export type PrizeLabel = {
  id: string;
  period_type: PrizeLabelPeriod;
  rank: number;
  label: string;
  icon: string | null;
  active: boolean;
};

const prizeSchema = z.object({
  adminEmployeeId: adminSchema,
  id: z.string().uuid().optional(),
  period_type: z.enum(["daily", "weekly", "monthly", "season"]),
  rank: z.number().int().min(1).max(100),
  label: z.string().trim().min(1).max(120),
  icon: z.string().trim().max(32).optional().nullable().or(z.literal("")),
  active: z.boolean().default(true),
});

export const upsertPrizeLabel = createServerFn({ method: "POST" })
  .inputValidator((d) => prizeSchema.parse(d))
  .handler(async ({ data }) => {
    await assertAdmin(data.adminEmployeeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      period_type: data.period_type,
      rank: data.rank,
      label: data.label,
      icon: data.icon?.trim() || null,
      active: data.active,
    };
    if (data.id) {
      const { error } = await (supabaseAdmin as any).from("prize_labels").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: ins, error } = await (supabaseAdmin as any)
      .from("prize_labels")
      .upsert(row, { onConflict: "period_type,rank" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: ins!.id };
  });

export const deletePrizeLabel = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ adminEmployeeId: adminSchema, id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await assertAdmin(data.adminEmployeeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("prize_labels").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listPrizeLabelsAdmin = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ adminEmployeeId: adminSchema }).parse(d))
  .handler(async ({ data }) => {
    await assertAdmin(data.adminEmployeeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("prize_labels")
      .select("*")
      .order("period_type", { ascending: true })
      .order("rank", { ascending: true });
    if (error) throw new Error(error.message);
    return { items: (rows ?? []) as PrizeLabel[] };
  });