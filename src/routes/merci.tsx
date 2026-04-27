import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { Check, Copy, Download, Loader2 } from "lucide-react";

export const Route = createFileRoute("/merci")({
  component: MerciPage,
  head: () => ({
    meta: [
      { title: "Merci — Votre licence TidySwipe" },
      { name: "description", content: "Votre achat est confirmé. Récupérez votre clé de licence et téléchargez TidySwipe." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
});

type ResultState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "pending" }
  | { status: "ready"; email?: string; plan: string; platform: string; licenseKey: string }
  | { status: "error"; message: string };

function MerciPage() {
  const { session_id } = Route.useSearch();
  const [state, setState] = useState<ResultState>({ status: "loading" });
  const [copied, setCopied] = useState(false);
  const downloadTriggered = useRef(false);

  useEffect(() => {
    if (!session_id) {
      setState({ status: "missing" });
      return;
    }
    let cancelled = false;
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      try {
        const { data, error } = await supabase.functions.invoke("get-checkout-result", {
          body: { sessionId: session_id, environment: getStripeEnvironment() },
        });
        if (cancelled) return;
        if (error) throw error;
        if (data?.status === "ready") {
          setState({
            status: "ready",
            email: data.email,
            plan: data.plan,
            platform: data.platform,
            licenseKey: data.licenseKey,
          });
          return;
        }
        if (attempts > 20) {
          setState({ status: "pending" });
          return;
        }
        setTimeout(poll, 1500);
      } catch (e) {
        if (cancelled) return;
        setState({ status: "error", message: e instanceof Error ? e.message : "Erreur inconnue" });
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [session_id]);

  // Auto-trigger download when ready (Mac only for now)
  useEffect(() => {
    if (state.status !== "ready" || downloadTriggered.current) return;
    if (state.platform !== "mac") return;
    downloadTriggered.current = true;
    void (async () => {
      try {
        const { data } = await supabase.functions.invoke("get-download-url", {
          body: { platform: state.platform },
        });
        if (data?.available && data?.url) {
          // Trigger download in a hidden way to avoid popup blockers
          const a = document.createElement("a");
          a.href = data.url;
          a.rel = "noopener";
          a.download = "";
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
      } catch (e) {
        console.error("download trigger error", e);
      }
    })();
  }, [state]);

  const handleManualDownload = async () => {
    if (state.status !== "ready") return;
    const { data } = await supabase.functions.invoke("get-download-url", {
      body: { platform: state.platform },
    });
    if (data?.available && data?.url) {
      window.location.href = data.url;
    }
  };

  const handleCopy = async () => {
    if (state.status !== "ready") return;
    await navigator.clipboard.writeText(state.licenseKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border/40">
        <div className="mx-auto max-w-5xl px-6 py-5 flex items-center justify-between">
          <div className="text-lg font-semibold tracking-tight">TidySwipe</div>
          <Link to="/offre" className="text-xs text-muted-foreground hover:text-foreground">
            Retour
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-6 py-16">
          {state.status === "loading" && (
            <div className="text-center">
              <Loader2 size={28} className="mx-auto animate-spin text-primary" />
              <p className="mt-4 text-muted-foreground">Confirmation de votre paiement…</p>
            </div>
          )}

          {state.status === "missing" && (
            <div className="text-center">
              <h1 className="text-2xl font-semibold">Aucune session de paiement</h1>
              <p className="mt-2 text-muted-foreground">Lien de retour manquant ou invalide.</p>
              <Link to="/offre" className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">
                Retour à la page d'achat
              </Link>
            </div>
          )}

          {state.status === "pending" && (
            <div className="text-center">
              <Loader2 size={28} className="mx-auto animate-spin text-primary" />
              <h1 className="mt-4 text-2xl font-semibold">Paiement en cours de confirmation</h1>
              <p className="mt-2 text-muted-foreground">
                Votre paiement est validé chez Stripe. La génération de la licence prend parfois quelques secondes
                supplémentaires. Rafraîchissez la page dans un instant.
              </p>
            </div>
          )}

          {state.status === "error" && (
            <div className="text-center">
              <h1 className="text-2xl font-semibold">Une erreur est survenue</h1>
              <p className="mt-2 text-muted-foreground">{state.message}</p>
            </div>
          )}

          {state.status === "ready" && (
            <div>
              <div className="flex items-center justify-center mb-6">
                <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <Check size={28} className="text-primary" />
                </div>
              </div>
              <h1 className="text-3xl font-semibold text-center tracking-tight">Merci, c'est confirmé !</h1>
              <p className="mt-2 text-center text-muted-foreground">
                Votre formule {state.plan === "yearly" ? "annuelle" : "mensuelle"} est active
                {state.email ? <> · <span className="text-foreground">{state.email}</span></> : null}.
              </p>

              <div className="mt-10 rounded-2xl border border-border bg-card p-6">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Votre clé de licence</div>
                <div className="mt-3 flex items-center gap-3">
                  <code className="flex-1 font-mono text-lg tracking-wider px-4 py-3 rounded-lg bg-muted">
                    {state.licenseKey}
                  </code>
                  <button
                    onClick={handleCopy}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-3 text-sm hover:bg-accent"
                    title="Copier"
                  >
                    {copied ? <Check size={16} className="text-primary" /> : <Copy size={16} />}
                    <span>{copied ? "Copié" : "Copier"}</span>
                  </button>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Conservez cette clé : elle vous sera demandée à la première ouverture de l'application.
                </p>
              </div>

              <div className="mt-6 rounded-2xl border border-border bg-card p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium">Téléchargement</div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Le téléchargement {state.platform === "mac" ? "macOS" : "Windows"} démarre automatiquement.
                    </p>
                  </div>
                  <button
                    onClick={handleManualDownload}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                  >
                    <Download size={16} />
                    Télécharger
                  </button>
                </div>
              </div>

              <div className="mt-10 text-center text-xs text-muted-foreground">
                Un email de confirmation vous sera envoyé prochainement avec votre licence et la facture.
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
