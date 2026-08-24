/**
 * Authentification SSO Microsoft Entra ID (OpenID Connect, flux
 * « Authorization Code » avec PKCE), sans dépendance à un service tiers.
 *
 * Deux modes, pilotés par la variable d'environnement AUTH_MODE :
 *  - `entra`    : SSO obligatoire (mode de production).
 *  - `disabled` : aucune authentification — réservé à l'aperçu et aux
 *                 tests en local, tant que l'inscription d'application
 *                 Entra ID n'est pas créée.
 *
 * La session est un JWT HS256 signé localement, déposé dans un cookie
 * HttpOnly. Il n'y a donc aucun magasin de sessions à administrer.
 */

import crypto from 'node:crypto';
import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';
import { TEAM_INFO } from './initialState.js';

const AUTH_MODE = (process.env.AUTH_MODE || 'entra').trim().toLowerCase();
const TENANT_ID = process.env.ENTRA_TENANT_ID || '';
const CLIENT_ID = process.env.ENTRA_CLIENT_ID || '';
const CLIENT_SECRET = process.env.ENTRA_CLIENT_SECRET || '';
const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://localhost:8080').replace(/\/$/, '');
const REDIRECT_URI = `${PUBLIC_URL}/auth/callback`;
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
    path: '/baha/',
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
      if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'non authentifié' });
      return res.redirect('/auth/login');
    }
    req.user = user;
    next();
  });
}

export function registerAuthRoutes(app) {
  app.get('/api/auth/config', (req, res) => {
    res.json({ mode: AUTH_MODE });
  });

  app.get('/api/me', requireAuth, (req, res) => {
    res.json({ user: req.user, mode: AUTH_MODE });
  });

  if (AUTH_MODE === 'disabled') {
    app.get('/auth/login', (req, res) => res.redirect('/'));
    app.get('/auth/logout', (req, res) => res.redirect('/'));
    return;
  }

  // --- Étape 1 : redirection vers Microsoft ---
  app.get('/auth/login', (req, res) => {
    const stateParam = base64url(crypto.randomBytes(24));
    const nonce = base64url(crypto.randomBytes(24));
    const codeVerifier = base64url(crypto.randomBytes(48));
    const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());

    // Le contexte de la transaction voyage dans un cookie court, signé par
    // le même secret que la session : rien n'est stocké côté serveur.
    new SignJWT({ stateParam, nonce, codeVerifier, next: req.query.next || '/' })
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
          path: '/baha/',
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
      if (!txRaw) return res.redirect('/auth/login');
      const { payload: tx } = await jwtVerify(txRaw, secretKey);
      res.clearCookie(TX_COOKIE, { path: '/baha/' });

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
      const next = typeof tx.next === 'string' && tx.next.startsWith('/') ? tx.next : '/';
      res.redirect(next);
    } catch (err) {
      console.error('[auth] erreur de callback :', err);
      res.status(500).send('Erreur d\'authentification.');
    }
  });

  app.get('/auth/logout', (req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: '/baha/' });
    const url = new URL(logoutUrl);
    url.searchParams.set('post_logout_redirect_uri', PUBLIC_URL);
    res.redirect(url.toString());
  });
}

export { AUTH_MODE, SESSION_COOKIE };
