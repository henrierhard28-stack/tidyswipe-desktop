# 🔄 Auto-update TidySwipe — Procédure ultra simple

## Comment ça marche (en 1 phrase)

À chaque démarrage, l'app vérifie GitHub Releases via le service gratuit
**update.electronjs.org** (officiel Electron). Si une nouvelle version existe,
elle est téléchargée en arrière-plan, et un dialog macOS propose de redémarrer
pour l'installer. **Aucun serveur custom à maintenir.**

---

## ⚙️ Setup initial (UNE SEULE FOIS)

### 1. Crée le repo GitHub
Crée un repo **public** (obligatoire pour update.electronjs.org gratuit) :
- Repo : `Tidyswipe-app/tidyswipe-desktop`
  *(si tu changes le nom, modifie-le dans `electron/main.cjs` ligne ~36 ET dans `package.json` → `build.publish`)*

### 2. Crée un GitHub Token
- https://github.com/settings/tokens/new
- Scopes : ✅ `repo` (juste celui-là)
- Copie le token

### 3. Sur ton Mac, configure le token (une fois)
```bash
echo 'export GH_TOKEN="ghp_tonTokenIci"' >> ~/.zshrc
source ~/.zshrc
```

### 4. Signe & notarise ton app (OBLIGATOIRE pour macOS)
> macOS **refuse** les auto-updates d'apps non signées. Tu as déjà
> `sign-and-notarize.sh` — utilise-le pour signer chaque release.

---

## 🚀 Publier une nouvelle version (3 commandes)

```bash
# 1. Augmente la version (1.1.9 → 1.2.0)
npm version minor          # ou: patch / major

# 2. Build + signe + notarise + publie sur GitHub Releases
npm run electron:publish:mac

# 3. Sur GitHub : passe la release de "Draft" à "Published"
#    (electron-builder la crée en draft par défaut)
```

✅ **C'est tout.** Tous les utilisateurs reçoivent l'update dans l'heure
qui suit (ou au prochain démarrage de l'app).

---

## 📦 Fichiers modifiés

| Fichier | Changement |
|---|---|
| `electron/main.cjs` | + fonction `setupAutoUpdater()` appelée au démarrage |
| `package.json` | + dépendance `update-electron-app`, target `zip`, bloc `publish` GitHub, script `electron:publish:mac` |

---

## 🧪 Tester l'auto-update

1. Build & publie la **v1.2.0**
2. Installe-la sur ton Mac
3. Build & publie la **v1.2.1**
4. Relance l'app v1.2.0 → un dialog "Une mise à jour est prête" doit apparaître

**Logs d'auto-update** : `~/tidyswipe-crash.log` (préfixe `auto-update`)

---

## ❓ FAQ rapide

**Q : Ça coûte quelque chose ?**
R : Non. update.electronjs.org est gratuit pour les repos GitHub publics.

**Q : Et si je veux un repo privé ?**
R : Il faudra héberger un serveur Nuts/Hazel ou utiliser le `provider: github`
   d'electron-builder en standalone (l'app télécharge directement depuis GitHub
   avec un token embarqué — moins propre). Reste sur public, c'est plus simple.

**Q : L'utilisateur peut refuser l'update ?**
R : Oui, le dialog propose "Plus tard". Elle sera reproposée au prochain lancement.

**Q : Que se passe-t-il en dev (`npm run electron:dev`) ?**
R : Rien. L'auto-updater est désactivé tant que l'app n'est pas packagée.
