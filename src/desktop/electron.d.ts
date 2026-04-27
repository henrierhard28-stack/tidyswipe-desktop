export type ElectronFile = {
  name: string;
  path: string;
  size: number;
  mtimeMs: number;
};

export type CleanupCandidate = ElectronFile & {
  reason: "duplicate" | "large_unused";
  kept?: string;
};

export type FolderPreset = "downloads" | "desktop" | "documents" | "pictures" | "music" | "videos";

export type ElectronAPI = {
  isElectron: true;
  pickFolder: () => Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>;
  pickPreset: (preset: FolderPreset) => Promise<{ ok: boolean; path?: string; error?: string }>;
  listFolder: (folderPath: string) => Promise<{ ok: boolean; files?: ElectronFile[]; error?: string }>;
  readFileBuffer: (filePath: string) => Promise<{ ok: boolean; data?: Uint8Array; error?: string }>;
  trashFile: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
  openExternal: (url: string) => Promise<{ ok: boolean; error?: string }>;
  openPath: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
  revealInFolder: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
  quickLook: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
  getFileIcon: (filePath: string) => Promise<{ ok: boolean; dataUrl?: string; error?: string }>;
  firstFileInDocuments: () => Promise<{ ok: boolean; file?: ElectronFile; error?: string }>;
  firstFileAcrossMac: () => Promise<{ ok: boolean; file?: ElectronFile; error?: string }>;
  smartCleanupScan: () => Promise<{ ok: boolean; candidates?: CleanupCandidate[]; error?: string }>;
  fullSweep: () => Promise<{ ok: boolean; files?: ElectronFile[]; error?: string }>;
  getSessionState: () => Promise<unknown | null>;
  setSessionState: (snapshot: unknown) => Promise<{ ok: boolean }>;
  onScanProgress: (cb: (data: { count: number; done?: boolean }) => void) => () => void;
};

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
