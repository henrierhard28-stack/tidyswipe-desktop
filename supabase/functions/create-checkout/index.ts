// Public checkout: creates a Stripe Checkout Session in REDIRECT mode.
// No authentication required — buyer arrives from public landing page.
// Buyer email is collected by Stripe Checkout itself.
import { type StripeEnv, createStripeClient, corsHeaders } from "../_shared/stripe.ts";

const ALLOWED_PRICE_IDS = new Set([
  "tidyswipe_monthly_eur",
  "tidyswipe_yearly_eur",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const { priceId, platform, environment, successUrl, cancelUrl } = await req.json();

    if (!priceId || !platform || !environment || !successUrl || !cancelUrl) {
      throw new Error("Missing required fields");
    }
    if (!ALLOWED_PRICE_IDS.has(priceId)) throw new Error("Invalid priceId");
    if (platform !== "mac" && platform !== "windows") throw new Error("Invalid platform");
    if (platform === "windows") throw new Error("Windows not yet available");
    if (environment !== "sandbox" && environment !== "live") throw new Error("Invalid environment");

    const env: StripeEnv = environment;
    const stripe = createStripeClient(env);

    const prices = await stripe.prices.list({ lookup_keys: [priceId] });
    if (!prices.data.length) throw new Error("Price not found");
    const stripePrice = prices.data[0];

    const plan = priceId === "tidyswipe_yearly_eur" ? "yearly" : "monthly";

    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: stripePrice.id, quantity: 1 }],
      mode: "subscription",
      ui_mode: "hosted",
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      metadata: {
        plan,
        platform,
        priceId,
      },
      subscription_data: {
        metadata: { plan, platform, priceId },
      },
      managed_payments: { enabled: true },
    });

    return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    console.error("create-checkout error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
