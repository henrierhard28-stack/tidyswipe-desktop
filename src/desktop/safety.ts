// ─────────────────────────────────────────────────────────────────────
// TidySwipe — Politique de sécurité minimale
// ─────────────────────────────────────────────────────────────────────
// Principe : l'utilisateur décide. L'app ne bloque la suppression QUE
// pour des cas vraiment dangereux :
//   1) emplacements système / OS / applications,
//   2) extensions réellement critiques (clés, certificats, bases système).
//
// Les fichiers de travail (.prproj, .psd, .ai, .pages, .numbers, .key,
// .aep, etc.) NE sont PAS bloqués : c'est le rôle de l'app de proposer
// leur suppression dans les dossiers que l'utilisateur a ouverts.
// ─────────────────────────────────────────────────────────────────────

/**
 * Dossiers protégés — l'app ne touche jamais à ces zones, même si un
 * fichier y est listé. Concentré sur le système, les apps, les caches OS.
 */
export const PROTECTED_DIR_SEGMENTS: ReadonlyArray<string> = [
  // ── Système macOS strict ──
  "/System/", "/private/", "/usr/", "/bin/", "/sbin/",
  "/etc/", "/var/", "/opt/", "/cores/",
  // ── Applications & frameworks ──
  "/Applications/",
  // ── Bibliothèque utilisateur (préférences, conteneurs apps, keychain) ──
  "/Library/Application Support/", "/Library/Containers/",
  "/Library/Preferences/", "/Library/Keychains/",
  "/Library/Group Containers/", "/Library/Mobile Documents/",
  // ── Bases & sauvegardes système ──
  "/Time Machine Backups/", "/.Trashes/", "/.Spotlight-V100/",
  "/.fseventsd/", "/.DocumentRevisions-V100/",
];

/**
 * Extensions vraiment critiques — clés, certificats, bases de données
 * système. La liste est volontairement courte : tout le reste reste
 * librement supprimable par l'utilisateur dans ses dossiers personnels.
 */
export const PROTECTED_EXTENSIONS: ReadonlyArray<string> = [
  // Clés / certificats / secrets
  "key", "pem", "p12", "pfx", "crt", "cer", "der", "asc", "gpg", "kdbx",
  "keychain", "jks", "keystore",
  // Bases système / wallets crypto (formats sensibles uniquement)
  "sqlite", "sqlite3", "kdb",
  "wallet",
];

export type RiskLevel = "blocked" | "info" | "safe";

export type SafetyVerdict = {
  /** Niveau d'information ; "blocked" est la SEULE valeur qui désactive la suppression. */
  risk: RiskLevel;
  /** Texte court d'aide à la décision. */
  recommendation: string;
  /** Raisons concrètes — règles déclenchées, lisibles par l'utilisateur. */
  reasons: string[];
  /** Si false, le bouton Corbeille est désactivé côté UI. */
  deletionAllowed: boolean;
};

function getExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx < 0 || idx === name.length - 1) return "";
  return name.slice(idx + 1).toLowerCase();
}

function pathContainsProtectedSegment(p: string): string | null {
  if (!p) return null;
  const padded = `/${p.replace(/^\/+|\/+$/g, "")}/`;
  for (const seg of PROTECTED_DIR_SEGMENTS) {
    if (padded.toLowerCase().includes(seg.toLowerCase())) return seg;
  }
  return null;
}

/**
 * Évalue un fichier. La suppression est AUTORISÉE par défaut. Elle n'est
 * bloquée que si le fichier est dans un dossier système ou porte une
 * extension vraiment critique.
 */
export function evaluateSafety(file: {
  name: string;
  path?: string;
  size: number;
  mtimeMs?: number;
}): SafetyVerdict {
  const reasons: string[] = [];
  const ext = getExtension(file.name);
  const path = file.path || "";

  // 1) Dossier système / app → BLOQUÉ
  const protectedSeg = pathContainsProtectedSegment(path);
  if (protectedSeg) {
    reasons.push(`Emplacement système (${protectedSeg.replace(/\//g, "")})`);
    return {
      risk: "blocked",
      recommendation: "Fichier système — suppression interdite",
      reasons,
      deletionAllowed: false,
    };
  }

  // 2) Extension critique → BLOQUÉ
  if (ext && PROTECTED_EXTENSIONS.includes(ext)) {
    reasons.push(`Extension sensible (.${ext})`);
    return {
      risk: "blocked",
      recommendation: "Clé / certificat / base — suppression interdite",
      reasons,
      deletionAllowed: false,
    };
  }

  // 3) Indice utile : fichier récent (info, n'empêche pas)
  const SEVEN_DAYS = 7 * 24 * 3600 * 1000;
  const ONE_YEAR = 365 * 24 * 3600 * 1000;
  const age = file.mtimeMs ? Date.now() - file.mtimeMs : null;
  if (age !== null && age < SEVEN_DAYS) {
    reasons.push("Modifié au cours des 7 derniers jours");
    return {
      risk: "info",
      recommendation: "À vous de décider",
      reasons,
      deletionAllowed: true,
    };
  }
  if (file.size > 100 * 1024 * 1024) {
    reasons.push("Fichier volumineux (> 100 Mo)");
  }
  if (age !== null && age > ONE_YEAR) {
    reasons.push("Aucune modification depuis plus d'un an");
  }
  if (reasons.length === 0) {
    reasons.push("Aucun signal particulier");
  }
  return {
    risk: "safe",
    recommendation: "À vous de décider",
    reasons,
    deletionAllowed: true,
  };
}

/** Texte court de la badge de risque, pour l'UI. */
export function riskBadge(risk: RiskLevel): { label: string; color: string; bg: string } {
  switch (risk) {
    case "blocked":
      return { label: "Protégé", color: "#ff8a82", bg: "rgba(255,138,130,0.12)" };
    case "info":
      return { label: "Récent", color: "#ffb84d", bg: "rgba(255,184,77,0.10)" };
    case "safe":
    default:
      return { label: "Libre", color: "#9a9a9a", bg: "rgba(255,255,255,0.04)" };
  }
}
