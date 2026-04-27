// Tests for activate-license logic: cooldown enforcement + max_activations.
// These run pure logic unit tests on the cooldown/activation rules without
// actually calling Supabase (we extract & re-test the algorithm).
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

type Fingerprint = { id: string; activated_at: string; label?: string };

type License = {
  max_activations: number;
  activations: number;
  device_fingerprints: Fingerprint[];
  last_device_change_at: string | null;
};

function attemptActivation(lic: License, deviceId: string, now: number) {
  // Returns { ok, error?, retry_in_days?, newFps?, newCount? }
  const existing = lic.device_fingerprints.find((f) => f.id === deviceId);
  if (existing) return { ok: true, alreadyActivated: true };

  if (lic.activations >= lic.max_activations) {
    const lastChange = lic.last_device_change_at
      ? new Date(lic.last_device_change_at).getTime()
      : 0;
    const elapsed = now - lastChange;
    if (elapsed < COOLDOWN_MS) {
      const retry_in_days = Math.ceil((COOLDOWN_MS - elapsed) / (24 * 60 * 60 * 1000));
      return { ok: false, error: "cooldown_active", retry_in_days };
    }
    // auto-replace oldest
    const sorted = [...lic.device_fingerprints].sort(
      (a, b) => new Date(a.activated_at).getTime() - new Date(b.activated_at).getTime(),
    );
    sorted.shift();
    const newFps = [...sorted, { id: deviceId, activated_at: new Date(now).toISOString() }];
    return { ok: true, newFps, newCount: newFps.length };
  }

  const newFps = [
    ...lic.device_fingerprints,
    { id: deviceId, activated_at: new Date(now).toISOString() },
  ];
  return { ok: true, newFps, newCount: newFps.length };
}

Deno.test("monthly plan: first device activates successfully (1 of 1)", () => {
  const lic: License = {
    max_activations: 1,
    activations: 0,
    device_fingerprints: [],
    last_device_change_at: null,
  };
  const r = attemptActivation(lic, "mac-A", Date.now());
  assert(r.ok);
  assertEquals(r.newCount, 1);
});

Deno.test("monthly plan: re-activating same Mac is idempotent", () => {
  const lic: License = {
    max_activations: 1,
    activations: 1,
    device_fingerprints: [{ id: "mac-A", activated_at: new Date().toISOString() }],
    last_device_change_at: new Date().toISOString(),
  };
  const r = attemptActivation(lic, "mac-A", Date.now());
  assert(r.ok);
  assert(r.alreadyActivated);
});

Deno.test("monthly plan: second Mac within 7d → cooldown blocked", () => {
  const now = Date.now();
  const lic: License = {
    max_activations: 1,
    activations: 1,
    device_fingerprints: [{ id: "mac-A", activated_at: new Date(now - 1000).toISOString() }],
    last_device_change_at: new Date(now - 1000).toISOString(),
  };
  const r = attemptActivation(lic, "mac-B", now);
  assertEquals(r.ok, false);
  assertEquals(r.error, "cooldown_active");
  assertEquals(r.retry_in_days, 7);
});

Deno.test("monthly plan: second Mac after 7d → auto-replaces oldest", () => {
  const now = Date.now();
  const eightDaysAgo = now - 8 * 24 * 60 * 60 * 1000;
  const lic: License = {
    max_activations: 1,
    activations: 1,
    device_fingerprints: [{ id: "mac-A", activated_at: new Date(eightDaysAgo).toISOString() }],
    last_device_change_at: new Date(eightDaysAgo).toISOString(),
  };
  const r = attemptActivation(lic, "mac-B", now);
  assert(r.ok);
  assertEquals(r.newCount, 1);
  assertEquals(r.newFps?.[0].id, "mac-B"); // mac-A replaced
});

Deno.test("yearly plan: 3 Macs allowed, 4th blocked by cooldown", () => {
  const now = Date.now();
  const lic: License = {
    max_activations: 3,
    activations: 3,
    device_fingerprints: [
      { id: "mac-A", activated_at: new Date(now - 1000).toISOString() },
      { id: "mac-B", activated_at: new Date(now - 500).toISOString() },
      { id: "mac-C", activated_at: new Date(now - 100).toISOString() },
    ],
    last_device_change_at: new Date(now - 100).toISOString(),
  };
  const r = attemptActivation(lic, "mac-D", now);
  assertEquals(r.ok, false);
  assertEquals(r.error, "cooldown_active");
});

Deno.test("yearly plan: 4th Mac after 7d → replaces oldest (mac-A)", () => {
  const now = Date.now();
  const old = now - 8 * 24 * 60 * 60 * 1000;
  const lic: License = {
    max_activations: 3,
    activations: 3,
    device_fingerprints: [
      { id: "mac-A", activated_at: new Date(now - 1000).toISOString() },
      { id: "mac-B", activated_at: new Date(now - 500).toISOString() },
      { id: "mac-C", activated_at: new Date(now - 100).toISOString() },
    ],
    last_device_change_at: new Date(old).toISOString(),
  };
  const r = attemptActivation(lic, "mac-D", now);
  assert(r.ok);
  assertEquals(r.newCount, 3);
  const ids = r.newFps?.map((f) => f.id);
  assertEquals(ids?.includes("mac-A"), false); // oldest removed
  assertEquals(ids?.includes("mac-D"), true);
});

Deno.test("yearly plan: 2nd Mac under cap activates immediately (no cooldown check)", () => {
  const lic: License = {
    max_activations: 3,
    activations: 1,
    device_fingerprints: [{ id: "mac-A", activated_at: new Date().toISOString() }],
    last_device_change_at: new Date().toISOString(),
  };
  const r = attemptActivation(lic, "mac-B", Date.now());
  assert(r.ok);
  assertEquals(r.newCount, 2);
});
