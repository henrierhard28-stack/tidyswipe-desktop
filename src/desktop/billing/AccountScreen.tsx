import { useState } from "react";
import { X, Loader2, ExternalLink, Crown, Sparkles, Copy, Check, Shield, Key, AlertCircle } from "lucide-react";
import { useAuth } from "@/desktop/auth/AuthProvider";
import type { AccessInfo } from "./useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";

type Props = {
  onClose: () => void;
  subscription: AccessInfo;
};

const PRICING_URL = "https://tidyswipe.app/#tarifs";
const PORTAL_RETURN_URL = "https://tidyswipe.app/compte";

function openExternal(url: string) {
  if (typeof window !== "undefined" && window.electronAPI?.openExternal) {
    void window.electronAPI.openExternal(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

// Stable per-machine identifier (best-effort, persisted in localStorage)
function getDeviceId(): string {
  try {
    const KEY = "tidyswipe.deviceId";
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = (crypto?.randomUUID?.() ?? `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return `dev-${Date.now()}`;
  }
}

function getDeviceLabel(): string {
  try {
    const ua = navigator.userAgent || "";
    if (/Mac/i.test(ua)) return "Mac";
    if (/Windows/i.test(ua)) return "PC Windows";
    if (/Linux/i.test(ua)) return "Linux";
    return "Cet appareil";
  } catch {
    return "Cet appareil";
  }
}

export default function AccountScreen({ onClose, subscription }: Props) {
  const { user, profile, isAdmin, signOut } = useAuth();
  const { plan, status, currentPeriodEnd, cancelAtPeriodEnd, hasCustomer, license, loading, refresh } = subscription;
  const [copied, setCopied] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  // Manual activation state
  const [manualKey, setManualKey] = useState("");
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [activateSuccess, setActivateSuccess] = useState<string | null>(null);

  const displayName = profile?.display_name || user?.email?.split("@")[0] || "Utilisateur";

  const planLabel = (() => {
    if (isAdmin) return "Administrateur — accès complet";
    if (plan === "yearly") {
      if (cancelAtPeriodEnd) return "Abonnement annuel (annulé en fin de période)";
      if (status === "past_due") return "Abonnement annuel (paiement en attente)";
      return "Abonnement annuel";
    }
    if (plan === "monthly") {
      if (cancelAtPeriodEnd) return "Abonnement mensuel (annulé en fin de période)";
      if (status === "past_due") return "Abonnement mensuel (paiement en attente)";
      return "Abonnement mensuel";
    }
    return "Aucun abonnement actif";
  })();

  const periodText = currentPeriodEnd
    ? new Date(currentPeriodEnd).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : null;

  const copyLicense = async () => {
    if (!license?.license_key) return;
    try {
      await navigator.clipboard.writeText(license.license_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const openPortal = async () => {
    setPortalError(null);
    setPortalLoading(true);
    try {
      const env = getStripeEnvironment();
      const { data, error } = await supabase.functions.invoke("create-portal-session", {
        body: { returnUrl: PORTAL_RETURN_URL, environment: env },
      });
      if (error) throw error;
      const url = (data as { url?: string } | null)?.url;
      if (!url) throw new Error("URL du portail introuvable");
      openExternal(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Impossible d'ouvrir le portail";
      setPortalError(msg);
    } finally {
      setPortalLoading(false);
    }
  };

  const activateManual = async () => {
    setActivateError(null);
    setActivateSuccess(null);
    const key = manualKey.trim().toUpperCase();
    if (!key || key.length < 8) {
      setActivateError("Clé invalide");
      return;
    }
    setActivating(true);
    try {
      const { data, error } = await supabase.functions.invoke("activate-license", {
        body: { licenseKey: key, deviceId: getDeviceId(), deviceLabel: getDeviceLabel() },
      });
      if (error) throw error;
      const res = data as { ok?: boolean; error?: string; alreadyActivated?: boolean } | null;
      if (!res?.ok) {
        const map: Record<string, string> = {
          license_not_found: "Cette clé n'existe pas. Vérifie qu'elle est bien copiée.",
          license_inactive: "Cette licence n'est plus active.",
          max_activations_reached: "Limite d'appareils atteinte pour cette clé.",
          invalid_key_format: "Format de clé invalide.",
        };
        setActivateError(map[res?.error ?? ""] ?? "Activation impossible. Réessaie plus tard.");
        return;
      }
      setActivateSuccess(res.alreadyActivated ? "Cet appareil est déjà activé ✓" : "Licence activée sur cet appareil ✓");
      setManualKey("");
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur réseau";
      setActivateError(msg);
    } finally {
      setActivating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="w-full max-w-[480px] max-h-[90vh] overflow-y-auto rounded-[14px]"
        style={{
          backgroundColor: "var(--bg-app)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 30px 80px -20px rgba(0,0,0,0.7)",
        }}
      >
        <div
          className="sticky top-0 z-10 relative flex items-center justify-center px-5 h-[44px]"
          style={{
            borderBottom: "1px solid var(--border-subtle)",
            backgroundColor: "var(--bg-app)",
          }}
        >
          <span className="text-[13px] font-semibold" style={{ color: "#ededed" }}>
            Compte & licence
          </span>
          <button
            onClick={onClose}
            className="absolute right-3 p-1.5 rounded-md hover:bg-white/5"
            style={{ color: "#9a9a9a" }}
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-7 py-7">
          {/* Identity */}
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-[44px] h-[44px] rounded-full flex items-center justify-center text-[16px] font-semibold text-white"
              style={{ backgroundColor: "var(--accent-blue)" }}
            >
              {(displayName[0] || "?").toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold truncate" style={{ color: "#ededed" }}>
                {displayName}
              </div>
              <div className="text-[12px] truncate" style={{ color: "#9a9a9a" }}>
                {user?.email}
              </div>
            </div>
          </div>

          {/* Plan card */}
          <div
            className="rounded-[10px] p-5 mb-4"
            style={{ backgroundColor: "var(--bg-card)", border: "1px solid #1c1d20" }}
          >
            <div className="flex items-center gap-2 mb-2">
              {isAdmin ? (
                <Sparkles size={14} style={{ color: "var(--accent-blue)" }} />
              ) : (
                <Crown size={14} style={{ color: plan ? "var(--accent-blue)" : "#6b6e74" }} />
              )}
              <span
                className="text-[11px] font-semibold uppercase tracking-[0.08em]"
                style={{ color: "#9a9a9a" }}
              >
                Plan actuel
              </span>
            </div>
            <div className="text-[15px] font-semibold" style={{ color: "#ededed" }}>
              {loading ? "Chargement…" : planLabel}
            </div>
            {plan && periodText && !isAdmin && (
              <div className="mt-2 text-[12px]" style={{ color: "#9a9a9a" }}>
                {cancelAtPeriodEnd || status === "canceled"
                  ? `Accès jusqu'au ${periodText}`
                  : `Prochain renouvellement : ${periodText}`}
              </div>
            )}
          </div>

          {/* License key card */}
          {license?.license_key && (
            <div
              className="rounded-[10px] p-5 mb-4"
              style={{ backgroundColor: "var(--bg-card)", border: "1px solid #1c1d20" }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Shield size={14} style={{ color: "var(--accent-blue)" }} />
                <span
                  className="text-[11px] font-semibold uppercase tracking-[0.08em]"
                  style={{ color: "#9a9a9a" }}
                >
                  Clé de licence
                </span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <code
                  className="flex-1 text-[12px] truncate px-2 py-1.5 rounded"
                  style={{
                    color: "#ededed",
                    backgroundColor: "#0c0d0f",
                    border: "1px solid #1c1d20",
                    fontFamily: "'SF Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
                  }}
                  title={license.license_key}
                >
                  {license.license_key}
                </code>
                <button
                  onClick={copyLicense}
                  className="shrink-0 px-2 py-1.5 rounded hover:bg-white/5"
                  style={{ color: copied ? "var(--accent-blue)" : "#9a9a9a" }}
                  aria-label="Copier"
                  title="Copier"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <div className="text-[11px]" style={{ color: "#6b6e74" }}>
                {license.activations}/{license.max_activations} appareils activés
              </div>
            </div>
          )}

          {/* Manual activation card — only when no license is bound to this account */}
          {!license?.license_key && !loading && (
            <div
              className="rounded-[10px] p-5 mb-4"
              style={{ backgroundColor: "var(--bg-card)", border: "1px solid #1c1d20" }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Key size={14} style={{ color: "var(--accent-blue)" }} />
                <span
                  className="text-[11px] font-semibold uppercase tracking-[0.08em]"
                  style={{ color: "#9a9a9a" }}
                >
                  Activer une clé existante
                </span>
              </div>
              <p className="text-[12px] mb-3" style={{ color: "#9a9a9a" }}>
                Tu as déjà une clé TidySwipe ? Colle-la ici pour activer cet appareil.
              </p>
              <input
                type="text"
                value={manualKey}
                onChange={(e) => {
                  setManualKey(e.target.value);
                  setActivateError(null);
                  setActivateSuccess(null);
                }}
                placeholder="TS-XXXX-XXXX-XXXX-XXXX"
                spellCheck={false}
                autoCapitalize="characters"
                className="w-full px-3 py-2 rounded text-[12px] mb-2 focus:outline-none focus:ring-1"
                style={{
                  color: "#ededed",
                  backgroundColor: "#0c0d0f",
                  border: "1px solid #1f2024",
                  fontFamily: "'SF Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
                }}
              />
              {activateError && (
                <div
                  className="flex items-start gap-1.5 text-[11.5px] mb-2"
                  style={{ color: "#ff8a82" }}
                >
                  <AlertCircle size={12} className="mt-[2px] shrink-0" />
                  <span>{activateError}</span>
                </div>
              )}
              {activateSuccess && (
                <div
                  className="text-[11.5px] mb-2"
                  style={{ color: "var(--accent-blue)" }}
                >
                  {activateSuccess}
                </div>
              )}
              <button
                onClick={() => void activateManual()}
                disabled={activating || !manualKey.trim()}
                className="w-full h-9 rounded text-[12.5px] font-medium flex items-center justify-center gap-2 transition-opacity disabled:opacity-50 hover:opacity-90"
                style={{ backgroundColor: "var(--accent-blue)", color: "white" }}
              >
                {activating ? (
                  <>
                    <Loader2 size={12} className="animate-spin" /> Activation…
                  </>
                ) : (
                  "Activer cet appareil"
                )}
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2">
            {hasCustomer ? (
              <>
                <button
                  onClick={() => void openPortal()}
                  disabled={portalLoading}
                  className="w-full h-10 rounded-md text-[13px] font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: "var(--accent-blue)", color: "white" }}
                >
                  {portalLoading ? (
                    <>
                      <Loader2 size={12} className="animate-spin" /> Ouverture…
                    </>
                  ) : (
                    <>
                      Gérer mon abonnement
                      <ExternalLink size={12} />
                    </>
                  )}
                </button>
                {portalError && (
                  <div
                    className="flex items-start gap-1.5 text-[11.5px] px-1"
                    style={{ color: "#ff8a82" }}
                  >
                    <AlertCircle size={12} className="mt-[2px] shrink-0" />
                    <span>{portalError}</span>
                  </div>
                )}
              </>
            ) : (
              !isAdmin && (
                <button
                  onClick={() => openExternal(PRICING_URL)}
                  className="w-full h-10 rounded-md text-[13px] font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: "var(--accent-blue)", color: "white" }}
                >
                  Voir les abonnements
                  <ExternalLink size={12} />
                </button>
              )
            )}
            <button
              onClick={() => void signOut()}
              className="w-full h-10 rounded-md text-[13px] font-medium hover:bg-white/5 transition-colors"
              style={{ color: "#ff8a82", border: "1px solid #3a1a1a" }}
            >
              Se déconnecter
            </button>
          </div>

          {loading && (
            <div className="mt-4 flex items-center justify-center text-[12px]" style={{ color: "#6b6e74" }}>
              <Loader2 size={12} className="animate-spin mr-2" /> Synchronisation…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
