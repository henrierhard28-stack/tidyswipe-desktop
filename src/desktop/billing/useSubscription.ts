import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { useAuth } from "@/desktop/auth/AuthProvider";

export type AccessInfo = {
  loading: boolean;
  hasAccess: boolean;
  plan: "monthly" | "yearly" | null;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasCustomer: boolean;
  license: {
    license_key: string;
    plan: string;
    status: string;
    max_activations: number;
    activations: number;
    issued_at: string;
  } | null;
  refresh: () => Promise<void>;
};

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export function useSubscription(): AccessInfo {
  const { user, isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [plan, setPlan] = useState<AccessInfo["plan"]>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState<string | null>(null);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [hasCustomer, setHasCustomer] = useState(false);
  const [license, setLicense] = useState<AccessInfo["license"]>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setLoading(false);
      setHasAccess(false);
      setLicense(null);
      return;
    }
    const env = getStripeEnvironment();
    try {
      const [{ data: access }, { data: lic }] = await Promise.all([
        supabase.functions.invoke("check-access", { body: { environment: env } }),
        supabase.functions.invoke("get-license", { body: {} }),
      ]);
      if (access) {
        setHasAccess(!!access.access || isAdmin);
        const p = access.plan;
        setPlan(p === "monthly" || p === "yearly" ? p : null);
        setStatus(access.status ?? null);
        setCurrentPeriodEnd(access.current_period_end ?? null);
        setCancelAtPeriodEnd(!!access.cancel_at_period_end);
        setHasCustomer(!!access.has_customer);
      }
      setLicense(lic?.license ?? null);
    } catch {
      // network error → keep previous state
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin]);

  // Initial fetch + 6h interval
  useEffect(() => {
    setLoading(true);
    void refresh();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [refresh]);

  return {
    loading,
    hasAccess: hasAccess || isAdmin,
    plan,
    status,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    hasCustomer,
    license,
    refresh,
  };
}
