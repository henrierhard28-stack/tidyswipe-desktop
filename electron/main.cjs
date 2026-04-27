const nodeFs = require("fs");
const path = require("path");
const os = require("os");
const logFile = path.join(os.homedir(), "tidyswipe-crash.log");

function writeCrashLog(label, err) {
  try {
    const detail = err?.stack || err?.message || JSON.stringify(err) || String(err);
    nodeFs.appendFileSync(logFile, `${new Date().toISOString()} ${label} ${detail}\n`);
  } catch {
    // Never let crash logging create a second crash.
  }
}

process.on("uncaughtException", (err) => writeCrashLog("uncaughtException", err));
process.on("unhandledRejection", (err) => writeCrashLog("unhandledRejection", err));

const { app, BrowserWindow, shell, ipcMain, Menu, dialog, nativeImage } = require("electron");
const fs = require("fs/promises");
const crypto = require("crypto");
const { spawn } = require("child_process");

// ───────────────────────────────────────────────────────────
// Auto-update (GitHub Releases via update.electronjs.org)
// Ne s'active QUE dans une app packagée et signée.
// ───────────────────────────────────────────────────────────
function setupAutoUpdater() {
  if (!app.isPackaged) return;
  if (process.platform !== "darwin" && process.platform !== "win32") return;
  try {
    const { updateElectronApp, UpdateSourceType } = require("update-electron-app");
    updateElectronApp({
      updateSource: {
        type: UpdateSourceType.ElectronPublicUpdateService,
        repo: "Tidyswipe-app/tidyswipe-desktop", // ⚠️ remplacer par owner/repo GitHub réel
      },
      updateInterval: "1 hour",
      logger: {
        log: (...args) => writeCrashLog("auto-update", args.join(" ")),
        info: (...args) => writeCrashLog("auto-update info", args.join(" ")),
        warn: (...args) => writeCrashLog("auto-update warn", args.join(" ")),
        error: (...args) => writeCrashLog("auto-update error", args.join(" ")),
      },
      notifyUser: true, // affiche un dialog macOS natif quand l'update est prête
    });
  } catch (err) {
    writeCrashLog("auto-update setup failed", err);
  }
}

let mainWindow = null;
let sessionState = null;

const APP_ICON_PATH = path.join(__dirname, "icon.png");

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: "#1a1a1a",
    titleBarStyle: "hiddenInset",
    show: false,
    icon: APP_ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  const devUrl = process.env.ELECTRON_START_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "electron-shell", "electron-shell", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    writeCrashLog("render-process-gone", details);
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // Force le bon icône Dock sur macOS (filet de sécurité — l'icône
    // est aussi dans Info.plist via build/icon.icns).
    if (process.platform === "darwin" && app.dock) {
      try {
        const dockIcon = nativeImage.createFromPath(APP_ICON_PATH);
        if (!dockIcon.isEmpty()) app.dock.setIcon(dockIcon);
      } catch (e) {
        writeCrashLog("dock icon", e);
      }
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          { role: "appMenu" },
          { role: "editMenu" },
          { role: "viewMenu" },
          { role: "windowMenu" },
        ]),
      );
    } else {
      Menu.setApplicationMenu(null);
    }
    createWindow();
    setupAutoUpdater();
    app.on("child-process-gone", (_event, details) => {
      writeCrashLog("child-process-gone", details);
    });
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ───────────────────────────────────────────────────────────
// IPC handlers
// ───────────────────────────────────────────────────────────
const ACCEPTED_RE = /\.(png|jpe?g|webp|gif|heic|pdf|docx?|xlsx?|pptx?|txt|rtf|csv|zip|mp4|mov|mp3|wav)$/i;
const MAX_FILES = 3000;
const MAX_BUFFER_BYTES = 15 * 1024 * 1024;
const MAX_NATIVE_ICON_BYTES = 100 * 1024 * 1024;

function getWhitelistDirs() {
  // Whitelist: dossiers que l'utilisateur PEUT choisir manuellement.
  return [
    app.getPath("downloads"),
    app.getPath("desktop"),
    app.getPath("documents"),
    app.getPath("music"),
    app.getPath("videos"),
    app.getPath("pictures"),
  ];
}

function getAutoScanDirs() {
  // Auto-scan limité aux dossiers à fort taux de doublons.
  // On exclut Music & Movies (iTunes Library, gros fichiers)
  // et Pictures (Photos library) pour éviter les crashs mémoire.
  return [
    app.getPath("downloads"),
    app.getPath("desktop"),
    app.getPath("documents"),
  ];
}

function getSourceDirs() {
  return getAutoScanDirs();
}

function isWhitelisted(p) {
  if (typeof p !== "string" || !p) return false;
  const norm = path.resolve(p);
  return getWhitelistDirs().some(
    (root) => norm === root || norm.startsWith(root + path.sep),
  );
}

// System / app file blacklist applied during recursive scan.
const BLACKLIST_DIRS = new Set([
  "Library", "Applications", "System", "private", "var", "usr", "bin", "sbin",
  "etc", "opt", "cores",
  "node_modules", "venv", ".venv", "__pycache__",
  ".git", ".svn", ".hg", ".next", ".nuxt", "dist", "build", "target",
  "Pods", "DerivedData", ".gradle", ".m2", ".cargo",
  "Dropbox", "OneDrive", "Box", "Box Sync", "pCloud", "MEGA",
  "Creative Cloud Files",
]);
const BLACKLIST_FILES = new Set([
  ".DS_Store", ".localized", "Icon\r", ".fseventsd",
  ".Spotlight-V100", ".Trashes", ".VolumeIcon.icns",
]);
const BLACKLIST_EXT = /\.(app|framework|kext|plist|dylib|so|pkg|bundle)$/i;

// Extensions VRAIMENT critiques : clés, certificats, bases système.
// Les fichiers de travail (.prproj, .psd, .ai, .pages, etc.) NE sont PAS
// dans cette liste — l'utilisateur doit pouvoir les supprimer librement
// depuis ses propres dossiers.
const PROTECTED_EXT = /\.(key|pem|p12|pfx|crt|cer|der|asc|gpg|kdbx|keychain|jks|keystore|sqlite|sqlite3|kdb|wallet)$/i;

// Emplacements système strictement interdits, même si listés par erreur.
const PROTECTED_PATH_RE = /(\/(System|Applications|private|usr|bin|sbin|etc|var|opt)\/|\/Library\/(Application Support|Containers|Preferences|Keychains|Group Containers|Mobile Documents)\/|\/Time Machine Backups\/)/i;

function isScanSafe(name, full) {
  if (!name) return false;
  if (name.startsWith(".")) return false;
  if (BLACKLIST_FILES.has(name)) return false;
  if (BLACKLIST_DIRS.has(name)) return false;
  if (BLACKLIST_EXT.test(name)) return false;
  if (full && !isWhitelisted(full)) return false;
  return true;
}

function isBlockedPath(p) {
  // Block anything outside the whitelist.
  return !isWhitelisted(p);
}

ipcMain.handle("trash-file", async (_e, filePath) => {
  if (typeof filePath !== "string" || !filePath) return { ok: false, error: "Invalid path" };
  if (!isWhitelisted(filePath)) {
    console.error("[trash-file] blocked path outside whitelist:", filePath);
    return { ok: false, error: "Action bloquée : fichier hors dossiers personnels." };
  }
  if (PROTECTED_PATH_RE.test(filePath)) {
    console.error("[trash-file] blocked protected segment:", filePath);
    return { ok: false, error: "Action bloquée : emplacement protégé." };
  }
  const base = path.basename(filePath);
  if (PROTECTED_EXT.test(base)) {
    console.error("[trash-file] blocked protected extension:", base);
    return { ok: false, error: "Action bloquée : extension protégée." };
  }
  try {
    const lst = await fs.lstat(filePath);
    if (lst.isSymbolicLink()) return { ok: false, error: "Alias/symlink ignoré." };
    await shell.trashItem(filePath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.handle("read-file-buffer", async (_e, filePath) => {
  try {
    if (!isWhitelisted(filePath)) return { ok: false, error: "Accès refusé." };
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_BUFFER_BYTES) return { ok: false, error: "Fichier trop volumineux pour l'aperçu intégré." };
    const data = await fs.readFile(filePath);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.handle("list-folder", async (_e, folderPath) => {
  try {
    if (!isWhitelisted(folderPath)) return { ok: false, error: "Accès refusé : hors whitelist." };
    const files = [];
    await walk(folderPath, files, ACCEPTED_RE);
    return { ok: true, files };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

async function walk(dir, out, regex) {
  if (out.length >= MAX_FILES) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= MAX_FILES) return;
    const full = path.join(dir, entry.name);
    if (!isScanSafe(entry.name, full)) continue;
    try {
      const lst = await fs.lstat(full);
      if (lst.isSymbolicLink()) continue;
    } catch { continue; }
    if (entry.isDirectory()) {
      await walk(full, out, regex);
    } else if (entry.isFile() && (!regex || regex.test(entry.name))) {
      try {
        const stat = await fs.stat(full);
        out.push({ name: entry.name, path: full, size: stat.size, mtimeMs: stat.mtimeMs, atimeMs: stat.atimeMs });
      } catch {
        /* skip */
      }
    }
  }
}

ipcMain.handle("pick-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    defaultPath: app.getPath("downloads"),
  });
  if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true };
  const picked = result.filePaths[0];
  if (!isWhitelisted(picked)) return {
    ok: false,
    error: "Pour ta sécurité, TidySwipe n'analyse que tes dossiers personnels (Téléchargements, Documents, Bureau, Images, Musique, Vidéos).",
  };
  return { ok: true, path: picked };
});

ipcMain.handle("pick-preset", async (_e, preset) => {
  try {
    const map = {
      downloads: app.getPath("downloads"),
      desktop: app.getPath("desktop"),
      documents: app.getPath("documents"),
      pictures: app.getPath("pictures"),
      music: app.getPath("music"),
      videos: app.getPath("videos"),
    };
    const target = map[preset];
    if (!target) return { ok: false, error: "Dossier non autorisé" };
    return { ok: true, path: target };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.handle("open-external", async (_e, url) => {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
    return { ok: false, error: "Invalid URL" };
  }
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

// Open a local file with the macOS default application (Preview, Quick Look host, etc.)
ipcMain.handle("open-path", async (_e, filePath) => {
  if (typeof filePath !== "string" || !filePath) return { ok: false, error: "Invalid path" };
  if (!isWhitelisted(filePath)) return { ok: false, error: "Accès refusé : hors whitelist." };
  try {
    const stat = await fs.lstat(filePath);
    if (stat.isSymbolicLink()) return { ok: false, error: "Alias/symlink ignoré." };
    const errMsg = await shell.openPath(filePath);
    if (errMsg) return { ok: false, error: errMsg };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

// Reveal a file in Finder (or the OS file manager) and select it.
ipcMain.handle("reveal-in-folder", async (_e, filePath) => {
  if (typeof filePath !== "string" || !filePath) return { ok: false, error: "Invalid path" };
  if (!isWhitelisted(filePath)) return { ok: false, error: "Accès refusé : hors whitelist." };
  try {
    shell.showItemInFolder(filePath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

// macOS-only Quick Look preview via qlmanage. Falls back to openPath elsewhere.
ipcMain.handle("quick-look", async (_e, filePath) => {
  if (typeof filePath !== "string" || !filePath) return { ok: false, error: "Invalid path" };
  if (!isWhitelisted(filePath)) return { ok: false, error: "Accès refusé : hors whitelist." };
  try {
    if (process.platform === "darwin") {
      // -p = preview, detached so the spawn returns immediately
      const child = spawn("/usr/bin/qlmanage", ["-p", filePath], { detached: true, stdio: "ignore" });
      child.on("error", (e) => writeCrashLog("qlmanage-spawn", e));
      child.unref();
      return { ok: true };
    }
    const errMsg = await shell.openPath(filePath);
    if (errMsg) return { ok: false, error: errMsg };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.handle("session:get", async () => sessionState);

ipcMain.handle("session:set", async (_e, snapshot) => {
  sessionState = snapshot && typeof snapshot === "object" ? snapshot : null;
  return { ok: true };
});

// Real macOS document icon as data URL, without per-file NSWorkspace lookups.
// app.getFileIcon can crash natively on some macOS/Electron combinations;
// loading Apple's system GenericDocumentIcon is stable and still uses the
// real macOS document asset rather than a custom/fake SVG.
ipcMain.handle("get-file-icon", async (_e, filePath) => {
  try {
    if (!isWhitelisted(filePath)) return { ok: false, error: "Hors whitelist" };
    if (process.platform !== "darwin") return { ok: false, error: "Icône système macOS indisponible" };
    const img = nativeImage.createFromPath(
      "/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/GenericDocumentIcon.icns",
    );
    if (img.isEmpty()) return { ok: false, error: "Icône système introuvable" };
    return { ok: true, dataUrl: img.toDataURL() };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = nodeFs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

// Auto-scan: find the most recent compatible file across common user folders.
ipcMain.handle("first-file-in-documents", async () => {
  try {
    const out = [];
    for (const dir of getSourceDirs()) {
      await walk(dir, out, null);
    }
    if (out.length === 0) return { ok: false, error: "No file found" };
    out.sort((a, b) => b.mtimeMs - a.mtimeMs); // most recent first
    return { ok: true, file: out[0] };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

// Full sweep: list all files in user folders (no filtering, no hashing).
// Used to populate the swipe queue with everything found, after the first file.
ipcMain.handle("full-sweep", async () => {
  try {
    const all = [];
    let lastEmit = 0;
    const emit = (count, done = false) => {
      const now = Date.now();
      if (!done && now - lastEmit < 50) return;
      lastEmit = now;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("scan-progress", { count, done });
      }
    };
    for (const dir of getSourceDirs()) {
      try {
        await walkWithProgress(dir, all, null, (count) => emit(count));
      } catch { /* skip */ }
    }
    emit(all.length, true);
    all.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return { ok: true, files: all };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

async function walkWithProgress(dir, out, regex, onProgress) {
  if (out.length >= MAX_FILES) return;
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (out.length >= MAX_FILES) return;
    const full = path.join(dir, entry.name);
    if (!isScanSafe(entry.name, full)) continue;
    try {
      const lst = await fs.lstat(full);
      if (lst.isSymbolicLink()) continue;
    } catch { continue; }
    if (entry.isDirectory()) {
      await walkWithProgress(full, out, regex, onProgress);
    } else if (entry.isFile() && (!regex || regex.test(entry.name))) {
      try {
        const stat = await fs.stat(full);
        out.push({ name: entry.name, path: full, size: stat.size, mtimeMs: stat.mtimeMs, atimeMs: stat.atimeMs });
        onProgress?.(out.length);
      } catch { /* skip */ }
    }
  }
}

// Smart cleanup: scan Documents + Pictures + Downloads, find duplicates
// (same SHA-256) and large unused files (>50 MB, mtime > 30 days old).
ipcMain.handle("smart-cleanup-scan", async () => {
  try {
    const dirs = getSourceDirs();
    const all = [];
    // No regex filter for cleanup — we want all file types
    for (const d of dirs) {
      try {
        await walk(d, all, null);
      } catch {
        /* skip if no access */
      }
    }
    if (all.length === 0) return { ok: true, candidates: [] };

    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const LARGE_BYTES = 50 * 1024 * 1024;
    const now = Date.now();

    // 1) Duplicates by SHA-256 (only files >= 1 KB, cap to 2000 hashed for perf)
    const sizeBuckets = new Map();
    for (const f of all) {
      if (f.size < 1024) continue;
      const arr = sizeBuckets.get(f.size) || [];
      arr.push(f);
      sizeBuckets.set(f.size, arr);
    }

    const candidates = [];
    let hashed = 0;
    const HASH_CAP = 2000;

    for (const [, group] of sizeBuckets) {
      if (group.length < 2) continue;
      const hashes = new Map(); // hash -> files[]
      for (const f of group) {
        if (hashed >= HASH_CAP) break;
        try {
          const h = await hashFile(f.path);
          hashed++;
          const list = hashes.get(h) || [];
          list.push(f);
          hashes.set(h, list);
        } catch {
          /* skip unreadable */
        }
      }
      for (const [, files] of hashes) {
        if (files.length < 2) continue;
        // Keep the oldest (likely original), suggest the rest for trash
        files.sort((a, b) => a.mtimeMs - b.mtimeMs);
        for (let i = 1; i < files.length; i++) {
          candidates.push({
            ...files[i],
            reason: "duplicate",
            kept: files[0].path,
          });
        }
      }
    }

    // 2) Large + old files
    for (const f of all) {
      if (f.size >= LARGE_BYTES && now - (f.atimeMs || f.mtimeMs) > THIRTY_DAYS_MS) {
        // Skip if already flagged as duplicate
        if (candidates.some((c) => c.path === f.path)) continue;
        candidates.push({ ...f, reason: "large_unused" });
      }
    }

    return { ok: true, candidates };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});
