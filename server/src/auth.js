/**
 * Authentification, en trois modes pilotés par la variable AUTH_MODE :
 *
 *  - `local`    : comptes internes (identifiant + mot de passe), vérifiés
 *                 contre `data/users.json`. Voir `users.js` et
 *                 `scripts/creer-utilisateur.mjs`.
 *  - `entra`    : SSO Microsoft Entra ID (OpenID Connect, flux « Authorization
 *                 Code » avec PKCE), sans dépendance à un service tiers.
 *  - `disabled` : aucune authentification — réservé à l'aperçu et aux tests
 *                 en local.
 *
 * Les trois modes restent du code vivant : basculer de l'un à l'autre ne
 * demande que de changer AUTH_MODE dans .env. Le SSO n'est donc pas à
 * réécrire le jour où l'inscription d'application Entra ID sera disponible.
 *
 * Quel que soit le mode, la session est un JWT HS256 signé localement et
 * déposé dans un cookie HttpOnly : il n'y a aucun magasin de sessions à
 * administrer, et c'est ce qui rend les trois modes interchangeables — le
 * fournisseur d'identité ne sert qu'à établir l'identité une seule fois.
 */

import crypto from 'node:crypto';
import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';
import { TEAM_INFO } from './initialState.js';
import { getUser, verifyPassword, countUsers, USERS_FILE } from './users.js';

const AUTH_MODE = (process.env.AUTH_MODE || 'entra').trim().toLowerCase();
const TENANT_ID = process.env.ENTRA_TENANT_ID || '';
const CLIENT_ID = process.env.ENTRA_CLIENT_ID || '';
const CLIENT_SECRET = process.env.ENTRA_CLIENT_SECRET || '';
const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://localhost:8080').replace(/\/$/, '');
const REDIRECT_URI = `${PUBLIC_URL}/auth/callback`;
// Prefixe d'URL vu par le navigateur. Le reverse proxy le retire
// avant Express, qui ne connait donc que /auth et /api : il faut le remettre
// sur tout ce qui sort vers le client — path des cookies et redirections —
// sinon le navigateur viserait la racine du domaine, servie par un autre projet.
const BASE_PATH = new URL(PUBLIC_URL).pathname.replace(/\/*$/, '/');
const SESSION_COOKIE = 'majgt2_session';
const TX_COOKIE = 'majgt2_tx';
const SESSION_TTL = process.env.SESSION_TTL || '12h';

/** Liste blanche d'adresses e-mail (vide = tout compte du tenant est accepté). */
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const SESSION_SECRET = process.env.SESSION_SECRET
  || (AUTH_MODE === 'disabled' ? 'apercu-local-non-securise' : '');

if (AUTH_MODE === 'entra') {
  const missing = [
    ['ENTRA_TENANT_ID', TENANT_ID],
    ['ENTRA_CLIENT_ID', CLIENT_ID],
    ['ENTRA_CLIENT_SECRET', CLIENT_SECRET],
    ['SESSION_SECRET', SESSION_SECRET],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.error(
      `[auth] AUTH_MODE=entra mais variables manquantes : ${missing.join(', ')}.\n`
      + '       Renseignez-les dans .env, ou utilisez AUTH_MODE=disabled pour un aperçu local.'
    );
    process.exit(1);
  }
}

if (AUTH_MODE === 'local') {
  if (!SESSION_SECRET) {
    console.error(
      '[auth] AUTH_MODE=local mais SESSION_SECRET est vide.\n'
      + '       Générez-en un : openssl rand -base64 48'
    );
    process.exit(1);
  }
  // Sans ce contrôle, le serveur démarrerait normalement et personne ne
  // pourrait entrer : la panne n'apparaîtrait qu'au premier essai de
  // connexion, sans indiquer sa cause.
  if (countUsers() === 0) {
    console.error(
      `[auth] AUTH_MODE=local mais aucun compte dans ${USERS_FILE}.\n`
      + '       Créez-en un : node scripts/creer-utilisateur.mjs <identifiant> "<Nom>" <INITIALES>'
    );
    process.exit(1);
  }
}

const secretKey = new TextEncoder().encode(SESSION_SECRET || 'x'.repeat(32));
const issuer = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;
const authorizeUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize`;
const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
const logoutUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/logout`;
const jwks = TENANT_ID
  ? createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`))
  : null;

const base64url = (buf) => buf.toString('base64url');

function normalize(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/gi, '')
    .toLowerCase();
}

/**
 * Rattache l'utilisateur SSO à l'un des 6 membres de l'équipe MAJ GT2
 * (correspondance sur le nom affiché, insensible aux accents et à la casse).
 * Si aucune correspondance, on dérive des initiales depuis le nom du jeton.
 */
function mapToTeamMember(name, email) {
  const nName = normalize(name);
  const found = TEAM_INFO.find((t) => {
    const nt = normalize(t.name);
    return nt === nName || (nName && (nt.includes(nName) || nName.includes(nt)));
  });
  if (found) return { name: found.name, initials: found.initials, isTeamMember: true };
  const parts = String(name || email || '?').trim().split(/[\s.@_-]+/).filter(Boolean);
  const initials = ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
  return { name: name || email, initials, isTeamMember: false };
}

async function createSession(res, user) {
  const token = await new SignJWT(user)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(secretKey);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: PUBLIC_URL.startsWith('https://'),
    maxAge: 12 * 60 * 60 * 1000,
    path: BASE_PATH,
  });
}

/**
 * Identité factice utilisée uniquement lorsque AUTH_MODE=disabled.
 * Le paramètre `?as=Prénom Nom` permet de simuler plusieurs personnes pour
 * démontrer la synchronisation temps réel avant la mise en place du SSO.
 */
export function previewUser(as) {
  const name = (typeof as === 'string' && as.trim()) || 'Utilisateur (aperçu)';
  const mapped = mapToTeamMember(name, '');
  return {
    sub: `apercu:${mapped.name}`,
    name: mapped.name,
    initials: mapped.initials,
    email: '',
    isTeamMember: mapped.isTeamMember,
  };
}

/** Lit et vérifie la session depuis la valeur brute du cookie. */
export async function verifySessionCookie(raw, previewAs) {
  if (AUTH_MODE === 'disabled') return previewUser(previewAs);
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, secretKey);
    return payload;
  } catch {
    return null;
  }
}

/** Middleware Express : exige une session valide sur les routes protégées. */
export function requireAuth(req, res, next) {
  if (AUTH_MODE === 'disabled') {
    req.user = previewUser(req.query?.as);
    return next();
  }
  verifySessionCookie(req.cookies?.[SESSION_COOKIE]).then((user) => {
    if (!user) {
      // En mode `local`, la page de connexion est un écran du SPA : il n'y a
      // aucune URL serveur vers laquelle rediriger, et rediriger vers une
      // route inexistante donnerait une boucle. Le client lit ce 401 et
      // affiche le formulaire.
      if (AUTH_MODE === 'entra' && !req.path.startsWith('/api/')) {
        return res.redirect(`${BASE_PATH}auth/login`);
      }
      return res.status(401).json({ error: 'non authentifié' });
    }
    req.user = user;
    next();
  });
}

// --- Limitation des tentatives (mode local) ------------------------------
// Le SSO offrait cette protection sans qu'on ait à y penser : Entra bloque
// un compte après quelques échecs. Sur des comptes locaux, sans limiteur, un
// mot de passe de 12 caractères finit par céder à la force brute.
//
// La clé combine l'identifiant ET l'adresse IP : bloquer sur le seul
// identifiant permettrait à n'importe qui de verrouiller volontairement le
// compte d'un collègue en saisissant cinq mots de passe faux.
const MAX_ECHECS = 5;
const DUREE_BLOCAGE_MS = 15 * 60 * 1000;
const tentatives = new Map();

function cleTentative(req, username) {
  return `${req.ip}|${String(username || '').toLowerCase()}`;
}

/** Secondes restantes avant de pouvoir réessayer, 0 si non bloqué. */
function secondesDeBlocage(cle) {
  const entree = tentatives.get(cle);
  if (!entree) return 0;
  if (Date.now() > entree.jusqua) {
    tentatives.delete(cle);
    return 0;
  }
  if (entree.echecs < MAX_ECHECS) return 0;
  return Math.ceil((entree.jusqua - Date.now()) / 1000);
}

function noterEchec(cle) {
  // Purge des entrées expirées : sans elle, une rafale d'identifiants
  // inventés ferait grossir la table sans fin.
  if (tentatives.size > 500) {
    const maintenant = Date.now();
    for (const [k, v] of tentatives) if (maintenant > v.jusqua) tentatives.delete(k);
  }
  const entree = tentatives.get(cle) || { echecs: 0, jusqua: 0 };
  entree.echecs += 1;
  entree.jusqua = Date.now() + DUREE_BLOCAGE_MS;
  tentatives.set(cle, entree);
}

export function registerAuthRoutes(app) {
  app.get('/api/auth/config', (req, res) => {
    res.json({ mode: AUTH_MODE });
  });

  app.get('/api/me', requireAuth, (req, res) => {
    res.json({ user: req.user, mode: AUTH_MODE });
  });

  if (AUTH_MODE === 'disabled') {
    app.get('/auth/login', (req, res) => res.redirect(BASE_PATH));
    app.get('/auth/logout', (req, res) => res.redirect(BASE_PATH));
    return;
  }

  // --- Comptes locaux ----------------------------------------------------
  // Deux routes suffisent : le reste de la chaîne (JWT de session, cookie,
  // poignée de main Socket.io) est commun aux trois modes.
  if (AUTH_MODE === 'local') {
    app.post('/auth/login', async (req, res) => {
      const username = String(req.body?.username || '').trim();
      const password = String(req.body?.password || '');

      const cle = cleTentative(req, username);
      const attente = secondesDeBlocage(cle);
      if (attente) {
        return res.status(429).json({
          error: `Trop de tentatives. Réessayez dans ${Math.ceil(attente / 60)} minute(s).`,
        });
      }

      const user = getUser(username);
      if (!verifyPassword(password, user)) {
        noterEchec(cle);
        console.warn(`[auth] échec de connexion pour « ${username} » depuis ${req.ip}`);
        // Message unique dans les deux cas : distinguer « compte inconnu »
        // de « mot de passe faux » livrerait la moitié de la réponse.
        return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
      }

      tentatives.delete(cle);
      const session = {
        sub: `local:${user.username}`,
        email: user.email || '',
        name: user.name,
        initials: user.initials,
        isTeamMember: TEAM_INFO.some((t) => t.name === user.name),
      };
      await createSession(res, session);
      res.json({ ok: true, user: session });
    });

    // POST et non GET, contrairement au SSO : une déconnexion accessible en
    // GET se déclenche par une simple balise <img> pointant vers cette URL.
    app.post('/auth/logout', (req, res) => {
      res.clearCookie(SESSION_COOKIE, { path: BASE_PATH });
      res.json({ ok: true });
    });

    return;
  }

  // --- SSO Entra ID ------------------------------------------------------
  // Conservé intégralement et fonctionnel : repasser au SSO ne demande que
  // AUTH_MODE=entra dans .env, sans toucher au code.

  // --- Étape 1 : redirection vers Microsoft ---
  app.get('/auth/login', (req, res) => {
    const stateParam = base64url(crypto.randomBytes(24));
    const nonce = base64url(crypto.randomBytes(24));
    const codeVerifier = base64url(crypto.randomBytes(48));
    const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());

    // Le contexte de la transaction voyage dans un cookie court, signé par
    // le même secret que la session : rien n'est stocké côté serveur.
    new SignJWT({ stateParam, nonce, codeVerifier, next: req.query.next || BASE_PATH })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(secretKey)
      .then((tx) => {
        res.cookie(TX_COOKIE, tx, {
          httpOnly: true,
          sameSite: 'lax',
          secure: PUBLIC_URL.startsWith('https://'),
          maxAge: 10 * 60 * 1000,
          path: BASE_PATH,
        });
        const url = new URL(authorizeUrl);
        url.searchParams.set('client_id', CLIENT_ID);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('redirect_uri', REDIRECT_URI);
        url.searchParams.set('response_mode', 'query');
        url.searchParams.set('scope', 'openid profile email');
        url.searchParams.set('state', stateParam);
        url.searchParams.set('nonce', nonce);
        url.searchParams.set('code_challenge', codeChallenge);
        url.searchParams.set('code_challenge_method', 'S256');
        res.redirect(url.toString());
      })
      .catch((err) => {
        console.error('[auth] échec de préparation du login :', err);
        res.status(500).send('Erreur d\'authentification.');
      });
  });

  // --- Étape 2 : retour de Microsoft, échange du code ---
  app.get('/auth/callback', async (req, res) => {
    try {
      if (req.query.error) {
        return res.status(401).send(`Authentification refusée : ${req.query.error_description || req.query.error}`);
      }
      const txRaw = req.cookies?.[TX_COOKIE];
      if (!txRaw) return res.redirect(`${BASE_PATH}auth/login`);
      const { payload: tx } = await jwtVerify(txRaw, secretKey);
      res.clearCookie(TX_COOKIE, { path: BASE_PATH });

      if (!req.query.state || req.query.state !== tx.stateParam) {
        return res.status(400).send('Paramètre « state » invalide.');
      }

      const body = new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: String(req.query.code || ''),
        redirect_uri: REDIRECT_URI,
        code_verifier: tx.codeVerifier,
        scope: 'openid profile email',
      });
      const tokenRes = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!tokenRes.ok) {
        const detail = await tokenRes.text();
        console.error('[auth] échange de code refusé :', detail);
        return res.status(401).send('Échec de l\'authentification auprès de Microsoft.');
      }
      const tokens = await tokenRes.json();

      const { payload: claims } = await jwtVerify(tokens.id_token, jwks, {
        issuer,
        audience: CLIENT_ID,
      });
      if (claims.nonce !== tx.nonce) return res.status(400).send('Paramètre « nonce » invalide.');

      const email = String(claims.preferred_username || claims.email || '').toLowerCase();
      if (ALLOWED_EMAILS.length && !ALLOWED_EMAILS.includes(email)) {
        console.warn(`[auth] accès refusé pour ${email} (hors liste ALLOWED_EMAILS)`);
        return res
          .status(403)
          .send('Votre compte n\'est pas autorisé à accéder à cet outil. Contactez l\'équipe Dev SIFA.');
      }

      const mapped = mapToTeamMember(claims.name, email);
      await createSession(res, {
        sub: claims.sub,
        email,
        name: mapped.name,
        initials: mapped.initials,
        isTeamMember: mapped.isTeamMember,
      });
      const next = typeof tx.next === 'string' && tx.next.startsWith('/') ? tx.next : BASE_PATH;
      res.redirect(next);
    } catch (err) {
      console.error('[auth] erreur de callback :', err);
      res.status(500).send('Erreur d\'authentification..');
    }
  });

  app.get('/auth/logout', (req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: BASE_PATH });
    const url = new URL(logoutUrl);
    url.searchParams.set('post_logout_redirect_uri', PUBLIC_URL);
    res.redirect(url.toString());
  });
}

export { AUTH_MODE, SESSION_COOKIE };
