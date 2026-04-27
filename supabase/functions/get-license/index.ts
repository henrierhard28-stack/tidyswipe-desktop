// Returns the active license key for the authenticated user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/stripe.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ license: null, error: "no_token" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) return json({ license: null, error: "invalid_token" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: lic } = await admin
      .from("licenses")
      .select("license_key, plan, status, max_activations, activations, issued_at")
      .eq("user_id", userRes.user.id)
      .eq("status", "active")
      .order("issued_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return json({ license: lic ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return json({ license: null, error: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
