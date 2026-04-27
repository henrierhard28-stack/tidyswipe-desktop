const { app, BrowserWindow, shell, ipcMain, Menu, dialog } = require("electron");
const path = require("path");
const nodeFs = require("fs");
const fs = require("fs/promises");
const crypto = require("crypto");

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: "#050505",
    titleBarStyle: "hiddenInset",
    show: false,
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
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "electron-shell", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
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
    if (process.platform === "darwin") {
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
const MAX_FILES = 8000;

function getSourceDirs() {
  // Restricted to standard user folders only.
  // Pictures (Photos library) is explicitly excluded for privacy.
  return [
    app.getPath("downloads"),
    app.getPath("desktop"),
    app.getPath("documents"),
  ];
}

function isBlockedPath(p) {
  // Block any path inside the Photos library / Pictures folder
  const picturesDir = app.getPath("pictures");
  return p === picturesDir || p.startsWith(picturesDir + path.sep);
}

ipcMain.handle("trash-file", async (_e, filePath) => {
  if (typeof filePath !== "string" || !filePath) return { ok: false, error: "Invalid path" };
  if (isBlockedPath(filePath)) return { ok: false, error: "Accès refusé : Photos/Images" };
  try {
    await fs.access(filePath);
    await shell.trashItem(filePath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.handle("read-file-buffer", async (_e, filePath) => {
  try {
    if (isBlockedPath(filePath)) return { ok: false, error: "Accès refusé : Photos/Images" };
    const data = await fs.readFile(filePath);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.handle("list-folder", async (_e, folderPath) => {
  try {
    if (isBlockedPath(folderPath)) return { ok: false, error: "Accès refusé : Photos/Images" };
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
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "node_modules" || entry.name === "Library") continue;
    if (/\.(app|pkg|framework|bundle)$/i.test(entry.name)) continue;
    const full = path.join(dir, entry.name);
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
  const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"] });
  if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true };
  const picked = result.filePaths[0];
  if (isBlockedPath(picked)) return { ok: false, error: "Accès refusé : dossier Photos/Images" };
  return { ok: true, path: picked };
});

ipcMain.handle("pick-preset", async (_e, preset) => {
  try {
    const map = {
      downloads: app.getPath("downloads"),
      desktop: app.getPath("desktop"),
      documents: app.getPath("documents"),
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
    for (const dir of getSourceDirs()) {
      try {
        await walkWithProgress(dir, all, null, (count) => {
          // Emit on every file for a smooth 1→2→3 counter
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("scan-progress", { count });
          }
        });
      } catch { /* skip */ }
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("scan-progress", { count: all.length, done: true });
    }
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
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "node_modules" || entry.name === "Library") continue;
    if (/\.(app|pkg|framework|bundle)$/i.test(entry.name)) continue;
    const full = path.join(dir, entry.name);
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
