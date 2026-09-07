/**
 * Écran de connexion.
 *
 * Sert les deux modes d'authentification, pour que le passage de l'un à
 * l'autre reste une affaire de configuration serveur (AUTH_MODE) sans
 * réécriture du frontend :
 *  - `local` : formulaire identifiant + mot de passe, posté vers /auth/login ;
 *  - `entra` : redirection vers Microsoft, la saisie ayant lieu chez eux.
 *
 * Le mode vient de /api/auth/config, seule route d'authentification
 * accessible sans session — les autres exigent précisément ce qu'on n'a pas
 * encore ici.
 */

import { useEffect, useState } from 'react';

const BASE = import.meta.env.BASE_URL;

export default function Login({ onConnected }) {
  const [mode, setMode] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [erreur, setErreur] = useState(null);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  useEffect(() => {
    fetch(`${BASE}api/auth/config`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((cfg) => setMode(cfg.mode || 'local'))
      // Serveur injoignable : on affiche le formulaire plutôt qu'un écran
      // vide. La tentative de connexion donnera un message explicite.
      .catch(() => setMode('local'));
  }, []);

  async function soumettre(evenement) {
    evenement.preventDefault();
    setErreur(null);
    setEnvoiEnCours(true);
    try {
      const reponse = await fetch(`${BASE}auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });
      const corps = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        // Le serveur renvoie un message unique pour « compte inconnu » et
        // « mot de passe faux », et le message de blocage après cinq échecs.
        setErreur(corps.error || 'Connexion impossible.');
        setPassword('');
        return;
      }
      onConnected?.();
    } catch {
      setErreur('Serveur injoignable. Réessayez dans un instant.');
    } finally {
      setEnvoiEnCours(false);
    }
  }

  return (
    <div className="login-page">
      {/* Fond decoratif : la carte des liaisons SIFA, puis un voile qui
          l'estompe derriere la zone de saisie. Sans le voile, le contraste
          des champs dependrait de ce qui passe dessous. `aria-hidden` :
          rien a annoncer a un lecteur d'ecran. */}
      <div
        className="login-fond"
        aria-hidden="true"
        style={{ backgroundImage: `url(${BASE}carte_monde.webp)` }}
      />
      <div className="login-voile" aria-hidden="true" />

      <div className="login-card">
        <div className="login-brand">
          <img src={`${BASE}logo_SIFA.png`} alt="SIFA Logistics" className="login-logo" />
          <h1>Outils MAJ GT2</h1>
          <p>Suivi des mises à jour GTrans2</p>
        </div>

        {mode === null && <p className="login-attente">Chargement…</p>}

        {mode === 'entra' && (
          <>
            <p className="login-intro">
              Connectez-vous avec votre compte Microsoft SIFA.
            </p>
            <a className="btn btn-primary login-bouton" href={`${BASE}auth/login`}>
              Se connecter avec Microsoft
            </a>
          </>
        )}

        {mode === 'local' && (
          <form onSubmit={soumettre}>
            <label htmlFor="login-identifiant">Identifiant</label>
            <input
              id="login-identifiant"
              className="login-champ"
              type="text"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={envoiEnCours}
            />

            <label htmlFor="login-motdepasse">Mot de passe</label>
            <input
              id="login-motdepasse"
              className="login-champ"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={envoiEnCours}
            />

            {/* `role="alert"` : le message doit être annoncé aux lecteurs
                d'écran, qui ne voient pas son apparition autrement. */}
            {erreur && <p className="login-erreur" role="alert">{erreur}</p>}

            <button
              type="submit"
              className="btn btn-primary login-bouton"
              disabled={envoiEnCours || !username || !password}
            >
              {envoiEnCours ? 'Connexion…' : 'Se connecter'}
            </button>
            <p className="login-aide">Identifiants fournis par l&apos;équipe Dev SIFA.</p>
          </form>
        )}
      </div>
    </div>
  );
}
