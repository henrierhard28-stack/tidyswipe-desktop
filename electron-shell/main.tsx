import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "../src/styles.css";
import App from "../src/desktop/App";

type EBState = { error: Error | null };

class DesktopErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { error: null };

  static getDerivedStateFromError(error: Error): EBState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[TidySwipe] Erreur non gérée au montage:", error, info);
  }

  render() {
    if (this.state.error) {
      const msg = this.state.error?.message || String(this.state.error);
      const stack = this.state.error?.stack || "";
      return (
        <div
          style={{
            minHeight: "100vh",
            background: "#050505",
            color: "#ffffff",
            padding: "32px",
            fontFamily: "ui-sans-serif, -apple-system, system-ui, sans-serif",
            fontSize: "14px",
            lineHeight: 1.5,
            overflow: "auto",
          }}
        >
          <h1 style={{ color: "#ffffff", fontSize: "20px", marginBottom: "16px" }}>
            TidySwipe — Erreur au démarrage
          </h1>
          <p style={{ color: "#ffffff", marginBottom: "12px" }}>{msg}</p>
          <pre
            style={{
              color: "#ffffff",
              background: "#111",
              padding: "12px",
              borderRadius: "8px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// Last-resort safety net: if even the boundary fails, surface the error.
window.addEventListener("error", (e) => {
  // eslint-disable-next-line no-console
  console.error("[TidySwipe] window.error:", e.error || e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  // eslint-disable-next-line no-console
  console.error("[TidySwipe] unhandledrejection:", e.reason);
});

try {
  const root = document.getElementById("root");
  if (!root) throw new Error("Élément #root introuvable dans index.html");
  createRoot(root).render(
    <StrictMode>
      <DesktopErrorBoundary>
        <App />
      </DesktopErrorBoundary>
    </StrictMode>,
  );
} catch (err) {
  document.body.style.background = "#050505";
  document.body.style.color = "#ffffff";
  document.body.innerHTML = `<div style="padding:32px;font-family:system-ui;color:#ffffff;background:#050505;min-height:100vh"><h1>TidySwipe — Erreur fatale</h1><pre style="white-space:pre-wrap;color:#ffffff">${
    (err as Error)?.stack || (err as Error)?.message || String(err)
  }</pre></div>`;
}
