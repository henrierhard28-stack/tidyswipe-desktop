import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  LogOut,
  Mail,
  Shield,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/compte")({
  component: ComptePage,
  head: () => ({
    meta: [
      { title: "Mon compte — TidySwipe" },
      { name: "description", content: "Gérez votre licence et votre abonnement TidySwipe." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type SubRow = {
  id: string;
  plan: string;
  platform: string | null;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  created_at: string;
};
type LicRow = {
  license_key: string;
  plan: string;
  platform: string;
  status: string;
  issued_at: string;
};

const REFUND_WINDOW_DAYS = 14;

function ComptePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [bootLoading, setBootLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setBootLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (bootLoading) {
    return (
      <Shell>
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 size={20} className="animate-spin" />
        </div>
      </Shell>
    );
  }

  return <Shell>{session ? <Dashboard session={session} /> : <SignInForm />}</Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border/40">
        <div className="mx-auto max-w-3xl px-6 py-5 flex items-center justify-between">
          <Link to="/offre" className="text-lg font-semibold tracking-tight">
            TidySwipe
          </Link>
          <div className="text-xs text-muted-foreground">Mon compte</div>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-6 py-12">{children}</div>
      </main>
      <footer className="border-t border-border/40 mt-10">
        <div className="mx-auto max-w-3xl px-6 py-6 text-xs text-muted-foreground flex flex-wrap gap-4 justify-center">
          <a href="/cgv" className="hover:text-foreground">CGV</a>
          <a href="/confidentialite" className="hover:text-foreground">Confidentialité</a>
          <a href="/mentions-legales" className="hover:text-foreground">Mentions légales</a>
          <a href="/retractation" className="hover:text-foreground">Rétractation</a>
        </div>
      </footer>
    </div>
  );
}

function SignInForm() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSending(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/compte` },
      });
      if (err) throw err;
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur d'envoi");
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Accéder à mon compte</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Entrez l'email utilisé lors de votre achat. Nous vous enverrons un lien de connexion sécurisé.
      </p>

      {sent ? (
        <div className="mt-8 rounded-xl border border-border bg-card p-6">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Mail size={16} className="text-primary" />
            </div>
            <div>
              <div className="font-medium">Lien envoyé</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Cliquez sur le lien reçu à <span className="text-foreground">{email}</span> pour vous connecter.
                Le lien peut prendre une minute à arriver. Pensez à vérifier vos spams.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.com"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-3 text-sm outline-none focus:border-primary"
            />
          </div>
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={sending}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
            Recevoir le lien de connexion
          </button>
        </form>
      )}

      <p className="mt-8 text-xs text-muted-foreground text-center">
        Pas encore de licence ?{" "}
        <Link to="/offre" className="underline">
          Voir les formules
        </Link>
      </p>
    </div>
  );
}

function planLabel(plan: string): string {
  if (plan === "yearly") return "Annuel — 9,99 €/an";
  if (plan === "monthly") return "Mensuel — 2,99 €/mois";
  if (plan === "lifetime") return "À vie";
  return plan;
}

function statusLabel(status: string): { text: string; tone: "ok" | "warn" | "off" } {
  switch (status) {
    case "active":
    case "trialing":
      return { text: "Actif", tone: "ok" };
    case "past_due":
      return { text: "Paiement en attente", tone: "warn" };
    case "canceled":
      return { text: "Résilié", tone: "off" };
    default:
      return { text: status, tone: "warn" };
  }
}

function Dashboard({ session }: { session: Session }) {
  const env = getStripeEnvironment();
  const [sub, setSub] = useState<SubRow | null>(null);
  const [lic, setLic] = useState<LicRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("id, plan, platform, status, current_period_end, cancel_at_period_end, stripe_customer_id, created_at")
        .eq("user_id", session.user.id)
        .eq("environment", env)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setSub((subs as SubRow) ?? null);

      if (subs?.id) {
        const { data: licData } = await supabase
          .from("licenses")
          .select("license_key, plan, platform, status, issued_at")
          .eq("subscription_id", subs.id)
          .maybeSingle();
        setLic((licData as LicRow) ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const channel = supabase
      .channel("compte-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${session.user.id}` },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "licenses", filter: `user_id=eq.${session.user.id}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.user.id]);

  const handleCopy = async () => {
    if (!lic) return;
    await navigator.clipboard.writeText(lic.license_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePortal = async () => {
    setActionLoading("portal");
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("create-portal-session", {
        body: { returnUrl: `${window.location.origin}/compte`, environment: env },
      });
      if (fnErr) throw fnErr;
      if (!data?.url) throw new Error("Portail indisponible");
      window.open(data.url, "_blank", "noopener");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur portail");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownload = async () => {
    setActionLoading("download");
    try {
      const platform = lic?.platform || sub?.platform || "mac";
      const { data } = await supabase.functions.invoke("get-download-url", {
        body: { platform },
      });
      if (data?.available && data?.url) window.location.href = data.url;
      else setError("Téléchargement indisponible pour cette plateforme.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRefund = async () => {
    setActionLoading("refund");
    setError(null);
    setSuccess(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("request-refund", {
        body: { environment: env },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);
      setSuccess("Remboursement effectué. Votre abonnement est résilié et la licence révoquée.");
      setConfirmRefund(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur remboursement");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  const ageDays = sub ? (Date.now() - new Date(sub.created_at).getTime()) / 86400000 : Infinity;
  const refundEligible = sub && sub.status !== "canceled" && ageDays <= REFUND_WINDOW_DAYS;
  const daysLeft = sub ? Math.max(0, Math.ceil(REFUND_WINDOW_DAYS - ageDays)) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Connecté en tant que</div>
          <div className="text-base font-medium">{session.user.email}</div>
        </div>
        <button
          onClick={handleSignOut}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <LogOut size={14} />
          Déconnexion
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
          {success}
        </div>
      )}

      {!sub ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <Shield size={28} className="mx-auto text-muted-foreground" />
          <h2 className="mt-3 text-lg font-semibold">Aucun abonnement</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Vous n'avez pas encore de licence active sur ce compte.
          </p>
          <Link
            to="/offre"
            className="mt-5 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Voir les formules
          </Link>
        </div>
      ) : (
        <>
          {/* Subscription card */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Abonnement</div>
                <div className="mt-1 text-lg font-semibold">{planLabel(sub.plan)}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {(() => {
                    const s = statusLabel(sub.status);
                    return (
                      <span
                        className={
                          s.tone === "ok"
                            ? "text-primary"
                            : s.tone === "warn"
                              ? "text-amber-500"
                              : "text-muted-foreground"
                        }
                      >
                        {s.text}
                      </span>
                    );
                  })()}
                  {sub.current_period_end && sub.status !== "canceled" && (
                    <>
                      {" · "}
                      {sub.cancel_at_period_end ? "Se termine le " : "Renouvellement le "}
                      {new Date(sub.current_period_end).toLocaleDateString("fr-FR")}
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={handlePortal}
                disabled={actionLoading === "portal" || !sub.stripe_customer_id}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
              >
                {actionLoading === "portal" ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ExternalLink size={14} />
                )}
                Gérer l'abonnement
              </button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Modifier votre carte, voir vos factures ou résilier — tout se passe dans le portail Stripe sécurisé.
            </p>
          </div>

          {/* License card */}
          {lic && (
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Clé de licence</div>
              <div className="mt-3 flex items-center gap-3">
                <code className="flex-1 font-mono text-base tracking-wider px-4 py-3 rounded-lg bg-muted">
                  {lic.license_key}
                </code>
                <button
                  onClick={handleCopy}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-3 text-sm hover:bg-accent"
                >
                  {copied ? <Check size={16} className="text-primary" /> : <Copy size={16} />}
                  {copied ? "Copié" : "Copier"}
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Plateforme : {lic.platform === "mac" ? "macOS" : "Windows"} ·
                  Statut : {lic.status === "active" ? "active" : lic.status}
                </p>
                <button
                  onClick={handleDownload}
                  disabled={actionLoading === "download"}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                >
                  {actionLoading === "download" ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  Télécharger
                </button>
              </div>
            </div>
          )}

          {/* Refund card */}
          {refundEligible && (
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="mt-0.5 text-amber-500" />
                <div className="flex-1">
                  <div className="font-medium">Remboursement libre · {daysLeft} jour{daysLeft > 1 ? "s" : ""} restant{daysLeft > 1 ? "s" : ""}</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Conformément au droit français, vous disposez de {REFUND_WINDOW_DAYS} jours après votre achat
                    pour demander un remboursement intégral, sans justification. Votre licence sera révoquée et
                    votre abonnement résilié immédiatement.
                  </p>
                  {!confirmRefund ? (
                    <button
                      onClick={() => setConfirmRefund(true)}
                      className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent"
                    >
                      Demander un remboursement
                    </button>
                  ) : (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        onClick={handleRefund}
                        disabled={actionLoading === "refund"}
                        className="inline-flex items-center gap-2 rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground disabled:opacity-50"
                      >
                        {actionLoading === "refund" && <Loader2 size={14} className="animate-spin" />}
                        Confirmer le remboursement
                      </button>
                      <button
                        onClick={() => setConfirmRefund(false)}
                        className="inline-flex items-center rounded-lg border border-border px-3 py-2 text-sm"
                      >
                        Annuler
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
