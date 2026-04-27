import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { Check, Loader2, Apple, Monitor } from "lucide-react";

export const Route = createFileRoute("/offre")({
  component: OffrePage,
  head: () => ({
    meta: [
      { title: "TidySwipe — Choisissez votre formule" },
      { name: "description", content: "Allégez votre Mac, fichier par fichier. Mensuel 2,99 € ou annuel 9,99 €." },
      { property: "og:title", content: "TidySwipe — Choisissez votre formule" },
      { property: "og:description", content: "Mensuel 2,99 € ou annuel 9,99 € — résiliable à tout moment." },
    ],
  }),
});

type Plan = "monthly" | "yearly";
type Platform = "mac" | "windows";

const PLANS: Record<Plan, { priceId: string; label: string; price: string; sub: string; badge?: string }> = {
  monthly: {
    priceId: "tidyswipe_monthly_eur",
    label: "Mensuel",
    price: "2,99 €",
    sub: "/ mois",
  },
  yearly: {
    priceId: "tidyswipe_yearly_eur",
    label: "Annuel",
    price: "9,99 €",
    sub: "/ an",
    badge: "−72 %",
  },
};

function OffrePage() {
  const navigate = useNavigate();
  const [platform, setPlatform] = useState<Platform>("mac");
  const [plan, setPlan] = useState<Plan>("yearly");
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheckout = async () => {
    if (!accepted) {
      setError("Merci d'accepter les CGV et la politique de confidentialité.");
      return;
    }
    if (platform === "windows") {
      setError("La version Windows arrive bientôt.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const origin = window.location.origin;
      const { data, error: fnErr } = await supabase.functions.invoke("create-checkout", {
        body: {
          priceId: PLANS[plan].priceId,
          platform,
          environment: getStripeEnvironment(),
          successUrl: `${origin}/merci?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${origin}/offre`,
        },
      });
      if (fnErr) throw fnErr;
      if (!data?.url) throw new Error("Checkout indisponible");
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inattendue");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border/40">
        <div className="mx-auto max-w-5xl px-6 py-5 flex items-center justify-between">
          <div className="text-lg font-semibold tracking-tight">TidySwipe</div>
          <div className="text-xs text-muted-foreground">Paiement sécurisé · Stripe</div>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-6 py-14">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-center">
            Allégez votre Mac, fichier par fichier
          </h1>
          <p className="mt-3 text-center text-muted-foreground">
            Choisissez votre système et votre formule. Sans engagement, résiliable à tout moment.
          </p>

          {/* OS selector */}
          <div className="mt-10">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Système</div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPlatform("mac")}
                className={`relative rounded-xl border p-4 text-left transition ${
                  platform === "mac" ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-foreground/30"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Apple size={22} />
                  <div>
                    <div className="font-medium">macOS</div>
                    <div className="text-xs text-muted-foreground">Disponible</div>
                  </div>
                </div>
                {platform === "mac" && (
                  <Check size={16} className="absolute top-3 right-3 text-primary" />
                )}
              </button>
              <button
                type="button"
                disabled
                className="relative rounded-xl border border-border/50 p-4 text-left opacity-60 cursor-not-allowed"
              >
                <div className="flex items-center gap-3">
                  <Monitor size={22} />
                  <div>
                    <div className="font-medium">Windows</div>
                    <div className="text-xs text-muted-foreground">Bientôt</div>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Plan selector */}
          <div className="mt-8">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Formule</div>
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(PLANS) as Plan[]).map((p) => {
                const cfg = PLANS[p];
                const active = plan === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlan(p)}
                    className={`relative rounded-xl border p-5 text-left transition ${
                      active ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-foreground/30"
                    }`}
                  >
                    {cfg.badge && (
                      <span className="absolute -top-2 right-4 text-[10px] font-semibold bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                        {cfg.badge}
                      </span>
                    )}
                    <div className="font-medium">{cfg.label}</div>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="text-2xl font-semibold">{cfg.price}</span>
                      <span className="text-sm text-muted-foreground">{cfg.sub}</span>
                    </div>
                    {active && <Check size={16} className="absolute top-3 right-3 text-primary" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Includes */}
          <ul className="mt-8 space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2"><Check size={16} className="text-primary mt-0.5" />Tri rapide par swipe (clavier ou souris)</li>
            <li className="flex gap-2"><Check size={16} className="text-primary mt-0.5" />Suppression sécurisée vers la corbeille système</li>
            <li className="flex gap-2"><Check size={16} className="text-primary mt-0.5" />Mises à jour incluses · Support par email</li>
            <li className="flex gap-2"><Check size={16} className="text-primary mt-0.5" />Résiliation en un clic depuis votre compte</li>
          </ul>

          {/* Consent */}
          <label className="mt-8 flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-1"
            />
            <span className="text-muted-foreground">
              J'accepte les{" "}
              <a className="underline" href="/cgv">
                CGV
              </a>{" "}
              et la{" "}
              <a className="underline" href="/confidentialite">
                politique de confidentialité
              </a>
              . Je comprends qu'en accédant immédiatement au logiciel après paiement, je renonce expressément à mon
              droit de rétractation de 14 jours (art. L221-28 1° du Code de la consommation).
            </span>
          </label>

          {error && (
            <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <button
            onClick={handleCheckout}
            disabled={loading || !accepted}
            className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 text-base font-semibold text-primary-foreground transition disabled:opacity-50 hover:opacity-95"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Redirection vers Stripe…
              </>
            ) : (
              <>Payer {PLANS[plan].price} {PLANS[plan].sub}</>
            )}
          </button>

          <p className="mt-3 text-center text-xs text-muted-foreground">
            Paiement sécurisé Stripe · TVA gérée automatiquement · Annulation à tout moment
          </p>
        </div>
      </main>

      <footer className="border-t border-border/40 mt-10">
        <div className="mx-auto max-w-5xl px-6 py-6 text-xs text-muted-foreground flex flex-wrap gap-4 justify-center">
          <a href="/cgv" className="hover:text-foreground">CGV</a>
          <a href="/confidentialite" className="hover:text-foreground">Confidentialité</a>
          <a href="/mentions-legales" className="hover:text-foreground">Mentions légales</a>
          <a href="/retractation" className="hover:text-foreground">Rétractation</a>
        </div>
      </footer>
    </div>
  );
}
