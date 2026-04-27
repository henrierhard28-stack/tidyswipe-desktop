import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  component: ResetPassword,
  head: () => ({
    meta: [
      { title: "Réinitialiser le mot de passe — TidySwipe" },
      { name: "description", content: "Définir un nouveau mot de passe." },
    ],
  }),
});

const passwordSchema = z.string().min(8, "Au moins 8 caractères").max(72, "Trop long");

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Supabase recovery links arrive in two possible formats:
  //  1. Legacy: #access_token=...&type=recovery (handled automatically by supabase-js)
  //  2. New PKCE: ?token_hash=...&type=recovery (must call verifyOtp manually)
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });

    const url = new URL(window.location.href);
    const tokenHash = url.searchParams.get("token_hash");
    const type = url.searchParams.get("type");
    if (tokenHash && type === "recovery") {
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" }).then(({ error: vErr }) => {
        if (vErr) setError(vErr.message);
        else setReady(true);
      });
    } else {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) setReady(true);
      });
    }
    return () => sub.subscription.unsubscribe();
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    if (password !== confirm) return setError("Les mots de passe ne correspondent pas");

    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) setError(err.message);
    else {
      setDone(true);
      setTimeout(() => navigate({ to: "/" }), 1500);
    }
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-8"
      style={{ backgroundColor: "var(--bg-app)" }}
    >
      <div
        className="w-full max-w-[420px] rounded-[14px] p-8"
        style={{
          backgroundColor: "var(--bg-app)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 30px 80px -20px rgba(0,0,0,0.7)",
        }}
      >
        <h1 className="text-[18px] font-semibold mb-1 text-center" style={{ color: "#f4f4f4" }}>
          Nouveau mot de passe
        </h1>
        <p className="text-center text-[12px] mb-7" style={{ color: "#6b6e74" }}>
          Choisissez un mot de passe de 8 caractères minimum
        </p>

        {!ready ? (
          <p className="text-center text-[12px]" style={{ color: "#6b6e74" }}>
            Lien de récupération non détecté. Réouvrez le lien reçu par email.
          </p>
        ) : done ? (
          <p
            className="text-[12px] px-3 py-2 rounded-md text-center"
            style={{ backgroundColor: "#0d1620", color: "#8ec3ff", border: "1px solid #1a2b3d" }}
          >
            Mot de passe mis à jour. Redirection…
          </p>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nouveau mot de passe"
              autoComplete="new-password"
              required
              className="rounded-[8px] px-3 py-2.5 text-[13px] outline-none focus:border-[#0A84FF]"
              style={{ backgroundColor: "var(--bg-card)", color: "#f4f4f4", border: "1px solid #1c1d20" }}
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirmer"
              autoComplete="new-password"
              required
              className="rounded-[8px] px-3 py-2.5 text-[13px] outline-none focus:border-[#0A84FF]"
              style={{ backgroundColor: "var(--bg-card)", color: "#f4f4f4", border: "1px solid #1c1d20" }}
            />
            {error && (
              <div
                className="text-[12px] px-3 py-2 rounded-md"
                style={{ backgroundColor: "#1a1010", color: "#ff8a82", border: "1px solid #3a1a1a" }}
              >
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="mt-2 w-full rounded-[10px] py-3 text-[12px] font-semibold tracking-[0.06em] text-white hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: "var(--accent-blue)" }}
            >
              {busy ? "..." : "METTRE À JOUR"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
