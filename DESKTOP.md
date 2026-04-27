# TidySwipe — Build Mac (Electron)

Le projet contient à la fois l'app web TanStack Start (preview Lovable) et un build desktop Electron autonome.

## Lancer en dev sur Mac

```bash
npm install              # une seule fois
npm run dev              # terminal 1 — sert le bundle SPA sur :5173
npm run electron:dev     # terminal 2 — ouvre Electron qui charge le dev server
```

## Build et lancement local (sans packaging)

```bash
npm run electron:start
```

→ Build statique dans `dist/` puis ouvre Electron qui charge `dist/index.html` via `file://`.

## Packager pour macOS (.app)

```bash
npm run electron:package:mac
```

Génère `electron-release/TidySwipe-darwin-arm64/TidySwipe.app` (et x64).
Pour distribuer : signature + notarisation Apple Developer requises (non incluses).

## Performance — ce qui est déjà optimisé

- `backgroundColor` natif `#050505` → pas de flash blanc
- `show: false` + `ready-to-show` → fenêtre apparaît seulement quand le DOM est prêt
- `sandbox: true`, `contextIsolation: true`, `spellcheck: false` → boot renderer plus léger
- `singleInstanceLock` → un seul process, lancements suivants instantanés
- Bundle SPA : code-splitting React + lucide-react, `minify: esbuild`, pas de SSR à l'ouverture
- Menu réduit au strict nécessaire (macOS) ou supprimé (autres OS)

## Corbeille système

`shell.trashItem(absolutePath)` (Electron) → vraie Corbeille macOS.
Les fichiers restent récupérables depuis le Finder. Aucune suppression définitive.
