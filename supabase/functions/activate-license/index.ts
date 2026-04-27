// Activate a license key on a device (offline mode).
// Validates the key, checks max_activations, and registers the device fingerprint.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/stripe.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function normalizeKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const rawKey = typeof body?.licenseKey === "string" ? body.licenseKey : "";
    const deviceId = typeof body?.deviceId === "string" ? body.deviceId.trim() : "";
    const deviceLabel = typeof body?.deviceLabel === "string" ? body.deviceLabel.trim().slice(0, 80) : "";

    const licenseKey = normalizeKey(rawKey);
    if (!licenseKey || licenseKey.length < 8) {
      return json({ ok: false, error: "invalid_key_format" }, 400);
    }
    if (!deviceId) {
      return json({ ok: false, error: "missing_device_id" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: lic, error: fetchErr } = await admin
      .from("licenses")
      .select("id, status, max_activations, activations, device_fingerprints, plan, license_key, last_device_change_at")
      .eq("license_key", licenseKey)
      .maybeSingle();

    if (fetchErr) {
      console.error("activate-license fetch error", fetchErr);
      return json({ ok: false, error: "db_error" }, 500);
    }
    if (!lic) {
      return json({ ok: false, error: "license_not_found" }, 404);
    }
    if (lic.status !== "active") {
      return json({ ok: false, error: "license_inactive", status: lic.status }, 403);
    }

    const fingerprints: Array<{ id: string; label?: string; activated_at: string }> =
      Array.isArray(lic.device_fingerprints) ? lic.device_fingerprints : [];

    const existing = fingerprints.find((f) => f && f.id === deviceId);
    if (existing) {
      // Already activated on this device — idempotent success.
      return json({
        ok: true,
        alreadyActivated: true,
        license: {
          license_key: lic.license_key,
          plan: lic.plan,
          status: lic.status,
          max_activations: lic.max_activations,
          activations: lic.activations,
        },
      });
    }

    // If max activations reached, enforce 7-day cooldown auto-replacement (monthly plan typically = 1 Mac).
    const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
    if (lic.activations >= lic.max_activations) {
      const lastChange = lic.last_device_change_at ? new Date(lic.last_device_change_at).getTime() : 0;
      const elapsed = Date.now() - lastChange;
      if (elapsed < COOLDOWN_MS) {
        const retryInDays = Math.ceil((COOLDOWN_MS - elapsed) / (24 * 60 * 60 * 1000));
        return json(
          {
            ok: false,
            error: "cooldown_active",
            message: `Tu as déjà changé d'appareil récemment. Tu pourras réactiver sur un nouveau Mac dans ${retryInDays} jour(s).`,
            retry_in_days: retryInDays,
            max_activations: lic.max_activations,
            activations: lic.activations,
          },
          429,
        );
      }
      // Cooldown elapsed: auto-replace the oldest device.
      fingerprints.sort((a, b) =>
        new Date(a.activated_at).getTime() - new Date(b.activated_at).getTime(),
      );
      fingerprints.shift(); // remove oldest
    }

    const newFingerprints = [
      ...fingerprints,
      { id: deviceId, label: deviceLabel || undefined, activated_at: new Date().toISOString() },
    ];

    const { error: updErr } = await admin
      .from("licenses")
      .update({
        activations: newFingerprints.length,
        device_fingerprints: newFingerprints,
        last_device_change_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", lic.id);

    if (updErr) {
      console.error("activate-license update error", updErr);
      return json({ ok: false, error: "db_error" }, 500);
    }

    return json({
      ok: true,
      alreadyActivated: false,
      license: {
        license_key: lic.license_key,
        plan: lic.plan,
        status: lic.status,
        max_activations: lic.max_activations,
        activations: newFingerprints.length,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown_error";
    console.error("activate-license error", msg);
    return json({ ok: false, error: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
