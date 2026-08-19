# Suivi MAJ GTrans2 — contexte projet

Outil interne SIFA Logistics de suivi des mises à jour de l'ERP GTrans2.
Reconstruction d'un fichier HTML autonome (`outils_maj_gt2_1.html`) en
application web React + Node.js avec synchronisation temps réel.

## Architecture

- `client/` — React 18 + Vite. Pas de TypeScript, pas de framework CSS.
- `server/` — Node.js 22, Express 4 + Socket.io 4, ES modules (`"type": "module"`).
- Persistance : **un fichier JSON** (`data/state.json`). Pas de base de données —
  c'est un choix assumé, ne pas proposer d'en introduire une.
- Authentification : SSO Microsoft Entra ID (OIDC, Authorization Code + PKCE),
  implémenté à la main dans `server/src/auth.js` avec `jose`.

## Règles impératives

### Apparence
`client/src/styles/app.css` est **repris tel quel** du fichier HTML d'origine.
L'exigence du projet est une apparence *strictement identique* à l'original.

- Ne pas reformater, réordonner ou « nettoyer » ce CSS.
- Tout ajout de style va dans la section « AJOUTS TEMPS RÉEL » en fin de fichier.
- Ne pas introduire Tailwind, styled-components, ni aucun système de design.
- Les classes CSS des composants React doivent correspondre exactement à celles
  générées par l'outil d'origine (`.zone-tab`, `.initial-check`, `.ip-notes`...).

### Données métier
`server/src/initialState.js` contient les données réelles de l'équipe :
les 6 membres avec leurs initiales, les 4 groupes de tâches globales, les
6 sites et leurs 15 étapes standard. **Ne rien y inventer ni y modifier** sans
demande explicite — ces listes viennent du terrain.

### Temps réel
Le protocole est décrit au §6 du README. Points de vigilance :

- Les modifications passent par des opérations granulaires
  (`set` / `toggleArray` / `insert` / `remove`) sur un chemin de l'état.
- `applyOpImmutable` (client) et `applyOp` (serveur) doivent rester **rigoureusement
  symétriques** : toute nouvelle opération doit être ajoutée aux deux.
- `ALLOWED_ROOTS` dans `server/src/store.js` restreint les chemins modifiables.
  Étendre cette liste si un nouveau champ de l'état devient éditable.
- Aucun polling. Si une donnée doit se rafraîchir, elle passe par un événement push.

### Champs texte
Les `textarea` et `input[type=text]` partagés utilisent `useSyncedValue`
(`client/src/components/Shared.jsx`) : envoi différé de 250 ms et
non-écrasement du champ tant qu'il a le focus. Ne pas remplacer ces champs par
des composants contrôlés directement branchés sur l'état partagé — la frappe
d'un collègue effacerait la saisie en cours.

## Commandes

```bash
# Backend seul, sans SSO (développement)
cd server && npm install && AUTH_MODE=disabled npm run dev

# Frontend avec rechargement à chaud (proxy vers :8080)
cd client && npm install && npm run dev        # http://localhost:5173

# Build de production
cd client && npm run build

# Pile complète en conteneur
docker compose up -d --build
```

Aperçu multi-utilisateurs sans SSO : ouvrir
`http://localhost:5173/?as=Baha Marzougui` et `?as=Océane Coissac` dans deux
fenêtres. Le paramètre `as` est **ignoré** dès que `AUTH_MODE=entra`.

## Pièges connus

- `AUTH_MODE=entra` sans les variables Entra ID → le serveur s'arrête
  volontairement au démarrage en listant ce qui manque.
- Derrière un reverse proxy, les en-têtes `Upgrade`/`Connection` doivent être
  relayés, sinon le WebSocket retombe en long-polling (voir §3 du README).
- `data/` doit être monté hors du conteneur, sinon l'état est perdu à chaque
  reconstruction de l'image.
- Pas de résolution de conflit fine : deux personnes sur le *même* champ à la
  même seconde → la dernière écriture l'emporte.

## Style de code

- Français pour les commentaires, la documentation et les libellés d'interface.
- Anglais pour les identifiants de code.
- Commentaires qui expliquent *pourquoi*, pas *quoi*.
- Pas de dépendance ajoutée sans nécessité : le projet en compte volontairement peu.
