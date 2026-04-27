// Stripe webhook handler — Phase 1.
// On checkout.session.completed (subscription mode):
//  1) ensure auth user exists (auto-create if needed),
//  2) upsert subscription row (plan = monthly|yearly, platform),
//  3) generate a license key linked to user + subscription.
// Idempotency is enforced via the webhook_events table.
import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient, verifyWebhook } from "../_shared/stripe.ts";

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

function readableId(price: any): string | undefined {
  return price?.metadata?.lovable_external_id || price?.id;
}

// Generate human-friendly license key like TS-XXXX-XXXX-XXXX-XXXX (no I/O/0/1)
function generateLicenseKey(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const groups: string[] = [];
  for (let g = 0; g < 4; g++) {
    let s = "";
    const buf = new Uint8Array(4);
    crypto.getRandomValues(buf);
    for (let i = 0; i < 4; i++) s += alphabet[buf[i] % alphabet.length];
    groups.push(s);
  }
  return `TS-${groups.join("-")}`;
}

async function ensureUser(email: string): Promise<{ id: string; created: boolean } | null> {
  const supabase = getSupabase();
  // Try to find existing user by email
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) {
    console.error("listUsers error", listErr);
  } else {
    const existing = list?.users?.find((u: any) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (existing) return { id: existing.id, created: false };
  }
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { source: "checkout" },
  });
  if (createErr || !created?.user) {
    console.error("createUser error", createErr);
    return null;
  }
  return { id: created.user.id, created: true };
}

async function alreadyProcessed(eventId: string, eventType: string, env: StripeEnv, payload: any): Promise<boolean> {
  const supabase = getSupabase();
  const { error } = await supabase.from("webhook_events").insert({
    provider: "stripe",
    event_id: eventId,
    event_type: eventType,
    environment: env,
    payload,
  });
  if (error) {
    // Unique violation = already processed
    if ((error as any).code === "23505") return true;
    console.error("webhook_events insert error", error);
    // Be safe: treat as not processed so we still try to handle
    return false;
  }
  return false;
}

async function handleCheckoutCompleted(session: any, env: StripeEnv) {
  if (session.mode !== "subscription") {
    console.log("Ignoring non-subscription session", session.id, session.mode);
    return;
  }

  const stripe = createStripeClient(env);
  const email: string | undefined = session.customer_details?.email || session.customer_email;
  if (!email) {
    console.error("No email on session", session.id);
    return;
  }

  const meta = session.metadata || {};
  const plan = meta.plan === "yearly" ? "yearly" : "monthly";
  const platform = meta.platform === "windows" ? "windows" : "mac";

  const ensured = await ensureUser(email);
  if (!ensured) {
    console.error("Failed to ensure user for", email);
    return;
  }
  const userId = ensured.id;

  // Fetch subscription details for accurate period dates + price/product
  const subId = session.subscription as string;
  const sub = subId ? await stripe.subscriptions.retrieve(subId) : null;
  const item = sub?.items?.data?.[0];
  const priceId = readableId(item?.price);
  const productId = item?.price?.product;
  const periodStart = item?.current_period_start ?? sub?.current_period_start;
  const periodEnd = item?.current_period_end ?? sub?.current_period_end;

  // Upsert subscription row
  const supabase = getSupabase();
  const { data: subRow, error: subErr } = await supabase
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        plan,
        platform,
        stripe_subscription_id: subId,
        stripe_customer_id: session.customer,
        stripe_checkout_session_id: session.id,
        product_id: productId,
        price_id: priceId,
        status: sub?.status || "active",
        current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancel_at_period_end: sub?.cancel_at_period_end || false,
        environment: env,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stripe_subscription_id" },
    )
    .select("id")
    .maybeSingle();
  if (subErr) console.error("subscription upsert error", subErr);

  // Issue a license key if none exists yet for this subscription.
  // max_activations: monthly = 1 Mac, yearly = 3 Macs.
  const subscriptionId = subRow?.id;
  const maxActivations = plan === "yearly" ? 3 : 1;
  if (subscriptionId) {
    const { data: existingLic } = await supabase
      .from("licenses")
      .select("id")
      .eq("subscription_id", subscriptionId)
      .maybeSingle();
    if (!existingLic) {
      let attempts = 0;
      while (attempts < 5) {
        const key = generateLicenseKey();
        const { error: licErr } = await supabase.from("licenses").insert({
          user_id: userId,
          subscription_id: subscriptionId,
          license_key: key,
          plan,
          platform,
          environment: env,
          max_activations: maxActivations,
        });
        if (!licErr) break;
        if ((licErr as any).code !== "23505") {
          console.error("license insert error", licErr);
          break;
        }
        attempts++;
      }
    } else {
      // Existing license: ensure max_activations matches the plan (handles plan upgrades).
      await supabase
        .from("licenses")
        .update({ max_activations: maxActivations, plan, updated_at: new Date().toISOString() })
        .eq("id", existingLic.id);
    }
  }
}

async function handleSubscriptionUpdate(subscription: any, env: StripeEnv) {
  const item = subscription.items?.data?.[0];
  const priceId = readableId(item?.price);
  const productId = item?.price?.product;
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;
  const meta = subscription.metadata || {};
  const plan = meta.plan === "yearly" ? "yearly" : meta.plan === "monthly" ? "monthly" : undefined;

  const update: Record<string, unknown> = {
    status: subscription.status,
    product_id: productId,
    price_id: priceId,
    current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: subscription.cancel_at_period_end || false,
    updated_at: new Date().toISOString(),
  };
  if (plan) update.plan = plan;

  const sb = getSupabase();
  const { data: subRow } = await sb
    .from("subscriptions")
    .update(update)
    .eq("stripe_subscription_id", subscription.id)
    .eq("environment", env)
    .select("id")
    .maybeSingle();

  // Sync license max_activations on plan change (1 for monthly, 3 for yearly).
  if (plan && subRow?.id) {
    const maxActivations = plan === "yearly" ? 3 : 1;
    await sb
      .from("licenses")
      .update({ max_activations: maxActivations, plan, updated_at: new Date().toISOString() })
      .eq("subscription_id", subRow.id);
  }
}

async function handleSubscriptionDeleted(subscription: any, env: StripeEnv) {
  await getSupabase()
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscription.id)
    .eq("environment", env);
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);
  console.log("Webhook event:", event.type, "env:", env);

  const eventId = (event as any).id as string;
  if (eventId) {
    const dup = await alreadyProcessed(eventId, event.type, env, event);
    if (dup) {
      console.log("Duplicate event, skipping", eventId);
      return;
    }
  }

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object, env);
      break;
    case "customer.subscription.updated":
      await handleSubscriptionUpdate(event.data.object, env);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object, env);
      break;
    default:
      console.log("Unhandled event:", event.type);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const rawEnv = new URL(req.url).searchParams.get("env");
  if (rawEnv !== "sandbox" && rawEnv !== "live") {
    console.error("Webhook received with invalid env:", rawEnv);
    return new Response(JSON.stringify({ received: true, ignored: "invalid env" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    await handleWebhook(req, rawEnv as StripeEnv);
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Webhook error:", e);
    return new Response("Webhook error", { status: 400 });
  }
});
