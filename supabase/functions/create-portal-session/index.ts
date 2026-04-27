import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient, corsHeaders } from "../_shared/stripe.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const { returnUrl, environment } = await req.json();
    if (!returnUrl || !environment) throw new Error("Missing required fields");
    if (environment !== "sandbox" && environment !== "live") throw new Error("Invalid environment");
    const env: StripeEnv = environment;

    const authHeader = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!authHeader) throw new Error("Unauthorized");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader);
    if (authErr || !user) throw new Error("Unauthorized");

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .eq("environment", env)
      .not("stripe_customer_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub?.stripe_customer_id) throw new Error("No subscription found");

    const stripe = createStripeClient(env);
    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: returnUrl,
    });

    return new Response(JSON.stringify({ url: portal.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("create-portal-session error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
