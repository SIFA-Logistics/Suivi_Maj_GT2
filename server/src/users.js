/**
 * Comptes locaux : stockage et vérification des mots de passe.
 *
 * Utilisé uniquement lorsque AUTH_MODE=local. Le SSO Entra ID (AUTH_MODE=entra)
 * n'a pas besoin de ce fichier : Microsoft y tient lieu d'annuaire.
 *
 * Les comptes vivent dans `data/users.json`, volontairement SÉPARÉ de
 * `data/state.json` : l'état, lui, est diffusé en entier à chaque client à la
 * connexion (événement `init`). Une empreinte de mot de passe rangée dans
 * l'état partirait donc dans tous les navigateurs.
 *
 * Le hachage s'appuie sur `crypto.scrypt`, natif depuis Node 10 : bcrypt et
 * argon2 imposeraient une compilation native pour un gain nul à cette échelle.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_FILE = process.env.USERS_FILE
  || path.resolve(__dirname, '../data/users.json');

/** Longueur de la clé dérivée, en octets. */
const KEYLEN = 64;
/** Coût CPU de scrypt. 16384 est la valeur par défaut de Node ; la dérivation
 *  prend ~50 ms, négligeable à la connexion et coûteuse à la force brute. */
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

/**
 * Dérive une empreinte. Sans `salt`, en génère un : deux personnes ayant
 * choisi le même mot de passe n'ont alors pas la même empreinte.
 */
export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto
    .scryptSync(String(password), salt, KEYLEN, SCRYPT_OPTIONS)
    .toString('hex');
  return { salt, hash };
}

/**
 * Vérifie un mot de passe contre un compte.
 *
 * Deux précautions qui ne sont pas décoratives :
 *  - on hache même lorsque le compte est introuvable, sinon un identifiant
 *    inexistant répondrait bien plus vite qu'un mot de passe erroné, ce qui
 *    permettrait d'énumérer les comptes ;
 *  - la comparaison passe par `timingSafeEqual` et non par `===`, qui
 *    s'arrête au premier octet différent et laisse deviner l'empreinte
 *    octet par octet.
 */
export function verifyPassword(password, user) {
  if (!user?.salt || !user?.hash) {
    crypto.scryptSync(String(password), 'compte-inexistant', KEYLEN, SCRYPT_OPTIONS);
    return false;
  }
  const attempt = crypto.scryptSync(String(password), user.salt, KEYLEN, SCRYPT_OPTIONS);
  const expected = Buffer.from(user.hash, 'hex');
  if (attempt.length !== expected.length) return false;
  return crypto.timingSafeEqual(attempt, expected);
}

/** Lit le fichier de comptes. Absent ou illisible : renvoie un objet vide. */
export function loadUsers() {
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`[users] lecture de ${USERS_FILE} impossible :`, err.message);
    }
    return {};
  }
}

/**
 * Écrit le fichier de comptes. L'écriture passe par un fichier temporaire
 * puis un renommage : une coupure en cours d'écriture ne peut pas laisser un
 * users.json tronqué, qui verrouillerait tout le monde dehors.
 */
export function saveUsers(users) {
  const dir = path.dirname(USERS_FILE);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${USERS_FILE}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(users, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, USERS_FILE);
  // Le renommage conserve les droits du fichier temporaire, mais un
  // users.json préexistant garderait les siens : on les impose.
  fs.chmodSync(USERS_FILE, 0o600);
}

/** Recherche un compte, insensible à la casse de l'identifiant. */
export function getUser(username) {
  const key = String(username || '').trim().toLowerCase();
  if (!key) return null;
  const users = loadUsers();
  const found = users[key];
  return found ? { ...found, username: key } : null;
}

/** Nombre de comptes déclarés — sert au contrôle de démarrage. */
export function countUsers() {
  return Object.keys(loadUsers()).length;
}

export { USERS_FILE };
