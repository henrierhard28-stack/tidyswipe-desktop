import {
  Database,
  Folder,
  Check,
  X,
  ArrowUpRight,
  FileText,
  RotateCcw,
  AlertCircle,
  Shield,
  Undo2,
  Download as DownloadIcon,
  Image as ImageIcon,
  FolderOpen,
  Eye,
  Sparkles,
  Share2,
  Copy as CopyIcon,
  MessageCircle,
  Mail,
  Link2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ElectronFile, FolderPreset, CleanupCandidate } from "./electron";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import NotificationBell from "./notifications/NotificationBell";
import NotificationsScreen from "./notifications/NotificationsScreen";
import wooshSound from "@/assets/woosh-trash.mp3";
import AuthScreen from "./auth/AuthScreen";
import AccountScreen from "./billing/AccountScreen";
import InactiveScreen from "./billing/InactiveScreen";
import { useSubscription } from "./billing/useSubscription";
import { evaluateSafety, riskBadge, type SafetyVerdict } from "./safety";

export default function App() {
  return (
    <AuthProvider>
      <AppGate />
    </AuthProvider>
  );
}

function AppGate() {
  const { loading: authLoading, user } = useAuth();
  const subscription = useSubscription();
  const { loading: subLoading, hasAccess } = subscription;

  if (authLoading) {
    return (
      <div
        className="min-h-screen w-full flex items-center justify-center"
        style={{ backgroundColor: "var(--bg-app)", color: "#6b6e74", fontSize: 13 }}
      >
        Chargement…
      </div>
    );
  }
  if (!user) return <AuthScreen />;

  if (subLoading) {
    return (
      <div
        className="min-h-screen w-full flex items-center justify-center"
        style={{ backgroundColor: "var(--bg-app)", color: "#6b6e74", fontSize: 13 }}
      >
        Vérification de l'abonnement…
      </div>
    );
  }
  if (!hasAccess) return <InactiveScreen />;
  return <CleanupView subscription={subscription} />;
}

type QueueItem = {
  id: string;
  name: string;
  size: number;
  path?: string;
  webUrl?: string;
  kind: "image" | "pdf" | "other";
  mtimeMs?: number;
};

type Action =
  | { type: "keep"; item: QueueItem }
  | { type: "trash"; item: QueueItem; restored?: boolean };

const ACCEPTED = /\.(png|jpe?g|webp|gif|heic|pdf)$/i;
const PDF_RE = /\.pdf$/i;
const MAX_PREVIEW_BYTES = 15 * 1024 * 1024;

function classify(name: string): QueueItem["kind"] {
  if (PDF_RE.test(name)) return "pdf";
  if (/\.(png|jpe?g|webp|gif|heic)$/i.test(name)) return "image";
  return "other";
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} Go`;
}

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m} min ${r.toString().padStart(2, "0")}`;
}

function usePreviewUrl(item: QueueItem | undefined) {
  const [url, setUrl] = useState<string | undefined>(undefined);
  const lastBlobRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    if (lastBlobRef.current) {
      URL.revokeObjectURL(lastBlobRef.current);
      lastBlobRef.current = undefined;
    }
    setUrl(undefined);

    if (!item) return;
    if ((item.kind !== "image" && item.kind !== "pdf") || item.size > MAX_PREVIEW_BYTES) return;
    if (item.webUrl) {
      setUrl(item.webUrl);
      return;
    }
    if (item.path && window.electronAPI) {
      window.electronAPI.readFileBuffer(item.path).then((res) => {
        if (cancelled || !res.ok || !res.data) return;
        const ext = (item.name.split(".").pop() || "").toLowerCase();
        const mime =
          item.kind === "pdf"
            ? "application/pdf"
            : item.kind === "image"
              ? `image/${ext === "jpg" ? "jpeg" : ext || "png"}`
              : "application/octet-stream";
        const buf = new Uint8Array(res.data).buffer;
        const blob = new Blob([buf], { type: mime });
        const u = URL.createObjectURL(blob);
        lastBlobRef.current = u;
        setUrl(u);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [item]);

  useEffect(() => {
    return () => {
      if (lastBlobRef.current) URL.revokeObjectURL(lastBlobRef.current);
    };
  }, []);

  return url;
}

type AppMode = "home" | "swipe" | "auto";

function HomeScreen({
  onPickSwipe,
  onPickAuto,
  loading,
  scanProgress,
  errorMsg,
}: {
  onPickSwipe: () => void;
  onPickAuto: () => void;
  loading: "swipe" | "auto" | null;
  scanProgress: number;
  errorMsg: string | null;
}) {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-8"
      style={{ backgroundColor: "var(--bg-app)" }}
    >
      <div className="w-full max-w-[760px]">
        <div
          className="h-[28px] w-full select-none"
          // @ts-expect-error - drag region
          style={{ WebkitAppRegion: "drag", backgroundColor: "var(--bg-app)" }}
        />
        <div className="text-center mb-12">
          <h1
            className="text-[28px] font-semibold tracking-[-0.02em]"
            style={{ color: "#ededed" }}
          >
            TidySwipe
          </h1>
          <p className="mt-2 text-[14px]" style={{ color: "#9a9a9a" }}>
            Choisissez comment vous voulez nettoyer votre Mac.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <button
            onClick={onPickSwipe}
            disabled={loading !== null}
            className="text-left rounded-[14px] p-6 transition-colors hover:bg-white/[0.03] disabled:opacity-60 disabled:cursor-wait"
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid #1c1d20",
              minHeight: 220,
            }}
          >
            <div
              className="w-[44px] h-[44px] rounded-[10px] flex items-center justify-center mb-4"
              style={{ backgroundColor: "rgba(10,132,255,0.12)" }}
            >
              <FileText size={20} style={{ color: "var(--accent-blue)" }} />
            </div>
            <p className="text-[16px] font-semibold" style={{ color: "#ededed" }}>
              Tri manuel (swipe Tinder)
            </p>
            <p className="mt-2 text-[12.5px] leading-[1.5]" style={{ color: "#9a9a9a" }}>
              Vous décidez fichier par fichier : ← corbeille, → garder. Tous les fichiers de
              Bureau, Documents et Téléchargements sont proposés un à un.
            </p>
            {loading === "swipe" && (
              <p className="mt-4 text-[11px]" style={{ color: "var(--accent-blue)" }}>
                Scan en cours… {scanProgress} fichier{scanProgress > 1 ? "s" : ""}
              </p>
            )}
          </button>

          <button
            onClick={onPickAuto}
            disabled={loading !== null}
            className="text-left rounded-[14px] p-6 transition-colors hover:bg-white/[0.03] disabled:opacity-60 disabled:cursor-wait"
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid #1c1d20",
              minHeight: 220,
            }}
          >
            <div
              className="w-[44px] h-[44px] rounded-[10px] flex items-center justify-center mb-4"
              style={{ backgroundColor: "rgba(10,132,255,0.12)" }}
            >
              <Sparkles size={20} style={{ color: "var(--accent-blue)" }} />
            </div>
            <p className="text-[16px] font-semibold" style={{ color: "#ededed" }}>
              Analyse automatique
            </p>
            <p className="mt-2 text-[12.5px] leading-[1.5]" style={{ color: "#9a9a9a" }}>
              L'app détecte seule les doublons (SHA-256) et les fichiers {">"} 50 Mo non ouverts
              depuis plus de 30 jours. Vous validez la liste en un clic.
            </p>
            {loading === "auto" && (
              <p className="mt-4 text-[11px]" style={{ color: "var(--accent-blue)" }}>
                Analyse en cours…
              </p>
            )}
          </button>
        </div>

        {errorMsg && (
          <div
            className="mt-6 flex items-center gap-2 text-[12px] px-3 py-2 rounded-md text-center justify-center"
            style={{ backgroundColor: "#1a1010", color: "#ff8a82", border: "1px solid #3a1a1a" }}
          >
            <AlertCircle size={14} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function CleanupView({ subscription }: { subscription: ReturnType<typeof useSubscription> }) {
  const isElectron = typeof window !== "undefined" && !!window.electronAPI;
  const [mode, setMode] = useState<AppMode>("swipe");
  const { profile, user, isAdmin } = useAuth();
  const [showAccount, setShowAccount] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [scanningCleanup, setScanningCleanup] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [sweepRunning, setSweepRunning] = useState(false);
  // Smart cleanup popup state — fully independent from the swipe queue.
  const [cleanupCandidates, setCleanupCandidates] = useState<CleanupCandidate[] | null>(null);
  const [cleanupSelected, setCleanupSelected] = useState<Set<string>>(new Set());
  const [cleanupDeleting, setCleanupDeleting] = useState(false);

  const displayName = profile?.display_name || user?.email?.split("@")[0] || "Utilisateur";
  const initial = (displayName[0] || "?").toUpperCase();

  // ── Persistence: keep state alive while the Electron process is running.
  // This intentionally uses the main process instead of localStorage: the
  // previous localStorage implementation could leave a large/corrupt snapshot
  // that the renderer tried to parse immediately at startup.
  const PERSIST_KEY = `tidyswipe:session:v3:${user?.id ?? "anon"}`;
  const LEGACY_KEYS = [`tidyswipe:session:${user?.id ?? "anon"}`, `tidyswipe:session:v2:${user?.id ?? "anon"}`];
  type PersistedState = {
    queue: QueueItem[];
    index: number;
    keptCount: number;
    trashedCount: number;
    trashedBytes: number;
    history: Action[];
    startedAt: number | null;
    endedAt: number | null;
  };
  const normalizePersisted = (parsed: PersistedState | null): PersistedState | null => {
    if (!parsed || !Array.isArray(parsed.queue)) return null;
    const queueSafe = parsed.queue.filter((q) => !!q.path).slice(0, 500);
    const historySafe = Array.isArray(parsed.history)
      ? parsed.history.filter((a) => !!a.item.path).slice(-100)
      : [];
    return {
      queue: queueSafe,
      index: Math.min(Math.max(0, parsed.index || 0), queueSafe.length),
      keptCount: Math.max(0, parsed.keptCount || 0),
      trashedCount: Math.max(0, parsed.trashedCount || 0),
      trashedBytes: Math.max(0, parsed.trashedBytes || 0),
      history: historySafe,
      startedAt: parsed.startedAt || null,
      endedAt: parsed.endedAt || null,
    };
  };
  const loadPersisted = (): PersistedState | null => {
    if (isElectron) return null;
    try {
      const raw = localStorage.getItem(PERSIST_KEY);
      if (!raw) return null;
      return normalizePersisted(JSON.parse(raw) as PersistedState);
    } catch {
      return null;
    }
  };
  const persisted = useMemo(loadPersisted, [PERSIST_KEY, isElectron]);

  const [queue, setQueue] = useState<QueueItem[]>(persisted?.queue ?? []);
  const [index, setIndex] = useState(persisted?.index ?? 0);
  const [keptCount, setKeptCount] = useState(persisted?.keptCount ?? 0);
  const [trashedCount, setTrashedCount] = useState(persisted?.trashedCount ?? 0);
  const [trashedBytes, setTrashedBytes] = useState(persisted?.trashedBytes ?? 0);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<Action[]>(persisted?.history ?? []);
  const [startedAt, setStartedAt] = useState<number | null>(persisted?.startedAt ?? null);
  const [endedAt, setEndedAt] = useState<number | null>(persisted?.endedAt ?? null);
  const [hydrated, setHydrated] = useState(!isElectron);

  useEffect(() => {
    LEGACY_KEYS.forEach((key) => {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    });
    if (!isElectron || !window.electronAPI?.getSessionState) {
      setHydrated(true);
      return;
    }
    let cancelled = false;
    window.electronAPI.getSessionState().then((snapshot: unknown) => {
      if (cancelled) return;
      const safe = normalizePersisted(snapshot as PersistedState | null);
      if (safe) {
        setQueue(safe.queue);
        setIndex(safe.index);
        setKeptCount(safe.keptCount);
        setTrashedCount(safe.trashedCount);
        setTrashedBytes(safe.trashedBytes);
        setHistory(safe.history);
        setStartedAt(safe.startedAt);
        setEndedAt(safe.endedAt);
      }
      setHydrated(true);
    }).catch(() => setHydrated(true));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isElectron, PERSIST_KEY]);

  const folderInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoScanStartedRef = useRef(false);
  if (audioRef.current === null && typeof Audio !== "undefined") {
    audioRef.current = new Audio(wooshSound);
    audioRef.current.volume = 0.6;
  }

  const totalProcessed = keptCount + trashedCount;
  const current = queue[index];
  const finished = queue.length > 0 && index >= queue.length && !sweepRunning;
  const waitingForMore = false;
  const previewUrl = usePreviewUrl(current);

  // Save state with throttling + size cap. In Electron this goes to the main
  // process memory only, so it survives window reloads without creating a
  // startup cache that can crash the renderer on the next launch.
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      try {
        const PERSIST_QUEUE_CAP = 500;
        const PERSIST_HISTORY_CAP = 100;
        const start = Math.max(0, index - 5);
        const slim = queue
          .slice(start, start + PERSIST_QUEUE_CAP)
          .filter((q) => !!q.path);
        const snapshot: PersistedState = {
          queue: slim,
          index: index - start,
          keptCount,
          trashedCount,
          trashedBytes,
          history: history.filter((a) => !!a.item.path).slice(-PERSIST_HISTORY_CAP),
          startedAt,
          endedAt,
        };
        if (isElectron && window.electronAPI?.setSessionState) {
          void window.electronAPI.setSessionState(snapshot);
        } else {
          localStorage.setItem(PERSIST_KEY, JSON.stringify(snapshot));
        }
      } catch {
        // Quota exceeded or serialization error — drop persistence silently.
        try { localStorage.removeItem(PERSIST_KEY); } catch { /* ignore */ }
      }
    }, 1000);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [PERSIST_KEY, hydrated, isElectron, queue, index, keptCount, trashedCount, trashedBytes, history, startedAt, endedAt]);

  useEffect(() => {
    return () => {
      queue.forEach((q) => q.webUrl && URL.revokeObjectURL(q.webUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen to live scan progress from main process
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onScanProgress) return;
    const off = window.electronAPI.onScanProgress((data) => {
      setScanProgress(data.count);
    });
    return off;
  }, [isElectron]);

  // Swipe mode: load ALL files from Downloads + Desktop + Documents via fullSweep
  // BEFORE entering swipe UI. Never use firstFileInDocuments here — it returns
  // only one file and would cause "finished" after 1-2 swipes.
  useEffect(() => {
    if (mode !== "swipe") return;
    if (!hydrated || !isElectron) return;
    if (queue.length > 0 || sweepRunning || autoScanStartedRef.current) return;
    autoScanStartedRef.current = true;
    let cancelled = false;
    (async () => {
      setSweepRunning(true);
      setScanProgress(0);
      setErrorMsg(null);
      const sweep = await window.electronAPI!.fullSweep();
      if (cancelled) return;
      setSweepRunning(false);
      if (!sweep.ok || !sweep.files || sweep.files.length === 0) {
        setErrorMsg("Aucun fichier trouvé dans Téléchargements, Bureau ou Documents.");
        setMode("home");
        autoScanStartedRef.current = false;
        return;
      }
      const items: QueueItem[] = sweep.files.map((f, i) => ({
        id: `sweep-${f.path}-${i}`,
        name: f.name,
        size: f.size,
        path: f.path,
        mtimeMs: f.mtimeMs,
        kind: classify(f.name),
      }));
      setQueue(shuffle(items));
      setIndex(0);
      setKeptCount(0);
      setTrashedCount(0);
      setTrashedBytes(0);
      setHistory([]);
      setStartedAt(Date.now());
      setEndedAt(null);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, hydrated, isElectron]);

  // Detect end → record duration
  useEffect(() => {
    if (finished && startedAt && !endedAt) setEndedAt(Date.now());
  }, [finished, startedAt, endedAt]);

  const resetCounters = () => {
    setIndex(0);
    setKeptCount(0);
    setTrashedCount(0);
    setTrashedBytes(0);
    setHistory([]);
    setErrorMsg(null);
    setStartedAt(Date.now());
    setEndedAt(null);
  };

  const startScan = useCallback(
    async (folderPath: string) => {
      if (!window.electronAPI) return;
      setBusy(true);
      setErrorMsg(null);
      try {
        const listed = await window.electronAPI.listFolder(folderPath);
        if (!listed.ok || !listed.files) {
          setErrorMsg(listed.error || "Impossible de lire le dossier.");
          return;
        }
        if (listed.files.length === 0) {
          setErrorMsg("Aucun fichier compatible (.png, .jpg, .webp, .pdf, .heic) dans ce dossier.");
          return;
        }
        const items: QueueItem[] = listed.files.map((f: ElectronFile, i) => ({
          id: `${f.path}-${i}`,
          name: f.name,
          size: f.size,
          path: f.path,
          mtimeMs: f.mtimeMs,
          kind: classify(f.name),
        }));
        queue.forEach((q) => q.webUrl && URL.revokeObjectURL(q.webUrl));
        setQueue(shuffle(items));
        resetCounters();
      } finally {
        setBusy(false);
      }
    },
    [queue],
  );

  const handlePreset = async (preset: FolderPreset | "custom") => {
    setShowFolderModal(false);
    if (!window.electronAPI) return;
    if (preset === "custom") {
      const picked = await window.electronAPI.pickFolder();
      if (!picked.ok || !picked.path) return;
      await startScan(picked.path);
      return;
    }
    const res = await window.electronAPI.pickPreset(preset);
    if (!res.ok || !res.path) {
      setErrorMsg(res.error || "Dossier introuvable.");
      return;
    }
    await startScan(res.path);
  };

  const loadFromWebFolder = (files: File[]) => {
    const filtered = files.filter((f) => ACCEPTED.test(f.name));
    if (filtered.length === 0) {
      setErrorMsg("Aucun fichier compatible trouvé.");
      return;
    }
    queue.forEach((q) => q.webUrl && URL.revokeObjectURL(q.webUrl));
    const items: QueueItem[] = filtered.map((f, i) => ({
      id: `${f.name}-${i}-${f.size}`,
      name: f.name,
      size: f.size,
      webUrl: URL.createObjectURL(f),
      kind: classify(f.name),
    }));
    setQueue(shuffle(items));
    resetCounters();
  };

  const handleStartCleanup = () => {
    if (isElectron) {
      void handleSmartCleanup();
    } else {
      folderInputRef.current?.click();
    }
  };

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    loadFromWebFolder(Array.from(list));
    e.target.value = "";
  };

  const handleKeep = () => {
    if (!current || busy) return;
    setKeptCount((c) => c + 1);
    setHistory((h) => [...h, { type: "keep", item: current }]);
    setIndex((i) => i + 1);
  };

  const handleTrash = async () => {
    if (!current || busy) return;
    // Politique safe-by-default : si le verdict bloque la suppression,
    // on n'envoie même pas la requête à Electron (qui bloquerait aussi).
    const verdict = evaluateSafety(current);
    if (!verdict.deletionAllowed) {
      setErrorMsg(
        `Suppression bloquée par la politique de sécurité — ${verdict.reasons[0] || "fichier protégé"}.`,
      );
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      // Play woosh sound
      if (audioRef.current) {
        try {
          audioRef.current.currentTime = 0;
          void audioRef.current.play();
        } catch { /* ignore autoplay */ }
      }
      if (current.path && window.electronAPI) {
        const res = await window.electronAPI.trashFile(current.path);
        if (!res.ok) {
          setErrorMsg(`Échec corbeille : ${res.error || "inconnu"}. Passage au suivant.`);
        }
      }
      setTrashedCount((c) => c + 1);
      setTrashedBytes((b) => b + current.size);
      setHistory((h) => [...h, { type: "trash", item: current }]);
      setIndex((i) => i + 1);
    } finally {
      setBusy(false);
    }
  };

  // INDEPENDENT FEATURE: full-disk smart analysis. This must NEVER touch the
  // swipe queue (the user's manual sort flow). It opens a popup where the user
  // can review candidates, deselect what they want to keep, and confirm.
  const handleSmartCleanup = async () => {
    if (!isElectron || scanningCleanup) return;
    setScanningCleanup(true);
    setErrorMsg(null);
    try {
      const res = await window.electronAPI!.smartCleanupScan();
      if (!res.ok || !res.candidates) {
        setErrorMsg(res.error || "Scan impossible.");
        return;
      }
      if (res.candidates.length === 0) {
        setErrorMsg("Aucun doublon ni gros fichier inutilisé détecté. Votre Mac est déjà propre !");
        return;
      }
      // Pre-select everything by default.
      setCleanupCandidates(res.candidates);
      setCleanupSelected(new Set(res.candidates.map((c) => c.path)));
    } finally {
      setScanningCleanup(false);
    }
  };

  const handleConfirmSmartCleanup = async () => {
    if (!cleanupCandidates || cleanupDeleting) return;
    const toDelete = cleanupCandidates.filter((c) => cleanupSelected.has(c.path));
    if (toDelete.length === 0) {
      setCleanupCandidates(null);
      return;
    }
    setCleanupDeleting(true);
    let okCount = 0;
    let bytesFreed = 0;
    const failed: string[] = [];
    try {
      for (const c of toDelete) {
        try {
          const r = await window.electronAPI!.trashFile(c.path);
          if (r.ok) {
            okCount++;
            bytesFreed += c.size;
          } else {
            failed.push(c.name);
          }
        } catch {
          failed.push(c.name);
        }
      }
      // Reflect freed space in the top widget without polluting the swipe
      // counters: smart cleanup is its OWN feature.
      setTrashedBytes((b) => b + bytesFreed);
      setTrashedCount((n) => n + okCount);
      if (failed.length > 0) {
        setErrorMsg(
          `${okCount} fichier${okCount > 1 ? "s" : ""} supprimé${okCount > 1 ? "s" : ""}. ${failed.length} échec(s).`,
        );
      } else {
        setErrorMsg(
          `Nettoyage terminé : ${okCount} fichier${okCount > 1 ? "s" : ""} envoyé${okCount > 1 ? "s" : ""} à la corbeille (${formatBytes(bytesFreed)} libérés).`,
        );
      }
    } finally {
      setCleanupDeleting(false);
      setCleanupCandidates(null);
      setCleanupSelected(new Set());
    }
  };

  const handleUndo = () => {
    if (busy || history.length === 0) return;
    const last = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setIndex((i) => Math.max(0, i - 1));
    if (last.type === "keep") {
      setKeptCount((c) => Math.max(0, c - 1));
    } else {
      setTrashedCount((c) => Math.max(0, c - 1));
      setTrashedBytes((b) => Math.max(0, b - last.item.size));
      // Note: file already in Trash. Action remains undone in the UI; user can
      // restore it manually from the Finder (we tell them in a toast).
      setErrorMsg("Annulé. Le fichier est déjà dans la corbeille — restaurez-le depuis le Finder si besoin.");
    }
    if (endedAt) setEndedAt(null);
  };

  const handleReset = () => {
    queue.forEach((q) => q.webUrl && URL.revokeObjectURL(q.webUrl));
    setQueue([]);
    resetCounters();
    setEndedAt(null);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showFolderModal || showAccount) return;
      if (e.key === " " && current) {
        e.preventDefault();
        setShowFullPreview((v) => !v);
        return;
      }
      if (showFullPreview) {
        if (e.key === "Escape") setShowFullPreview(false);
        return;
      }
      if (!current || busy) return;
      if (e.key === "ArrowRight") handleKeep();
      else if (e.key === "ArrowLeft") void handleTrash();
      else if ((e.metaKey || e.ctrlKey) && e.key === "z") handleUndo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, busy, history, showFolderModal, showAccount, showFullPreview]);

  const headerMessage = useMemo(() => {
    if (scanningCleanup) return `Analyse intelligente… ${scanProgress > 0 ? scanProgress + " fichiers" : ""}`;
    if (sweepRunning) return `Scan en cours… ${scanProgress} fichier${scanProgress > 1 ? "s" : ""} analysé${scanProgress > 1 ? "s" : ""}`;
    if (queue.length === 0) return "Recherche automatique dans Téléchargements, Bureau et Documents";
    if (finished) return `Cleanup terminé — ${totalProcessed} fichier${totalProcessed > 1 ? "s" : ""} traité${totalProcessed > 1 ? "s" : ""}`;
    return `${index + 1} / ${queue.length} — Décidez rapidement, on passe au suivant`;
  }, [queue.length, finished, totalProcessed, index, scanningCleanup, sweepRunning, scanProgress]);

  // Cleanup widget reflects ONLY trashed files (not "kept"). Keep is a
  // separate manual sort that must never feed into cleanup metrics.
  const cleanupPct = queue.length > 0 ? Math.min(100, (trashedCount / queue.length) * 100) : 0;

  // ── Mode handlers (home → swipe / auto) ─────────────────────────────────
  const enterSwipeMode = useCallback(() => {
    if (!isElectron) {
      // Web fallback: open the folder picker as before.
      folderInputRef.current?.click();
      return;
    }
    setErrorMsg(null);
    // Reset everything so the swipe-mode effect fires a fresh fullSweep.
    queue.forEach((q) => q.webUrl && URL.revokeObjectURL(q.webUrl));
    setQueue([]);
    setIndex(0);
    setKeptCount(0);
    setTrashedCount(0);
    setTrashedBytes(0);
    setHistory([]);
    setStartedAt(null);
    setEndedAt(null);
    autoScanStartedRef.current = false;
    setMode("swipe");
  }, [isElectron, queue]);

  const enterAutoMode = useCallback(async () => {
    if (!isElectron) {
      setErrorMsg("L'analyse automatique nécessite l'app desktop.");
      return;
    }
    setErrorMsg(null);
    await handleSmartCleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isElectron]);

  const goHome = useCallback(() => {
    queue.forEach((q) => q.webUrl && URL.revokeObjectURL(q.webUrl));
    setQueue([]);
    setIndex(0);
    setKeptCount(0);
    setTrashedCount(0);
    setTrashedBytes(0);
    setHistory([]);
    setStartedAt(null);
    setEndedAt(null);
    setErrorMsg(null);
    autoScanStartedRef.current = false;
    setMode("home");
  }, [queue]);

  // Old UX: single view (swipe + smart cleanup widget on the right side).
  // The HomeScreen branch was removed to restore the original interface.

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-8"
      style={{ backgroundColor: "var(--bg-app)" }}
    >
      {!isElectron && (
        <input
          ref={folderInputRef}
          type="file"
          multiple
          // @ts-expect-error - non-standard
          webkitdirectory=""
          directory=""
          onChange={handleFolderChange}
          className="hidden"
          accept=".png,.jpg,.jpeg,.webp,.pdf,image/*,application/pdf"
        />
      )}

      <div
        className="w-full max-w-[1180px]"
        style={{ backgroundColor: "var(--bg-app)" }}
      >
        {/* Native macOS title bar drag region (boutons rouge/jaune/vert fournis par macOS) */}
        <div
          className="h-[28px] w-full select-none"
          style={{
            // @ts-expect-error - drag region
            WebkitAppRegion: "drag",
            backgroundColor: "var(--bg-app)",
          }}
        />

        <div className="px-10 pt-6 pb-2" style={{ backgroundColor: "var(--bg-app)" }}>
          {/* Header */}
          <div
            className="grid grid-cols-[1fr_auto_1fr] items-center mb-5 pb-3"
            style={{ borderBottom: "1px solid var(--border-subtle)" }}
          >
            <div className="flex items-center gap-3">
              {queue.length > 0 && !finished && (
                <span
                  className="text-[11px] font-semibold tracking-[0.04em] px-2.5 py-1 rounded-full"
                  style={{
                    color: "var(--accent-blue)",
                    backgroundColor: "rgba(10,132,255,0.10)",
                    border: "1px solid rgba(10,132,255,0.25)",
                  }}
                >
                  Fichier {Math.min(index + 1, queue.length)} sur {queue.length}
                </span>
              )}
            </div>
            <p className="text-[15px] font-medium text-center tracking-[-0.01em]" style={{ color: "var(--accent-blue)" }}>
              {headerMessage}
            </p>
            <div className="flex items-center justify-end gap-3">
              {history.length > 0 && !finished && (
                <button
                  onClick={handleUndo}
                  disabled={busy}
                  className="flex items-center gap-1 text-[11px] font-semibold tracking-[0.04em] px-2.5 py-1 rounded-full transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ color: "#e8e8e8", border: "1px solid #1f2024" }}
                  title="Annuler la dernière action (⌘Z)"
                >
                  <Undo2 size={11} strokeWidth={2.5} />
                  ANNULER
                </button>
              )}
              {queue.length > 0 && (
                <button
                  className="p-1 rounded-md transition-colors hover:bg-white/5"
                  style={{ color: "#e8e8e8" }}
                  aria-label="Recommencer"
                  onClick={handleReset}
                  title="Recommencer"
                >
                  <RotateCcw size={16} strokeWidth={1.75} />
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => setShowNotifs(true)}
                  className="flex items-center gap-1 text-[10px] font-semibold tracking-[0.08em] px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: "rgba(10,132,255,0.12)",
                    color: "var(--accent-blue)",
                    border: "1px solid rgba(10,132,255,0.25)",
                  }}
                  title="Admin — envoyer une notification"
                >
                  <Shield size={10} strokeWidth={2.5} />
                  ADMIN
                </button>
              )}
              <NotificationBell onOpen={() => setShowNotifs(true)} />
              <button
                onClick={() => setShowAccount(true)}
                className="flex items-center gap-2 px-2 py-1 rounded-md transition-colors hover:bg-white/5"
                title="Compte & abonnement"
              >
                <span className="text-[13px] font-medium max-w-[140px] truncate" style={{ color: "#e8e8e8" }}>
                  {displayName}
                </span>
                <div
                  className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-[12px] font-semibold text-white"
                  style={{ backgroundColor: "var(--accent-blue)" }}
                >
                  {initial}
                </div>
              </button>
            </div>
          </div>

          {/* Global progress bar (animated, vivante) */}
          {(sweepRunning || scanningCleanup || (queue.length > 0 && !finished)) && (
            <div className="mb-4">
              <div
                className="h-[6px] w-full rounded-full overflow-hidden relative"
                style={{ backgroundColor: "#15161a", border: "1px solid #1c1d20" }}
              >
                {sweepRunning || scanningCleanup ? (
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: "40%",
                      background:
                        "linear-gradient(90deg, transparent 0%, var(--accent-blue) 50%, transparent 100%)",
                      animation: "tidyswipe-sweep 1.4s ease-in-out infinite",
                    }}
                  />
                ) : (
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${Math.min(100, (totalProcessed / Math.max(1, queue.length)) * 100)}%`,
                      background:
                        "linear-gradient(90deg, var(--accent-blue) 0%, #4aa8ff 100%)",
                    }}
                  />
                )}
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[11px] tracking-[0.02em]" style={{ color: "#9a9a9a" }}>
                  {sweepRunning
                    ? `Scan en direct · ${scanProgress} fichier${scanProgress > 1 ? "s" : ""} découvert${scanProgress > 1 ? "s" : ""}`
                    : scanningCleanup
                      ? `Analyse intelligente en cours · doublons + volumineux`
                      : `Progression du tri : ${totalProcessed} / ${queue.length}`}
                </span>
                {!sweepRunning && !scanningCleanup && queue.length > 0 && (
                  <span className="text-[11px] font-semibold" style={{ color: "var(--accent-blue)" }}>
                    {Math.round((totalProcessed / queue.length) * 100)} %
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Main grid : preview centrale large + panneau aide à la décision */}
          <div className="grid grid-cols-[1fr_340px] gap-6 mb-4 items-start">
            {/* ── PREVIEW CENTRALE ─────────────────────────────────── */}
            <div className="flex flex-col">
              <div
                className="rounded-[16px] overflow-hidden relative cursor-zoom-in"
                style={{
                  backgroundColor: "var(--bg-card)",
                  border: "1px solid #1c1d20",
                  height: "min(58vh, 520px)",
                  boxShadow: "0 20px 60px -30px rgba(0,0,0,0.6)",
                }}
                onClick={() => {
                  if (!current) return;
                  // If we have an internal preview, show the in-app full preview.
                  if (previewUrl && (current.kind === "image" || current.kind === "pdf")) {
                    setShowFullPreview(true);
                    return;
                  }
                  // Otherwise, open native Quick Look (macOS) for instant verification.
                  if (current.path && window.electronAPI?.quickLook) {
                    void window.electronAPI.quickLook(current.path);
                  }
                }}
              >
                <div className="w-full h-full flex items-center justify-center relative">
                  {finished ? (
                    <FinishedCard
                      processed={totalProcessed}
                      trashed={trashedCount}
                      kept={keptCount}
                      bytes={trashedBytes}
                      durationMs={
                        startedAt && endedAt ? endedAt - startedAt : startedAt ? Date.now() - startedAt : 0
                      }
                    />
                  ) : sweepRunning && !current ? (
                    <LiveScanCard count={scanProgress} />
                  ) : current ? (
                    current.kind === "image" && previewUrl ? (
                      <img
                        src={previewUrl}
                        alt={current.name}
                        className="max-w-full max-h-full object-contain"
                        style={{ backgroundColor: "transparent" }}
                        onError={() => setIndex((i) => i + 1)}
                      />
                    ) : current.kind === "pdf" && previewUrl ? (
                      <object data={previewUrl + "#toolbar=0&navpanes=0"} type="application/pdf" className="w-full h-full">
                        <FileTypeCard name={current.name} path={current.path} />
                      </object>
                    ) : current.kind === "other" || current.size > MAX_PREVIEW_BYTES ? (
                      <FileTypeCard name={current.name} path={current.path} />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-center px-6" style={{ color: "#9a9a9a" }}>
                        <FileText size={42} strokeWidth={1.5} />
                        <p className="mt-2 text-[12px]" style={{ color: "#6b6e74" }}>
                          Chargement…
                        </p>
                      </div>
                    )
                  ) : (
                    <div
                      className="flex flex-col items-center justify-center text-center px-6"
                      style={{ color: "#9a9a9a" }}
                    >
                      <Folder size={56} strokeWidth={1.25} style={{ color: "#26272b" }} />
                      <p className="mt-3 text-[13px]" style={{ color: "#9a9a9a" }}>
                        Aucun fichier chargé
                      </p>
                      <p className="mt-1 text-[11px]" style={{ color: "#6b6e74" }}>
                        Choisissez un dossier pour commencer à trier
                      </p>
                    </div>
                  )}

                  {current && !finished && previewUrl && (
                    <div
                      className="absolute bottom-3 right-3 rounded-full p-2 backdrop-blur-md"
                      style={{ backgroundColor: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      <Eye size={13} className="text-white" />
                    </div>
                  )}
                </div>
              </div>

              {/* Nom + taille sous la preview */}
              <div className="mt-5 px-1">
                <div
                  className="text-[14px] leading-[1.4] tracking-[-0.005em] break-all"
                  style={{
                    color: "#ededed",
                    fontFamily: "'SF Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
                  }}
                >
                  {current ? current.name : finished ? "—" : sweepRunning ? "Recherche en cours…" : "Aucun fichier"}
                </div>
                {current && !finished && (
                  <div className="mt-1 flex items-center gap-2 text-[11px]" style={{ color: "#9a9a9a" }}>
                    <span>{formatBytes(current.size)}</span>
                    <span style={{ color: "#3a3b40" }}>·</span>
                    <span className="uppercase tracking-wider">
                      {(current.name.split(".").pop() || "fichier").slice(0, 6)}
                    </span>
                    {current.path && (
                      <>
                        <span style={{ color: "#3a3b40" }}>·</span>
                        <span className="truncate flex-1 min-w-0" title={current.path}>
                          {shortenPath(current.path)}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {errorMsg && (
                <div
                  className="mt-4 flex items-center gap-2 text-[12px] px-3 py-2 rounded-md text-left"
                  style={{ backgroundColor: "#1a1010", color: "#ff8a82", border: "1px solid #3a1a1a" }}
                >
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>

            {/* ── PANNEAU LATÉRAL : aide à la décision ─────────────── */}
          <div className="flex flex-col gap-[14px]">
              {/* Partage social */}
              <ShareWidget />

              {/* Aide à la décision */}
              <DecisionPanel item={current} finished={finished} />

              {/* Métadonnées détaillées */}
              {current && !finished && (
                <MetadataPanel item={current} onCopyPath={() => {
                  if (current.path) {
                    try { navigator.clipboard.writeText(current.path); } catch { /* ignore */ }
                  }
                }} />
              )}

              {/* Compteur libéré + bouton analyse */}
              <div className="rounded-[12px] p-5" style={{ backgroundColor: "var(--bg-card)", border: "1px solid #1c1d20" }}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-[34px] h-[34px] rounded-[8px] flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(10,132,255,0.10)" }}>
                    <Database size={16} strokeWidth={1.75} style={{ color: "var(--accent-blue)" }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "#6b6e74" }}>Libéré</p>
                    <p className="text-[16px] font-semibold tracking-[-0.01em]" style={{ color: "#ededed" }}>
                      {formatBytes(trashedBytes)}
                    </p>
                  </div>
                </div>
                <div className="h-[3px] rounded-full overflow-hidden mb-4" style={{ backgroundColor: "#1a1b1e" }}>
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${cleanupPct}%`, backgroundColor: "var(--accent-blue)" }}
                  />
                </div>
                <button
                  onClick={handleStartCleanup}
                  disabled={busy || scanningCleanup || sweepRunning}
                  className="w-full rounded-[8px] py-[10px] text-[11.5px] font-semibold tracking-[0.05em] text-white flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: "var(--accent-blue)" }}
                  title="Analyse intelligente : doublons + gros fichiers inutilisés (>50 Mo, >30j)"
                >
                  <Sparkles size={12} />
                  {scanningCleanup
                    ? `ANALYSE… ${scanProgress > 0 ? scanProgress : ""}`
                    : sweepRunning
                      ? `SCAN… ${scanProgress}`
                      : "ANALYSE INTELLIGENTE"}
                  <ArrowUpRight size={12} strokeWidth={2.75} />
                </button>
              </div>
            </div>
          </div>

          {/* Bottom actions — barre fixe, toujours visible (no-scroll CTAs) */}
          {(() => {
            const v = current ? evaluateSafety(current) : null;
            const trashDisabled = !current || busy || (v ? !v.deletionAllowed : false);
            const trashTitle = v && !v.deletionAllowed
              ? `Suppression désactivée — ${v.reasons[0] || "fichier protégé"}`
              : "← Mettre à la corbeille";
            return (
              <div
                className="sticky bottom-0 left-0 right-0 z-30 flex flex-col items-center gap-2 pt-4 pb-3"
                style={{
                  backgroundColor: "var(--bg-app)",
                  borderTop: "1px solid var(--border-subtle)",
                  marginTop: 16,
                }}
              >
                <div className="flex items-center justify-center gap-6">
                  <button
                    onClick={handleTrash}
                    disabled={trashDisabled}
                    className="group flex items-center gap-3 px-7 h-[56px] rounded-[14px] text-[13px] font-semibold tracking-[0.06em] text-white transition-all hover:bg-[#141517] hover:border-[#2a2b2f] disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ backgroundColor: "#0c0d0f", border: "1px solid #1f2024", minWidth: "240px" }}
                    title={trashTitle}
                  >
                    <span
                      className="w-[28px] h-[28px] rounded-full flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
                      style={{ backgroundColor: "var(--accent-red)" }}
                    >
                      <X size={15} strokeWidth={3} className="text-white" />
                    </span>
                    <span className="flex-1 text-center">CORBEILLE</span>
                    <span className="text-[10px] font-mono opacity-50">←</span>
                  </button>

                  <button
                    onClick={handleKeep}
                    disabled={!current || busy}
                    className="group flex items-center gap-3 px-7 h-[56px] rounded-[14px] text-[13px] font-semibold tracking-[0.06em] text-white transition-all hover:bg-[#141517] hover:border-[#2a2b2f] disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ backgroundColor: "#0c0d0f", border: "1px solid #1f2024", minWidth: "240px" }}
                    title="→ Garder"
                  >
                    <span className="text-[10px] font-mono opacity-50">→</span>
                    <span className="flex-1 text-center">GARDER</span>
                    <span
                      className="w-[28px] h-[28px] rounded-full flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
                      style={{ backgroundColor: "var(--accent-blue)" }}
                    >
                      <Check size={15} strokeWidth={3} className="text-white" />
                    </span>
                  </button>
                </div>
                <p className="text-center text-[11px] tracking-[-0.005em]" style={{ color: "#6b6e74" }}>
                  <kbd className="px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: "#15161a", border: "1px solid #1f2024" }}>Espace</kbd>
                  {" "}aperçu · {" "}
                  <kbd className="px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: "#15161a", border: "1px solid #1f2024" }}>⌘Z</kbd>
                  {" "}annuler · Jamais supprimé définitivement.
                </p>
              </div>
            );
          })()}
        </div>
      </div>

      {showAccount && <AccountScreen onClose={() => setShowAccount(false)} subscription={subscription} />}
      {showNotifs && <NotificationsScreen onClose={() => setShowNotifs(false)} />}

      {showFolderModal && (
        <FolderPickerModal
          onPick={handlePreset}
          onClose={() => setShowFolderModal(false)}
        />
      )}

      {showFullPreview && current && previewUrl && (
        <FullPreviewOverlay
          item={current}
          url={previewUrl}
          onClose={() => setShowFullPreview(false)}
        />
      )}

      {cleanupCandidates && (
        <SmartCleanupModal
          candidates={cleanupCandidates}
          selected={cleanupSelected}
          onToggle={(p) => {
            setCleanupSelected((s) => {
              const n = new Set(s);
              if (n.has(p)) n.delete(p); else n.add(p);
              return n;
            });
          }}
          onSelectAll={() => setCleanupSelected(new Set(cleanupCandidates.map((c) => c.path)))}
          onSelectNone={() => setCleanupSelected(new Set())}
          onConfirm={handleConfirmSmartCleanup}
          onClose={() => {
            if (cleanupDeleting) return;
            setCleanupCandidates(null);
            setCleanupSelected(new Set());
          }}
          deleting={cleanupDeleting}
        />
      )}
    </div>
  );
}

function FileTypeCard({ name, path }: { name: string; path?: string }) {
  const ext = (name.split(".").pop() || "FILE").toUpperCase().slice(0, 5);
  const [iconUrl, setIconUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIconUrl(null);
    if (path && window.electronAPI?.getFileIcon) {
      window.electronAPI.getFileIcon(path).then((res) => {
        if (cancelled) return;
        if (res.ok && res.dataUrl) setIconUrl(res.dataUrl);
      });
    }
    return () => { cancelled = true; };
  }, [path]);

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center px-6"
      style={{ backgroundColor: "transparent" }}
    >
      {iconUrl ? (
        <img
          src={iconUrl}
          alt={ext}
          style={{ width: 128, height: 128, imageRendering: "auto" }}
          draggable={false}
        />
      ) : (
        <div className="relative" style={{ width: 96, height: 120 }}>
          <svg viewBox="0 0 96 120" width="96" height="120">
            <defs>
              <linearGradient id="fileGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3da4ff" />
                <stop offset="100%" stopColor="#0A84FF" />
              </linearGradient>
            </defs>
            <path
              d="M12 4 H64 L92 32 V112 a4 4 0 0 1 -4 4 H12 a4 4 0 0 1 -4 -4 V8 a4 4 0 0 1 4 -4 Z"
              fill="url(#fileGrad)"
            />
            <path d="M64 4 V28 a4 4 0 0 0 4 4 H92" fill="rgba(255,255,255,0.25)" />
          </svg>
          <div
            className="absolute inset-x-0 bottom-[18px] text-center text-white font-bold tracking-wider"
            style={{ fontSize: 13 }}
          >
            {ext}
          </div>
        </div>
      )}
      <p
        className="mt-4 text-[11px] break-all max-w-[210px] text-center"
        style={{ color: "#9a9a9a", fontFamily: "'SF Mono', ui-monospace, Menlo, monospace" }}
      >
        {name}
      </p>
    </div>
  );
}

function FinishedCard({
  processed,
  trashed,
  kept,
  bytes,
  durationMs,
}: {
  processed: number;
  trashed: number;
  kept: number;
  bytes: number;
  durationMs: number;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6" style={{ color: "#e8e8e8" }}>
      <Check size={42} strokeWidth={2} style={{ color: "var(--accent-blue)" }} />
      <p className="mt-3 text-[15px] font-semibold">Tri terminé</p>
      <p className="mt-2 text-[12.5px] leading-[1.55]" style={{ color: "#cfcfcf" }}>
        Tu as trié <strong>{processed}</strong> fichier{processed > 1 ? "s" : ""}.
        <br />
        <span style={{ color: "#ff8a82" }}>{trashed} supprimé{trashed > 1 ? "s" : ""}</span>
        {" · "}
        <span style={{ color: "#6ad48e" }}>{kept} gardé{kept > 1 ? "s" : ""}</span>
      </p>
      <p className="mt-2 text-[11px]" style={{ color: "#9a9a9a" }}>
        {formatBytes(bytes)} libérés en {formatDuration(durationMs)}.
      </p>
    </div>
  );
}

function FolderPickerModal({
  onPick,
  onClose,
}: {
  onPick: (preset: FolderPreset | "custom") => void;
  onClose: () => void;
}) {
  const presets: { id: FolderPreset; label: string; sub: string; Icon: typeof Folder }[] = [
    { id: "downloads", label: "Téléchargements", sub: "Souvent rempli de doublons", Icon: DownloadIcon },
    { id: "desktop", label: "Bureau", sub: "Rangez votre bureau d'un swipe", Icon: FolderOpen },
    { id: "documents", label: "Documents", sub: "PDF, scans, factures…", Icon: FileText },
    { id: "pictures", label: "Images", sub: "Photos, captures d'écran", Icon: ImageIcon },
  ];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[440px] rounded-[14px] overflow-hidden"
        style={{
          backgroundColor: "var(--bg-app)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 30px 80px -20px rgba(0,0,0,0.7)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="relative flex items-center justify-center px-5 h-[44px]"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <span className="text-[13px] font-semibold" style={{ color: "#ededed" }}>
            Choisir un dossier à analyser
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
        <div className="px-5 py-5 flex flex-col gap-2">
          {presets.map(({ id, label, sub, Icon }) => (
            <button
              key={id}
              onClick={() => onPick(id)}
              className="flex items-center gap-3 px-3 py-3 rounded-[10px] text-left hover:bg-white/5 transition-colors"
              style={{ border: "1px solid #1c1d20" }}
            >
              <div
                className="w-[34px] h-[34px] rounded-[8px] flex items-center justify-center shrink-0"
                style={{ backgroundColor: "rgba(10,132,255,0.12)" }}
              >
                <Icon size={16} style={{ color: "var(--accent-blue)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold" style={{ color: "#ededed" }}>
                  {label}
                </div>
                <div className="text-[11px]" style={{ color: "#9a9a9a" }}>
                  {sub}
                </div>
              </div>
            </button>
          ))}
          <div className="my-1 h-px" style={{ backgroundColor: "#1c1d20" }} />
          <button
            onClick={() => onPick("custom")}
            className="flex items-center gap-3 px-3 py-3 rounded-[10px] text-left hover:bg-white/5 transition-colors"
            style={{ border: "1px dashed #2a2b2f" }}
          >
            <div className="w-[34px] h-[34px] rounded-[8px] flex items-center justify-center shrink-0" style={{ backgroundColor: "#161719" }}>
              <Folder size={16} style={{ color: "#9a9a9a" }} />
            </div>
            <div className="flex-1">
              <div className="text-[13px] font-semibold" style={{ color: "#ededed" }}>
                Choisir un autre dossier…
              </div>
              <div className="text-[11px]" style={{ color: "#9a9a9a" }}>
                Ouvre le sélecteur natif macOS
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

function FullPreviewOverlay({
  item,
  url,
  onClose,
}: {
  item: QueueItem;
  url: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-10 cursor-zoom-out"
      style={{ backgroundColor: "rgba(0,0,0,0.92)" }}
      onClick={onClose}
    >
      {item.kind === "image" ? (
        <img src={url} alt={item.name} className="max-w-full max-h-full object-contain" />
      ) : item.kind === "pdf" ? (
        <object
          data={url}
          type="application/pdf"
          className="w-full h-full max-w-[1200px]"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-white">Aperçu PDF indisponible.</p>
        </object>
      ) : (
        <div className="text-white">Pas d'aperçu disponible.</div>
      )}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 p-2 rounded-full"
        style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "white" }}
        aria-label="Fermer (Esc)"
      >
        <X size={18} />
      </button>
    </div>
  );
}

function SmartCleanupModal({
  candidates,
  selected,
  onToggle,
  onSelectAll,
  onSelectNone,
  onConfirm,
  onClose,
  deleting,
}: {
  candidates: CleanupCandidate[];
  selected: Set<string>;
  onToggle: (path: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onConfirm: () => void;
  onClose: () => void;
  deleting: boolean;
}) {
  const totalBytes = candidates
    .filter((c) => selected.has(c.path))
    .reduce((sum, c) => sum + c.size, 0);
  const dupCount = candidates.filter((c) => c.reason === "duplicate").length;
  const largeCount = candidates.filter((c) => c.reason === "large_unused").length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
      onClick={deleting ? undefined : onClose}
    >
      <div
        className="w-full max-w-[680px] rounded-[14px] overflow-hidden flex flex-col"
        style={{
          backgroundColor: "var(--bg-app)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 30px 80px -20px rgba(0,0,0,0.7)",
          maxHeight: "82vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div>
            <p className="text-[14px] font-semibold" style={{ color: "#ededed" }}>
              Analyse intelligente — {candidates.length} fichier{candidates.length > 1 ? "s" : ""} détecté{candidates.length > 1 ? "s" : ""}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: "#9a9a9a" }}>
              {dupCount} doublon{dupCount > 1 ? "s" : ""} · {largeCount} fichier{largeCount > 1 ? "s" : ""} volumineux non utilisé{largeCount > 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={deleting}
            className="p-1.5 rounded-md hover:bg-white/5 disabled:opacity-40"
            style={{ color: "#9a9a9a" }}
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Toolbar */}
        <div
          className="px-5 py-2.5 flex items-center gap-3 text-[11px]"
          style={{ borderBottom: "1px solid var(--border-subtle)", color: "#9a9a9a" }}
        >
          <button
            onClick={onSelectAll}
            disabled={deleting}
            className="px-2 py-1 rounded-md hover:bg-white/5 disabled:opacity-40"
            style={{ color: "var(--accent-blue)" }}
          >
            Tout sélectionner
          </button>
          <button
            onClick={onSelectNone}
            disabled={deleting}
            className="px-2 py-1 rounded-md hover:bg-white/5 disabled:opacity-40"
          >
            Tout désélectionner
          </button>
          <span className="ml-auto">
            {selected.size} sélectionné{selected.size > 1 ? "s" : ""} · {formatBytes(totalBytes)}
          </span>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {candidates.map((c) => {
            const checked = selected.has(c.path);
            return (
              <label
                key={c.path}
                className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-white/[0.02]"
                style={{ borderBottom: "1px solid #141517" }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(c.path)}
                  disabled={deleting}
                  className="w-4 h-4 accent-[var(--accent-blue)]"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] truncate" style={{ color: "#ededed" }}>
                    {c.name}
                  </p>
                  <p className="text-[10px] truncate" style={{ color: "#6b6e74" }}>
                    {c.path}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span
                    className="inline-block text-[10px] px-1.5 py-0.5 rounded"
                    style={{
                      color: c.reason === "duplicate" ? "#ffb84d" : "#6ad48e",
                      backgroundColor:
                        c.reason === "duplicate" ? "rgba(255,184,77,0.1)" : "rgba(106,212,142,0.1)",
                    }}
                  >
                    {c.reason === "duplicate" ? "Doublon" : "Volumineux & inutilisé"}
                  </span>
                  <p className="text-[11px] mt-1" style={{ color: "#9a9a9a" }}>
                    {formatBytes(c.size)}
                  </p>
                </div>
              </label>
            );
          })}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-4 flex items-center justify-end gap-3"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          <button
            onClick={onClose}
            disabled={deleting}
            className="px-4 h-9 rounded-[8px] text-[12px] font-semibold disabled:opacity-40"
            style={{ backgroundColor: "#0c0d0f", border: "1px solid #1f2024", color: "#ededed" }}
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting || selected.size === 0}
            className="px-4 h-9 rounded-[8px] text-[12px] font-semibold text-white flex items-center gap-2 disabled:opacity-40"
            style={{ backgroundColor: "var(--accent-blue)" }}
          >
            {deleting ? (
              "Suppression…"
            ) : (
              <>
                Envoyer {selected.size} fichier{selected.size > 1 ? "s" : ""} à la corbeille
                <ArrowUpRight size={13} strokeWidth={2.75} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// HELPERS & SUB-COMPONENTS for the premium decision UX
// ─────────────────────────────────────────────────────────────────

function shortenPath(p: string): string {
  if (!p) return "";
  // Replace user home with ~ and keep last 2-3 segments for compactness.
  const home = p.match(/^\/Users\/[^/]+/)?.[0];
  let s = home ? p.replace(home, "~") : p;
  const parts = s.split("/");
  if (parts.length > 4) {
    s = `${parts.slice(0, 2).join("/")}/…/${parts.slice(-2).join("/")}`;
  }
  return s;
}

function locationLabel(p?: string): string {
  if (!p) return "—";
  if (/\/Downloads\//i.test(p)) return "Téléchargements";
  if (/\/Desktop\//i.test(p)) return "Bureau";
  if (/\/Documents\//i.test(p)) return "Documents";
  if (/\/Pictures\//i.test(p)) return "Images";
  return "Dossier personnel";
}

function LiveScanCard({ count }: { count: number }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-8" style={{ color: "#ededed" }}>
      <div className="relative mb-4">
        <div
          className="w-[72px] h-[72px] rounded-full flex items-center justify-center"
          style={{
            background: "radial-gradient(circle, rgba(10,132,255,0.18) 0%, transparent 70%)",
          }}
        >
          <Folder size={32} strokeWidth={1.5} style={{ color: "var(--accent-blue)" }} />
        </div>
        <div
          className="absolute inset-0 rounded-full"
          style={{
            border: "2px solid var(--accent-blue)",
            opacity: 0.35,
            animation: "tidyswipe-pulse 1.6s ease-out infinite",
          }}
        />
      </div>
      <p className="text-[14px] font-semibold tracking-[-0.01em]">Analyse en direct</p>
      <p className="mt-1 text-[12px]" style={{ color: "#9a9a9a" }}>
        Inspection de Téléchargements, Bureau, Documents…
      </p>
      <p className="mt-4 text-[24px] font-semibold tabular-nums" style={{ color: "var(--accent-blue)" }}>
        {count}
      </p>
      <p className="text-[11px] uppercase tracking-[0.1em]" style={{ color: "#6b6e74" }}>
        fichier{count > 1 ? "s" : ""} découvert{count > 1 ? "s" : ""}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Aide à la décision — déterministe, safe-by-default.
// Toute la logique vit dans src/desktop/safety.ts (règles explicites,
// listes de dossiers/extensions protégés). Aucun jugement sémantique.
// ─────────────────────────────────────────────────────────────────────
// (imports déplacés en haut du fichier)

function DecisionPanel({ item, finished }: { item?: QueueItem; finished: boolean }) {
  if (!item || finished) {
    return (
      <div
        className="rounded-[12px] p-4"
        style={{ backgroundColor: "var(--bg-card)", border: "1px solid #1c1d20" }}
      >
        <p className="text-[11px] uppercase tracking-[0.08em] mb-2" style={{ color: "#6b6e74" }}>
          Recommandation
        </p>
        <p className="text-[12.5px]" style={{ color: "#9a9a9a" }}>
          Sélectionnez un fichier pour voir une recommandation prudente.
        </p>
      </div>
    );
  }
  const verdict: SafetyVerdict = evaluateSafety(item);
  const badge = riskBadge(verdict.risk);

  return (
    <div
      className="rounded-[12px] p-4"
      style={{ backgroundColor: "var(--bg-card)", border: "1px solid #1c1d20" }}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "#6b6e74" }}>
          Recommandation
        </p>
        <span
          className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full"
          style={{ color: badge.color, backgroundColor: badge.bg, border: `1px solid ${badge.color}40` }}
        >
          {badge.label}
        </span>
      </div>
      <p className="text-[13px] font-semibold leading-snug mb-2" style={{ color: "#ededed" }}>
        {verdict.recommendation}
      </p>
      <ul className="space-y-1">
        {verdict.reasons.map((r, i) => (
          <li key={i} className="flex items-start gap-1.5 text-[11.5px]" style={{ color: "#9a9a9a" }}>
            <span style={{ color: badge.color }}>•</span>
            <span>{r}</span>
          </li>
        ))}
      </ul>
      {!verdict.deletionAllowed && (
        <div
          className="mt-3 text-[11px] px-2.5 py-1.5 rounded-[6px]"
          style={{ color: "#ff8a82", backgroundColor: "rgba(255,138,130,0.08)", border: "1px solid rgba(255,138,130,0.25)" }}
        >
          Suppression désactivée par la politique de sécurité. Ouvrez le Finder pour gérer ce fichier manuellement.
        </div>
      )}
    </div>
  );
}

function MetadataPanel({ item, onCopyPath }: { item: QueueItem; onCopyPath: () => void }) {
  const [copied, setCopied] = useState(false);
  const ext = (item.name.split(".").pop() || "fichier").toLowerCase();

  const handleReveal = async () => {
    if (!item.path) return;
    if (window.electronAPI?.revealInFolder) {
      const r = await window.electronAPI.revealInFolder(item.path);
      if (!r.ok) console.warn("reveal failed:", r.error);
      return;
    }
    if (window.electronAPI?.openExternal) {
      const dir = item.path.replace(/\/[^/]*$/, "");
      void window.electronAPI.openExternal(`file://${dir}`);
    }
  };
  const handleCopy = () => {
    onCopyPath();
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-[11px] uppercase tracking-[0.06em] shrink-0" style={{ color: "#6b6e74" }}>
        {label}
      </span>
      <span
        className="text-[12px] text-right truncate min-w-0"
        style={{ color: "#ededed", fontFamily: "'SF Mono', ui-monospace, Menlo, monospace" }}
        title={value}
      >
        {value}
      </span>
    </div>
  );

  return (
    <div
      className="rounded-[12px] p-5"
      style={{ backgroundColor: "var(--bg-card)", border: "1px solid #1c1d20" }}
    >
      <p className="text-[11px] uppercase tracking-[0.08em] mb-3" style={{ color: "#6b6e74" }}>
        Détails du fichier
      </p>
      <div className="divide-y" style={{ borderColor: "#15161a" }}>
        <Row label="Type" value={ext.toUpperCase()} />
        <Row label="Taille" value={formatBytes(item.size)} />
        <Row label="Emplacement" value={locationLabel(item.path)} />
      </div>

      {item.path && (
        <div className="mt-4 grid grid-cols-2 gap-1.5">
          <button
            onClick={handleReveal}
            className="text-[10.5px] font-medium py-2 rounded-[7px] hover:bg-white/5 transition-colors"
            style={{ color: "#ededed", border: "1px solid #1f2024", backgroundColor: "#0c0d0f" }}
            title="Afficher dans le Finder"
          >
            Finder
          </button>
          <button
            onClick={handleCopy}
            className="text-[10.5px] font-medium py-2 rounded-[7px] hover:bg-white/5 transition-colors"
            style={{
              color: copied ? "var(--accent-blue)" : "#ededed",
              border: "1px solid #1f2024",
              backgroundColor: "#0c0d0f",
            }}
            title="Copier le chemin"
          >
            {copied ? "Copié ✓" : "Copier le chemin"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Widget : Partager l'outil à vos amis ──────────────────────────────
function ShareWidget() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const SHARE_URL = "https://tidyswipe.app";
  const SHARE_TEXT = "J'ai trouvé une app géniale pour ranger son Mac en swipant ses fichiers : TidySwipe 🧹✨";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(SHARE_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  };
  const handleSMS = () => {
    const body = encodeURIComponent(`${SHARE_TEXT} ${SHARE_URL}`);
    window.location.href = `sms:&body=${body}`;
  };
  const handleEmail = () => {
    const subject = encodeURIComponent("Tu vas adorer cette app pour ton Mac");
    const body = encodeURIComponent(`${SHARE_TEXT}\n\n${SHARE_URL}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };
  const handleWhatsApp = () => {
    const body = encodeURIComponent(`${SHARE_TEXT} ${SHARE_URL}`);
    window.open(`https://wa.me/?text=${body}`, "_blank");
  };

  // Avatars stylisés type iMessage (initiales sur dégradés)
  const friends = [
    { initials: "LM", gradient: "linear-gradient(135deg,#ff6a88,#ff99ac)" },
    { initials: "JD", gradient: "linear-gradient(135deg,#0a84ff,#5ac8fa)" },
    { initials: "SC", gradient: "linear-gradient(135deg,#ffb340,#ff8a00)" },
    { initials: "PL", gradient: "linear-gradient(135deg,#30d158,#0bbf5a)" },
    { initials: "+", gradient: "linear-gradient(135deg,#3a3b40,#1f2024)" },
  ];

  return (
    <div
      className="rounded-[12px] p-5 relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, rgba(10,132,255,0.08), rgba(90,200,250,0.04))",
        border: "1px solid #1c1d20",
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-[34px] h-[34px] rounded-[8px] flex items-center justify-center shrink-0"
          style={{ backgroundColor: "rgba(10,132,255,0.15)" }}
        >
          <Share2 size={16} strokeWidth={1.75} style={{ color: "var(--accent-blue)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "#6b6e74" }}>
            Partage
          </p>
          <p className="text-[13.5px] font-semibold tracking-[-0.01em]" style={{ color: "#ededed" }}>
            Partagez l'outil à vos amis
          </p>
        </div>
      </div>

      {/* Avatars empilés type iMessage */}
      <div className="flex items-center mb-4 pl-1">
        {friends.map((f, i) => (
          <div
            key={i}
            className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-[10.5px] font-semibold text-white"
            style={{
              background: f.gradient,
              border: "2px solid #0c0d0f",
              marginLeft: i === 0 ? 0 : -8,
              boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
            }}
            title={f.initials}
          >
            {f.initials}
          </div>
        ))}
        <span className="ml-3 text-[10.5px]" style={{ color: "#9a9a9a" }}>
          Ils vont vous remercier 💙
        </span>
      </div>

      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-[8px] py-[10px] text-[11.5px] font-semibold tracking-[0.05em] text-white flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90"
        style={{ backgroundColor: "var(--accent-blue)" }}
      >
        <Share2 size={12} />
        PARTAGER LE LIEN
        <ArrowUpRight size={12} strokeWidth={2.75} />
      </button>

      {open && (
        <div className="mt-3 grid grid-cols-2 gap-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
          <button
            onClick={handleCopy}
            className="flex items-center justify-center gap-1.5 text-[10.5px] font-medium py-2 rounded-[7px] hover:bg-white/5 transition-colors"
            style={{
              color: copied ? "var(--accent-blue)" : "#ededed",
              border: "1px solid #1f2024",
              backgroundColor: "#0c0d0f",
            }}
          >
            {copied ? <><Link2 size={11} /> Lien copié ✓</> : <><CopyIcon size={11} /> Copier le lien</>}
          </button>
          <button
            onClick={handleSMS}
            className="flex items-center justify-center gap-1.5 text-[10.5px] font-medium py-2 rounded-[7px] hover:bg-white/5 transition-colors"
            style={{ color: "#ededed", border: "1px solid #1f2024", backgroundColor: "#0c0d0f" }}
          >
            <MessageCircle size={11} /> SMS / iMessage
          </button>
          <button
            onClick={handleWhatsApp}
            className="flex items-center justify-center gap-1.5 text-[10.5px] font-medium py-2 rounded-[7px] hover:bg-white/5 transition-colors"
            style={{ color: "#ededed", border: "1px solid #1f2024", backgroundColor: "#0c0d0f" }}
          >
            <MessageCircle size={11} /> WhatsApp
          </button>
          <button
            onClick={handleEmail}
            className="flex items-center justify-center gap-1.5 text-[10.5px] font-medium py-2 rounded-[7px] hover:bg-white/5 transition-colors"
            style={{ color: "#ededed", border: "1px solid #1f2024", backgroundColor: "#0c0d0f" }}
          >
            <Mail size={11} /> Email
          </button>
        </div>
      )}
    </div>
  );
}
