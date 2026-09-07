#!/usr/bin/env node
/**
 * Administration des comptes locaux (AUTH_MODE=local).
 *
 * L'outil n'a pas d'interface d'administration : en ajouter une supposerait
 * un rôle « administrateur », des écrans et des règles de délégation, pour
 * six comptes qui changent une fois par an. Ce script tient ce rôle.
 *
 *   node scripts/creer-utilisateur.mjs <identifiant> "<Nom Complet>" <INIT> [email]
 *   node scripts/creer-utilisateur.mjs --liste
 *   node scripts/creer-utilisateur.mjs --supprimer <identifiant>
 *
 * Le mot de passe n'est jamais passé en argument : il se retrouverait dans
 * l'historique du shell et resterait visible de tout le système par un
 * simple `ps`. Il est demandé en saisie masquée, puis confirmé.
 */

import readline from 'node:readline';
import { hashPassword, loadUsers, saveUsers, USERS_FILE } from '../src/users.js';
import { TEAM_INFO } from '../src/initialState.js';

const LONGUEUR_MINIMALE = 12;

function usage(code = 1) {
  console.log(`
Usage :
  node scripts/creer-utilisateur.mjs <identifiant> "<Nom Complet>" <INITIALES> [email]
  node scripts/creer-utilisateur.mjs --liste
  node scripts/creer-utilisateur.mjs --supprimer <identifiant>

Exemple :
  node scripts/creer-utilisateur.mjs vberthelemy "Vincent Berthelemy" VB vberthelemy@sifalogistics.com

Fichier des comptes : ${USERS_FILE}
`);
  process.exit(code);
}

/**
 * Lecteur de lignes utilisé quand l'entrée n'est pas un terminal. Il est
 * partagé entre les deux saisies : deux interfaces successives sur le même
 * flux se disputeraient les lignes, et la seconde n'en verrait aucune.
 */
let lignesEntree = null;
function lireLigneBrute() {
  if (!lignesEntree) {
    lignesEntree = readline
      .createInterface({ input: process.stdin, terminal: false })[Symbol.asyncIterator]();
  }
  return lignesEntree.next().then(({ value }) => value ?? '');
}

/**
 * Saisie masquée. `readline` écrit normalement chaque caractère frappé ;
 * on neutralise cette écriture après l'affichage de la question, de sorte
 * que rien n'apparaisse à l'écran ni ne reste dans le défilement du terminal.
 *
 * Hors terminal — entrée redirigée, script d'installation — il n'y a rien à
 * masquer, et le mode `terminal: true` ne rendrait jamais la main : on lit
 * alors la ligne telle quelle.
 */
function demanderMotDePasse(question) {
  if (!process.stdin.isTTY) {
    process.stdout.write(question);
    return lireLigneBrute().then((reponse) => {
      process.stdout.write('\n');
      return reponse;
    });
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    let questionAffichee = false;
    rl._writeToOutput = function (chaine) {
      if (!questionAffichee) {
        rl.output.write(chaine);
        if (chaine.includes(question)) questionAffichee = true;
      }
    };
    rl.question(question, (reponse) => {
      rl.output.write('\n');
      rl.close();
      resolve(reponse);
    });
  });
}

function lister() {
  const users = loadUsers();
  const identifiants = Object.keys(users).sort();
  if (!identifiants.length) {
    console.log(`Aucun compte dans ${USERS_FILE}.`);
    return;
  }
  console.log(`${identifiants.length} compte(s) dans ${USERS_FILE} :\n`);
  for (const id of identifiants) {
    const u = users[id];
    console.log(`  ${id.padEnd(18)} ${(u.initials || '??').padEnd(4)} ${u.name || ''}${u.email ? `  <${u.email}>` : ''}`);
  }
}

function supprimer(identifiant) {
  const cle = String(identifiant || '').trim().toLowerCase();
  if (!cle) usage();
  const users = loadUsers();
  if (!users[cle]) {
    console.error(`Aucun compte « ${cle} ».`);
    process.exit(1);
  }
  delete users[cle];
  saveUsers(users);
  console.log(`Compte « ${cle} » supprimé. Il reste ${Object.keys(users).length} compte(s).`);
}

async function creer(identifiant, nom, initiales, email) {
  const cle = String(identifiant).trim().toLowerCase();
  if (!cle || !nom || !initiales) usage();

  // Les six membres et leurs initiales viennent du terrain : on ne corrige
  // pas en silence, on signale la divergence et on laisse trancher.
  const membre = TEAM_INFO.find((t) => t.name.toLowerCase() === String(nom).trim().toLowerCase());
  if (membre && membre.initials !== initiales.toUpperCase()) {
    console.warn(
      `Attention : « ${nom} » est déclaré avec les initiales « ${membre.initials} » `
      + `dans initialState.js, et vous saisissez « ${initiales.toUpperCase()} ».`
    );
  }
  if (!membre) {
    console.warn(`Attention : « ${nom} » ne figure pas parmi les membres de initialState.js.`);
  }

  const users = loadUsers();
  const existe = Boolean(users[cle]);
  if (existe) console.log(`Le compte « ${cle} » existe : son mot de passe va être remplacé.`);

  const motDePasse = await demanderMotDePasse('Mot de passe : ');
  if (motDePasse.length < LONGUEUR_MINIMALE) {
    console.error(`Mot de passe trop court : ${LONGUEUR_MINIMALE} caractères minimum.`);
    process.exit(1);
  }
  const confirmation = await demanderMotDePasse('Confirmation  : ');
  if (motDePasse !== confirmation) {
    console.error('Les deux saisies diffèrent. Aucun changement.');
    process.exit(1);
  }

  const { salt, hash } = hashPassword(motDePasse);
  users[cle] = {
    name: String(nom).trim(),
    initials: String(initiales).trim().toUpperCase(),
    email: String(email || '').trim(),
    salt,
    hash,
  };
  saveUsers(users);
  console.log(`Compte « ${cle} » ${existe ? 'mis à jour' : 'créé'} dans ${USERS_FILE}.`);
}

const [commande, ...reste] = process.argv.slice(2);
if (!commande || commande === '--aide' || commande === '-h') usage(0);
else if (commande === '--liste') lister();
else if (commande === '--supprimer') supprimer(reste[0]);
else await creer(commande, reste[0], reste[1], reste[2]);
