import { ExternalLink, AlertCircle, LogOut } from "lucide-react";
import { useAuth } from "@/desktop/auth/AuthProvider";

const ACCOUNT_URL = "https://tidyswipe.app/compte";

function openExternal(url: string) {
  if (typeof window !== "undefined" && window.electronAPI?.openExternal) {
    void window.electronAPI.openExternal(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export default function InactiveScreen() {
  const { user, signOut } = useAuth();
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-8"
      style={{ backgroundColor: "var(--bg-app)" }}
    >
      <div
        className="w-full max-w-[440px] rounded-[14px] p-9"
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 30px 80px -20px rgba(0,0,0,0.7)",
        }}
      >
        <div className="flex flex-col items-center text-center mb-7">
          <div
            className="w-[52px] h-[52px] rounded-[14px] flex items-center justify-center mb-4"
            style={{ backgroundColor: "rgba(255,138,130,0.15)" }}
          >
            <AlertCircle size={22} style={{ color: "#ff8a82" }} strokeWidth={2} />
          </div>
          <h1 className="text-[20px] font-semibold tracking-[-0.02em]" style={{ color: "#ededed" }}>
            Abonnement inactif
          </h1>
          <p className="mt-2 text-[13px]" style={{ color: "#9a9a9a" }}>
            Aucun abonnement actif n'est associé à&nbsp;
            <span className="font-semibold" style={{ color: "#ededed" }}>{user?.email}</span>.
          </p>
          <p className="mt-1 text-[12px]" style={{ color: "#6b6e74" }}>
            Renouvelez ou réactivez votre abonnement pour continuer à utiliser TidySwipe.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => openExternal(ACCOUNT_URL)}
            className="w-full h-11 rounded-md text-[13px] font-semibold tracking-[0.04em] text-white flex items-center justify-center gap-2 hover:opacity-90"
            style={{ backgroundColor: "var(--accent-blue)" }}
          >
            GÉRER MON COMPTE
            <ExternalLink size={12} />
          </button>
          <button
            onClick={() => void signOut()}
            className="w-full h-11 rounded-md text-[13px] font-medium flex items-center justify-center gap-2 hover:bg-white/5 transition-colors"
            style={{ color: "#9a9a9a", border: "1px solid #1f2024" }}
          >
            <LogOut size={13} />
            Se déconnecter
          </button>
        </div>
      </div>
    </div>
  );
}
