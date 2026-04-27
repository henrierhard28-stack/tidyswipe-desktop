// Allows a customer to request a refund within 14 days, without justification (FR/UE).
// We refund the latest invoice/payment_intent, cancel the subscription immediately,
// and revoke the license.
import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient, corsHeaders } from "../_shared/stripe.ts";

const REFUND_WINDOW_DAYS = 14;

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
    const { environment } = await req.json();
    if (environment !== "sandbox" && environment !== "live") throw new Error("Invalid environment");
    const env: StripeEnv = environment;

    const supabase = getSupabase();
    const authHeader = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!authHeader) throw new Error("Unauthorized");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader);
    if (authErr || !user) throw new Error("Unauthorized");

    const { data: sub, error: subErr } = await supabase
      .from("subscriptions")
      .select("id, stripe_subscription_id, stripe_customer_id, status, created_at")
      .eq("user_id", user.id)
      .eq("environment", env)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subErr || !sub) throw new Error("Aucun abonnement trouvé");

    const purchaseDate = new Date(sub.created_at);
    const ageDays = (Date.now() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > REFUND_WINDOW_DAYS) {
      throw new Error(`Délai de remboursement dépassé (${REFUND_WINDOW_DAYS} jours).`);
    }

    const stripe = createStripeClient(env);

    // Find the most recent paid invoice for this subscription
    let refundId: string | null = null;
    if (sub.stripe_subscription_id) {
      const invoices = await stripe.invoices.list({
        subscription: sub.stripe_subscription_id,
        limit: 5,
      });
      const paid = invoices.data.find((i: any) => i.status === "paid" && i.payment_intent);
      if (paid?.payment_intent) {
        const refund = await stripe.refunds.create({
          payment_intent: typeof paid.payment_intent === "string" ? paid.payment_intent : paid.payment_intent.id,
          reason: "requested_by_customer",
          metadata: { userId: user.id, subscriptionId: sub.id, source: "self_service_refund" },
        });
        refundId = refund.id;
      }

      // Cancel subscription immediately
      try {
        await stripe.subscriptions.cancel(sub.stripe_subscription_id);
      } catch (e) {
        console.error("subscription cancel error", e);
      }
    }

    // Update DB: subscription canceled + license revoked
    await supabase
      .from("subscriptions")
      .update({
        status: "canceled",
        cancel_at_period_end: false,
        current_period_end: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", sub.id);

    await supabase
      .from("licenses")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("subscription_id", sub.id);

    return new Response(
      JSON.stringify({ ok: true, refundId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    console.error("request-refund error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
