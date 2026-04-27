import { useState } from "react";
import { z } from "zod";
import { Loader2, Lock, ArrowRight } from "lucide-react";
import { useAuth } from "./AuthProvider";

const emailSchema = z.string().trim().email("Adresse email invalide").max(255);
const passwordSchema = z.string().min(6, "6 caractères minimum");

export default function AuthScreen() {
  const { signIn, requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const emailParsed = emailSchema.safeParse(email);
    if (!emailParsed.success) {
      setError(emailParsed.error.issues[0]?.message ?? "Email invalide");
      return;
    }
    const pwdParsed = passwordSchema.safeParse(password);
    if (!pwdParsed.success) {
      setError(pwdParsed.error.issues[0]?.message ?? "Mot de passe invalide");
      return;
    }
    setLoading(true);
    const { error: err } = await signIn(emailParsed.data, pwdParsed.data);
    setLoading(false);
    if (err) {
      const msg = err.toLowerCase();
      if (msg.includes("invalid login credentials") || msg.includes("invalid_credentials")) {
        setError("Email ou mot de passe incorrect.");
      } else if (msg.includes("email not confirmed")) {
        setError("Vérifiez votre email pour confirmer votre compte avant de vous connecter.");
      } else {
        setError(err);
      }
    }
  };

  const handleReset = async () => {
    setError(null);
    setInfo(null);
    const emailParsed = emailSchema.safeParse(email);
    if (!emailParsed.success) {
      setError("Entrez votre email d'abord pour recevoir un lien de réinitialisation.");
      return;
    }
    setLoading(true);
    const { error: err } = await requestPasswordReset(emailParsed.data);
    setLoading(false);
    if (err) {
      setError(err);
    } else {
      setInfo("Email de réinitialisation envoyé. Vérifiez votre boîte mail.");
    }
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-8"
      style={{ backgroundColor: "var(--bg-app)" }}
    >
      <div
        className="w-full max-w-[420px] rounded-[14px] p-9"
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 30px 80px -20px rgba(0,0,0,0.7)",
        }}
      >
        <div className="flex flex-col items-center text-center mb-7">
          <div
            className="w-[52px] h-[52px] rounded-[14px] flex items-center justify-center mb-4"
            style={{ backgroundColor: "var(--accent-blue)" }}
          >
            <Lock size={22} className="text-white" strokeWidth={2} />
          </div>
          <h1 className="text-[20px] font-semibold tracking-[-0.02em]" style={{ color: "#ededed" }}>
            Connexion à TidySwipe
          </h1>
          <p className="mt-1.5 text-[13px]" style={{ color: "#9a9a9a" }}>
            Utilisez l'email et le mot de passe de votre compte.
          </p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="text-[12px] font-medium" style={{ color: "#9a9a9a" }}>
            Adresse email
          </label>
          <input
            type="email"
            autoFocus
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@exemple.com"
            className="h-11 px-3 rounded-md text-[14px] outline-none focus:ring-2 transition-all"
            style={{
              backgroundColor: "#0c0d0f",
              color: "#ededed",
              border: "1px solid #1f2024",
            }}
          />

          <label className="mt-1 text-[12px] font-medium" style={{ color: "#9a9a9a" }}>
            Mot de passe
          </label>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="h-11 px-3 rounded-md text-[14px] outline-none focus:ring-2 transition-all"
            style={{
              backgroundColor: "#0c0d0f",
              color: "#ededed",
              border: "1px solid #1f2024",
            }}
          />

          {error && (
            <div
              className="text-[12px] px-3 py-2 rounded-md"
              style={{ backgroundColor: "#1a1010", color: "#ff8a82", border: "1px solid #3a1a1a" }}
            >
              {error}
            </div>
          )}
          {info && (
            <div
              className="text-[12px] px-3 py-2 rounded-md"
              style={{ backgroundColor: "#0f1a14", color: "#7ee2a8", border: "1px solid #1a3a26" }}
            >
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 h-11 rounded-md text-[13px] font-semibold tracking-[0.04em] text-white flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: "var(--accent-blue)" }}
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <>
                SE CONNECTER
                <ArrowRight size={13} strokeWidth={2.75} />
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleReset}
            disabled={loading}
            className="mt-1 text-[12px] underline self-center"
            style={{ color: "#9a9a9a" }}
          >
            Mot de passe oublié ?
          </button>
        </form>

        <p className="mt-6 text-center text-[11px]" style={{ color: "#6b6e74" }}>
          Pas encore de compte ?{" "}
          <a
            href="https://tidyswipe.app/offre"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            style={{ color: "var(--accent-blue)" }}
          >
            Acheter un abonnement
          </a>
        </p>
      </div>
    </div>
  );
}
