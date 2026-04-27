// Allows the authenticated user to deactivate one of their own devices from a license.
// Bypasses the 7-day cooldown next time (since activations < max_activations again).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/stripe.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ ok: false, error: "no_token" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) return json({ ok: false, error: "invalid_token" }, 401);

    const body = await req.json().catch(() => ({}));
    const deviceId = typeof body?.deviceId === "string" ? body.deviceId.trim() : "";
    if (!deviceId) return json({ ok: false, error: "missing_device_id" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Fetch the user's active license (RLS-equivalent enforced by user_id filter).
    const { data: lic } = await admin
      .from("licenses")
      .select("id, device_fingerprints")
      .eq("user_id", userRes.user.id)
      .eq("status", "active")
      .order("issued_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lic) return json({ ok: false, error: "license_not_found" }, 404);

    const fps: Array<{ id: string }> = Array.isArray(lic.device_fingerprints)
      ? lic.device_fingerprints
      : [];
    const filtered = fps.filter((f) => f && f.id !== deviceId);

    if (filtered.length === fps.length) {
      return json({ ok: false, error: "device_not_found" }, 404);
    }

    const { error: updErr } = await admin
      .from("licenses")
      .update({
        device_fingerprints: filtered,
        activations: filtered.length,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lic.id);

    if (updErr) return json({ ok: false, error: "db_error" }, 500);
    return json({ ok: true, activations: filtered.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown_error";
    return json({ ok: false, error: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
