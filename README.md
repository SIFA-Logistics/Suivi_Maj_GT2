# Suivi MAJ GTrans2 — SIFA Logistics

Outil interne de suivi des mises à jour de l'ERP GTrans2, reconstruit à partir
du fichier HTML autonome `outils_maj_gt2_1.html` en application web à deux
parties :

- **`/client`** — frontend **React** (Vite), apparence strictement identique à
  l'outil d'origine ;
- **`/server`** — backend **Node.js** (Express + Socket.io), état partagé
  persisté dans un simple fichier JSON, diffusion **instantanée** (push, sans
  interrogation périodique) de chaque modification à tous les postes connectés.

---

## 1. Ce qui change par rapport à l'outil HTML

| Sujet | Version HTML d'origine | Cette version |
|---|---|---|
| Partage entre collègues | Copier/coller manuel d'un JSON via une page Confluence | **Temps réel** via WebSocket — latence mesurée ≈ 70 ms |
| Sauvegarde | API File System Access (Chrome/Edge uniquement), fichier choisi par chaque utilisateur | Fichier JSON côté serveur, écriture automatique et atomique |
| Onglets « Planning » et « Emails » | Locaux, perdus au rechargement | Partagés et persistés comme le reste |
| « Tout réinitialiser » | Destructif et local | Archive automatique dans `data/archives/`, puis réinitialisation pour toute l'équipe |
| Accès | Fichier ouvert localement | SSO Microsoft Entra ID |

**Inchangé :** l'apparence (couleurs, mise en page, drapeaux SVG, textes), les
4 onglets et leurs fonctionnalités, les 6 membres de l'équipe, les listes de
tâches standard, et les deux exports PNG (poster d'incident par site, poster de
planning global) via html2canvas.

---

## 2. Prérequis

- Un serveur Linux avec **Docker** et **Docker Compose v2**.
- Un nom de domaine interne pointant vers ce serveur (ex.
  `maj-gt2.sifalogistics.com`) et, de préférence, un reverse proxy assurant
  **HTTPS** — l'authentification par cookie et l'API presse-papiers du
  navigateur exigent HTTPS hors `localhost`.
- Pour le SSO : une **inscription d'application Entra ID** (voir §4).

---

## 3. Déploiement

```bash
git clone <votre-depot> suivi-maj-gt2
cd suivi-maj-gt2

cp .env.example .env
# Renseigner PUBLIC_URL, les identifiants Entra ID et SESSION_SECRET.
# Générer un secret solide :
openssl rand -base64 48

docker compose up -d --build
docker compose logs -f
```

L'outil écoute sur le port **8080**. Les données de l'équipe sont écrites dans
le dossier `./data` du serveur hôte (monté dans le conteneur) :

```
data/
├── state.json          état courant, partagé par toute l'équipe
└── archives/           instantanés créés avant chaque réinitialisation/import
```

### Sauvegarde

Il n'y a pas de base de données : sauvegarder le dossier `data/` suffit.

```bash
# Exemple de sauvegarde quotidienne (crontab)
0 2 * * * tar czf /sauvegardes/maj-gt2-$(date +\%F).tgz -C /opt/suivi-maj-gt2 data
```

### Mise à jour de l'outil

```bash
git pull
docker compose up -d --build
```

Le dossier `data/` étant hors du conteneur, aucune donnée n'est perdue.

### Reverse proxy (exemple nginx)

Le WebSocket exige le relais des en-têtes `Upgrade` :

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade    $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host       $host;
    proxy_set_header X-Real-IP  $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 3600s;   # évite la coupure des connexions inactives
}
```

---

## 4. Configuration du SSO Entra ID

À faire réaliser par un administrateur Microsoft 365 de SIFA, dans le
**portail Azure → Microsoft Entra ID → Inscriptions d'applications** :

1. **Nouvelle inscription**
   - Nom : `Suivi MAJ GTrans2`
   - Types de comptes pris en charge : *Comptes dans cet annuaire d'organisation uniquement*
   - URI de redirection : type **Web**, valeur `https://<votre-domaine>/auth/callback`
2. Relever l'**ID d'application (client)** → `ENTRA_CLIENT_ID`
3. Relever l'**ID de l'annuaire (locataire)** → `ENTRA_TENANT_ID`
4. **Certificats et secrets → Nouveau secret client** → `ENTRA_CLIENT_SECRET`
   *(noter la date d'expiration : le secret devra être renouvelé)*
5. **Autorisations d'API** : `openid`, `profile`, `email` (permissions déléguées
   Microsoft Graph, accordées par défaut).

Restreindre ensuite l'accès aux seules personnes concernées, au choix :

- via `ALLOWED_EMAILS` dans le `.env` (liste blanche applicative), et/ou
- dans Entra ID : *Applications d'entreprise → Suivi MAJ GTrans2 → Propriétés →
  « Affectation requise » = Oui*, puis affecter les 6 membres de l'équipe.

L'utilisateur authentifié est automatiquement rattaché à l'un des 6 membres de
l'équipe par correspondance sur son nom affiché ; à défaut, ses initiales sont
dérivées de son nom.

---

## 5. Développement en local

```bash
# Terminal 1 — backend, sans SSO
cd server
npm install
AUTH_MODE=disabled npm run dev

# Terminal 2 — frontend avec rechargement à chaud
cd client
npm install
npm run dev          # http://localhost:5173 (relaie /api et /socket.io vers :8080)
```

> `AUTH_MODE=disabled` désactive toute authentification. À réserver au poste de
> développement — ne jamais l'utiliser sur un serveur accessible.

Pour tester la synchronisation, ouvrir l'outil dans deux fenêtres distinctes :
toute modification apparaît immédiatement dans l'autre.

---

## 6. Architecture

```
suivi-maj-gt2/
├── client/                    frontend React
│   ├── index.html
│   ├── vite.config.js         proxy /api + /socket.io vers le backend en dev
│   └── src/
│       ├── App.jsx            en-tête, onglets, aiguillage
│       ├── components/
│       │   ├── TabSuivi.jsx         onglet « Suivi général »
│       │   ├── TabDeploiement.jsx   onglet « Déploiement par site »
│       │   ├── TabPlanning.jsx      onglet « Générateur de planning »
│       │   ├── TabEmails.jsx        onglet « Emails »
│       │   ├── RealtimeBar.jsx      état de synchronisation + présence
│       │   └── Shared.jsx           champs synchronisés, étoiles, sélecteurs
│       ├── lib/
│       │   ├── realtime.js    client Socket.io + application des patches
│       │   ├── format.js      durées, dates, statistiques (repris de l'original)
│       │   └── flags.jsx      drapeaux SVG (repris de l'original)
│       └── styles/app.css     CSS de l'original, repris tel quel
├── server/
│   └── src/
│       ├── index.js           Express + Socket.io
│       ├── store.js           état, persistance JSON, archivage
│       ├── auth.js            SSO Entra ID (OIDC + PKCE)
│       └── initialState.js    équipe, tâches et valeurs par défaut
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

### Protocole temps réel

Le client applique la modification **localement d'abord** (affichage
instantané), puis l'émet ; le serveur l'applique à l'état de référence et la
rediffuse aux autres clients. Aucune interrogation périodique n'est utilisée.

| Événement | Sens | Rôle |
|---|---|---|
| `init` | serveur → client | État complet, identité, présences, à la connexion |
| `op` | client ↔ serveur | Modification granulaire (`set`, `toggleArray`, `insert`, `remove`) sur un chemin de l'état |
| `state:full` | serveur → clients | Remplacement complet après réinitialisation ou import |
| `presence` | serveur → clients | Liste des personnes connectées |

La poignée de main Socket.io réutilise le cookie de session : un client non
authentifié ne peut ni lire ni modifier l'état.

Les champs texte (notes, modèles d'emails, points clés) appliquent deux
précautions : envoi différé de 250 ms pour éviter les rafales, et non-écrasement
d'un champ pendant que quelqu'un y saisit du texte.

---

## 7. Diagnostic

| Symptôme | Piste |
|---|---|
| Bandeau rouge « Connexion au serveur perdue » | Le reverse proxy ne relaie pas les en-têtes `Upgrade`/`Connection` (voir §3) |
| Boucle de redirection à la connexion | `PUBLIC_URL` ne correspond pas à l'URL réelle, ou l'URI de redirection Entra ID diffère |
| « Votre compte n'est pas autorisé » | Adresse absente de `ALLOWED_EMAILS` |
| Le conteneur s'arrête au démarrage | Variables Entra ID manquantes — le message précise lesquelles (`docker compose logs`) |
| Modifications non conservées après redémarrage | Le volume `./data` n'est pas monté, ou droits d'écriture insuffisants |

Sonde de santé : `curl http://localhost:8080/healthz`

---

## 8. Points à noter

- **Pas de gestion de conflit fine** : si deux personnes modifient le *même*
  champ à la même seconde, la dernière écriture l'emporte. Sur des champs
  distincts (le cas courant), aucun conflit.
- **Le secret client Entra ID expire** (12 ou 24 mois selon la configuration
  choisie) : prévoir son renouvellement, sinon la connexion cessera de
  fonctionner.
- **`data/archives/` croît à chaque réinitialisation.** Les fichiers sont petits
  (quelques dizaines de Ko) ; un nettoyage annuel suffit.
