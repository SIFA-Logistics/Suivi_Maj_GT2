/**
 * Serveur applicatif « Suivi MAJ GTrans2 » — SIFA Logistics.
 *
 * Express sert le frontend React compilé et l'API ; Socket.io diffuse
 * instantanément (push, sans interrogation périodique) chaque modification
 * à tous les clients connectés.
 */

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import { Server as SocketServer } from 'socket.io';
import * as store from './store.js';
import { TEAM_INFO, APP_VERSION } from './initialState.js';
import { registerAuthRoutes, requireAuth, verifySessionCookie, AUTH_MODE, SESSION_COOKIE } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const CLIENT_DIR = process.env.CLIENT_DIR || path.resolve(__dirname, '../../client/dist');

store.load();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(cookieParser());
app.use(express.json({ limit: '5mb' }));

// Sonde de santé : utilisée par docker-compose (healthcheck) et par un
// éventuel reverse proxy. Volontairement non authentifiée.
app.get('/healthz', (req, res) => {
  res.json({ ok: true, rev: store.getRev(), lastSavedAt: store.getLastSavedAt() });
});

registerAuthRoutes(app);

/** Constantes de l'application (équipe, version) — utiles au frontend. */
app.get('/api/config', requireAuth, (req, res) => {
  res.json({ team: TEAM_INFO, appVersion: APP_VERSION, authMode: AUTH_MODE });
});

/** Export d'une copie JSON de l'état (bouton « Exporter une copie »). */
app.get('/api/state', requireAuth, (req, res) => {
  res.json(store.getState());
});

const server = http.createServer(app);
const io = new SocketServer(server, {
  // Websocket d'abord : pas de long-polling, donc aucune latence
  // d'interrogation périodique.
  transports: ['websocket', 'polling'],
  path: '/socket.io',
  maxHttpBufferSize: 5e6,
});

// --- Authentification des sockets ---------------------------------------
// La poignée de main Socket.io réutilise le cookie de session HTTP : un
// client non authentifié ne peut ni lire ni modifier l'état.
io.use(async (socket, next) => {
  try {
    const raw = parseCookie(socket.handshake.headers.cookie || '')[SESSION_COOKIE];
    // `as` n'est pris en compte qu'en mode aperçu (AUTH_MODE=disabled).
    const user = await verifySessionCookie(raw, socket.handshake.auth?.as);
    if (!user) return next(new Error('non authentifié'));
    socket.data.user = {
      sub: user.sub,
      name: user.name,
      initials: user.initials,
      email: user.email,
    };
    next();
  } catch (err) {
    next(new Error('non authentifié'));
  }
});

function parseCookie(header) {
  const out = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

/** Liste des personnes connectées (dédoublonnée par utilisateur). */
function presenceList() {
  const byUser = new Map();
  for (const socket of io.sockets.sockets.values()) {
    const u = socket.data.user;
    if (!u) continue;
    const key = u.sub || u.email || u.name;
    const entry = byUser.get(key);
    if (entry) entry.tabs += 1;
    else byUser.set(key, { name: u.name, initials: u.initials, tabs: 1 });
  }
  return [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

function broadcastPresence() {
  io.emit('presence', presenceList());
}

io.on('connection', (socket) => {
  const user = socket.data.user;

  socket.emit('init', {
    state: store.getState(),
    rev: store.getRev(),
    user,
    lastSavedAt: store.getLastSavedAt(),
    presence: presenceList(),
  });
  broadcastPresence();

  /**
   * Modification granulaire. Le client applique l'opération localement de
   * façon optimiste ; le serveur la valide, l'applique à l'état de référence
   * et la rediffuse à tous les autres clients — immédiatement.
   */
  socket.on('op', (op, ack) => {
    const applied = store.applyOp(op);
    if (!applied) {
      if (typeof ack === 'function') ack({ ok: false, error: 'opération refusée' });
      return;
    }
    const payload = { ...applied, by: { name: user.name, initials: user.initials } };
    socket.broadcast.emit('op', payload);
    if (typeof ack === 'function') ack({ ok: true, rev: applied.rev });
  });

  /** Réinitialisation : archivage automatique puis état neuf pour tous. */
  socket.on('reset', async (payload, ack) => {
    try {
      const { archivePath } = await store.reset(user.name);
      io.emit('state:full', {
        state: store.getState(),
        rev: store.getRev(),
        reason: 'reset',
        by: { name: user.name, initials: user.initials },
        archive: archivePath,
      });
      if (typeof ack === 'function') ack({ ok: true, archive: archivePath });
    } catch (err) {
      console.error('[socket] échec de la réinitialisation :', err);
      if (typeof ack === 'function') ack({ ok: false, error: String(err.message || err) });
    }
  });

  /** Import d'une copie JSON : remplace l'état pour toute l'équipe. */
  socket.on('import', async (payload, ack) => {
    try {
      await store.replaceState(payload?.state, user.name);
      io.emit('state:full', {
        state: store.getState(),
        rev: store.getRev(),
        reason: 'import',
        by: { name: user.name, initials: user.initials },
      });
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: String(err.message || err) });
    }
  });

  socket.on('disconnect', () => {
    broadcastPresence();
  });
});

// --- Frontend compilé ----------------------------------------------------
app.use(requireAuth, express.static(CLIENT_DIR, { index: false, maxAge: '1h' }));
app.get('*', requireAuth, (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io')) return next();
  res.sendFile(path.join(CLIENT_DIR, 'index.html'), (err) => {
    if (err) {
      res
        .status(500)
        .send('Frontend introuvable. Lancez « npm run build » dans /client, ou utilisez l\'image Docker.');
    }
  });
});

server.listen(PORT, () => {
  console.log(`[server] Suivi MAJ GT2 démarré sur le port ${PORT} (auth : ${AUTH_MODE})`);
});

// Arrêt propre : on vide la sauvegarde différée avant de quitter, pour ne
// perdre aucune modification récente.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    console.log(`[server] ${sig} reçu, sauvegarde puis arrêt...`);
    try {
      await store.flush();
    } catch (err) {
      console.error('[server] échec de la sauvegarde finale :', err);
    }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
