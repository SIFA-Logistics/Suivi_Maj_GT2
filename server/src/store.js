/**
 * Store applicatif : état partagé en mémoire, persistance sur disque
 * (simple fichier JSON) et archivage automatique à la réinitialisation.
 *
 * Aucune base de données : le fichier `data/state.json` fait foi.
 * L'écriture est atomique (écriture dans un fichier temporaire puis rename)
 * pour éviter un fichier tronqué en cas d'arrêt brutal du serveur.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createInitialState } from './initialState.js';

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const ARCHIVE_DIR = path.join(DATA_DIR, 'archives');
const SAVE_DEBOUNCE_MS = Number(process.env.SAVE_DEBOUNCE_MS || 500);

/** @type {object} état partagé, source de vérité en mémoire */
let state = createInitialState();
/** Révision incrémentée à chaque modification : sert de garde-fou côté client. */
let rev = 0;
let saveTimer = null;
let lastSavedAt = null;

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
}

/**
 * Complète un état chargé depuis le disque avec les clés apparues dans une
 * version plus récente du schéma (planning, emails...), pour qu'un ancien
 * fichier JSON reste exploitable après mise à jour de l'outil.
 */
function migrate(loaded) {
  const base = createInitialState();
  const merged = { ...base, ...loaded };
  merged.planning = { ...base.planning, ...(loaded.planning || {}) };
  if (!Array.isArray(merged.planning.zones) || merged.planning.zones.length === 0) {
    merged.planning.zones = base.planning.zones;
  }
  merged.emails = { ...base.emails, ...(loaded.emails || {}) };
  if (!Array.isArray(merged.global)) merged.global = base.global;
  if (!Array.isArray(merged.zones)) merged.zones = base.zones;
  // Les identifiants de tâches sont indispensables au rendu React : on les
  // recalcule si le fichier vient d'un export de la version HTML d'origine.
  merged.global.forEach((g, gi) =>
    (g.items || []).forEach((it, ii) => {
      if (!it.id) it.id = `g-${gi}-${ii}`;
    })
  );
  merged.zones.forEach((z, zi) => {
    if (!Array.isArray(z.performedBy)) z.performedBy = [];
    (z.items || []).forEach((it, ii) => {
      if (!it.id) it.id = `z-${zi}-${ii}`;
    });
  });
  return merged;
}

export function load() {
  ensureDirs();
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    state = migrate(JSON.parse(raw));
    console.log(`[store] état chargé depuis ${STATE_FILE}`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('[store] aucun état existant, démarrage sur un état neuf');
      saveNow();
    } else {
      // Fichier corrompu : on le met de côté plutôt que de l'écraser.
      const backup = `${STATE_FILE}.corrompu-${Date.now()}`;
      try {
        fs.renameSync(STATE_FILE, backup);
        console.error(`[store] état illisible, sauvegardé sous ${backup} :`, err.message);
      } catch {
        console.error('[store] état illisible :', err.message);
      }
      state = createInitialState();
      saveNow();
    }
  }
  return state;
}

export function getState() {
  return state;
}

export function getRev() {
  return rev;
}

export function getLastSavedAt() {
  return lastSavedAt;
}

async function saveNow() {
  ensureDirs();
  const tmp = `${STATE_FILE}.tmp`;
  const payload = JSON.stringify(state, null, 2);
  await fsp.writeFile(tmp, payload, 'utf8');
  await fsp.rename(tmp, STATE_FILE);
  lastSavedAt = new Date().toISOString();
  return lastSavedAt;
}

/** Sauvegarde différée : regroupe les rafales de modifications. */
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveNow().catch((err) => console.error('[store] échec de la sauvegarde :', err));
  }, SAVE_DEBOUNCE_MS);
}

export async function flush() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  return saveNow();
}

/** Descend dans l'état jusqu'au parent de la dernière clé du chemin. */
function resolveParent(root, pathArr) {
  let node = root;
  for (let i = 0; i < pathArr.length - 1; i++) {
    const key = pathArr[i];
    if (node === null || typeof node !== 'object') return null;
    node = node[key];
  }
  if (node === null || typeof node !== 'object') return null;
  return node;
}

/** Chemins autorisés : empêche un client d'écrire n'importe où dans l'état. */
const ALLOWED_ROOTS = new Set(['global', 'zones', 'planning', 'emails', 'globalRating', 'version']);

function isValidPath(pathArr) {
  if (!Array.isArray(pathArr) || pathArr.length === 0) return false;
  if (!ALLOWED_ROOTS.has(pathArr[0])) return false;
  return pathArr.every(
    (k) => (typeof k === 'string' && k !== '__proto__' && k !== 'constructor' && k !== 'prototype')
      || (typeof k === 'number' && Number.isInteger(k) && k >= 0)
  );
}

/**
 * Applique une opération de modification et retourne l'opération normalisée
 * à diffuser aux autres clients, ou `null` si l'opération est invalide.
 *
 * Opérations supportées :
 *  - `set`         : écrit une valeur à un chemin donné
 *  - `toggleArray` : ajoute/retire une valeur d'un tableau (présence d'équipe)
 *  - `insert`      : insère un élément dans un tableau (ajout d'un site au planning)
 *  - `remove`      : retire l'élément d'index donné d'un tableau
 */
export function applyOp(op) {
  if (!op || typeof op !== 'object') return null;
  const { type, path: p } = op;
  if (!isValidPath(p)) return null;

  const parent = resolveParent(state, p);
  if (parent === null) return null;
  const key = p[p.length - 1];

  switch (type) {
    case 'set': {
      if (!(key in parent) && !Array.isArray(parent)) return null;
      parent[key] = op.value;
      break;
    }
    case 'toggleArray': {
      const arr = parent[key];
      if (!Array.isArray(arr)) return null;
      const idx = arr.indexOf(op.value);
      if (idx === -1) arr.push(op.value);
      else arr.splice(idx, 1);
      break;
    }
    case 'insert': {
      const arr = parent[key];
      if (!Array.isArray(arr)) return null;
      const at = Number.isInteger(op.index) ? op.index : arr.length;
      arr.splice(Math.max(0, Math.min(at, arr.length)), 0, op.value);
      break;
    }
    case 'remove': {
      const arr = parent[key];
      if (!Array.isArray(arr)) return null;
      if (!Number.isInteger(op.index) || op.index < 0 || op.index >= arr.length) return null;
      arr.splice(op.index, 1);
      break;
    }
    default:
      return null;
  }

  state.lastUpdated = new Date().toISOString();
  rev += 1;
  scheduleSave();
  return { type, path: p, value: op.value, index: op.index, rev };
}

/**
 * Réinitialise l'outil. L'état courant est d'abord archivé dans
 * `data/archives/` : la réinitialisation ne détruit donc jamais rien.
 */
export async function reset(byUser) {
  ensureDirs();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const versionSlug = String(state.version || 'sans-version').replace(/[^a-z0-9.\-_]/gi, '_');
  const archivePath = path.join(ARCHIVE_DIR, `state-${versionSlug}-${stamp}.json`);
  await fsp.writeFile(
    archivePath,
    JSON.stringify({ archivedAt: new Date().toISOString(), archivedBy: byUser || null, state }, null, 2),
    'utf8'
  );
  state = createInitialState();
  rev += 1;
  await flush();
  console.log(`[store] réinitialisation par ${byUser || 'inconnu'} — archive : ${archivePath}`);
  return { rev, archivePath: path.basename(archivePath) };
}

/** Remplace l'état complet (import d'une copie JSON depuis l'interface). */
export async function replaceState(next, byUser) {
  if (!next || typeof next !== 'object') throw new Error('état invalide');
  ensureDirs();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archivePath = path.join(ARCHIVE_DIR, `avant-import-${stamp}.json`);
  await fsp.writeFile(
    archivePath,
    JSON.stringify({ archivedAt: new Date().toISOString(), archivedBy: byUser || null, state }, null, 2),
    'utf8'
  );
  state = migrate(next);
  rev += 1;
  await flush();
  return { rev };
}
