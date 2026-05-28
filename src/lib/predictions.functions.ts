import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  employeeId: z.string().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/),
  matchId: z.string().uuid(),
  winner: z.enum(["home", "draw", "away"]),
  homeScore: z.number().int().min(0).max(20),
  awayScore: z.number().int().min(0).max(20),
});

export const savePrediction = createServerFn({ method: "POST" })
  .inputValidator((d) => schema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verify user exists
    const { data: user } = await supabaseAdmin
      .from("registered_users")
      .select("employee_id")
      .eq("employee_id", data.employeeId.toUpperCase())
      .maybeSingle();
    if (!user) throw new Error("Unknown user");

    // Verify match exists and is not locked (30 min before kick-off)
    const { data: match } = await supabaseAdmin
      .from("matches")
      .select("id, match_time, status")
      .eq("id", data.matchId)
      .maybeSingle();
    if (!match) throw new Error("Unknown match");
    const kickoff = new Date(match.match_time).getTime();
    const now = Date.now();
    if (kickoff - now < 30 * 60 * 1000) throw new Error("Predictions are locked");
    if (kickoff - now > 24 * 60 * 60 * 1000) throw new Error("Prediction window not open yet");

    const { error } = await supabaseAdmin.from("predictions").upsert(
      {
        user_id: data.employeeId.toUpperCase(),
        match_id: data.matchId,
        winner: data.winner,
        predicted_home_score: data.homeScore,
        predicted_away_score: data.awayScore,
      },
      { onConflict: "user_id,match_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const avatarSchema = z.object({
  userId: z.string().uuid(),
  avatarUrl: z.string().url().max(1024),
});

export const updateMyAvatar = createServerFn({ method: "POST" })
  .inputValidator((d) => avatarSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("registered_users")
      .update({ avatar_url: data.avatarUrl })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });