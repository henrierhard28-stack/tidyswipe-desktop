// Returns whether the authenticated user has active access (admin OR active subscription).
// Called by the desktop app at launch and every 6 hours.
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
    if (!token) {
      return json({ access: false, error: "no_token" }, 401);
    }

    // Identify user from JWT
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) {
      return json({ access: false, error: "invalid_token" }, 401);
    }
    const userId = userRes.user.id;

    let env = "sandbox";
    try {
      const body = await req.json();
      if (body && typeof body.environment === "string") env = body.environment;
    } catch {
      /* no body */
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Use the SECURITY DEFINER db function as source of truth.
    const { data: accessData, error: accessErr } = await admin.rpc("has_active_access", {
      _user_id: userId,
      _env: env,
    });
    if (accessErr) throw accessErr;

    // Fetch the most relevant subscription for display info.
    const { data: sub } = await admin
      .from("subscriptions")
      .select("plan, status, current_period_end, cancel_at_period_end, stripe_customer_id")
      .eq("user_id", userId)
      .eq("environment", env)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return json({
      access: !!accessData,
      plan: sub?.plan ?? null,
      status: sub?.status ?? null,
      current_period_end: sub?.current_period_end ?? null,
      cancel_at_period_end: sub?.cancel_at_period_end ?? false,
      has_customer: !!sub?.stripe_customer_id,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return json({ access: false, error: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
