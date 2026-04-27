// Public endpoint: returns the license + email for a given checkout session_id.
// Polled by /merci page until the webhook has finished processing.
import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient, corsHeaders } from "../_shared/stripe.ts";

let _supabase: any = null;
function getSupabase(): any {
  if (!_supabase) {
    _supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
  }
  return _supabase;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const { sessionId, environment } = await req.json();
    if (!sessionId || !environment) throw new Error("Missing fields");
    if (environment !== "sandbox" && environment !== "live") throw new Error("Invalid environment");
    const env: StripeEnv = environment;

    const stripe = createStripeClient(env);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid" && session.status !== "complete") {
      return new Response(
        JSON.stringify({ status: "pending", paymentStatus: session.payment_status }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const email: string | undefined = (session as any).customer_details?.email || (session as any).customer_email;
    const subId = session.subscription as string | null;

    let license: any = null;
    let plan: string | null = null;
    let platform: string | null = null;

    if (subId) {
      const supabase = getSupabase();
      const { data: subRow } = await supabase
        .from("subscriptions")
        .select("id, plan, platform")
        .eq("stripe_subscription_id", subId)
        .eq("environment", env)
        .maybeSingle();
      if (subRow?.id) {
        plan = subRow.plan;
        platform = subRow.platform;
        const { data: licRow } = await supabase
          .from("licenses")
          .select("license_key, plan, platform")
          .eq("subscription_id", subRow.id)
          .maybeSingle();
        if (licRow) license = licRow;
      }
    }

    if (!license) {
      // Webhook hasn't completed yet
      return new Response(
        JSON.stringify({ status: "processing", email }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        status: "ready",
        email,
        plan: license.plan || plan,
        platform: license.platform || platform,
        licenseKey: license.license_key,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    console.error("get-checkout-result error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
