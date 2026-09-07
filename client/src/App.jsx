/**
 * Composant racine : en-tête, onglets et aiguillage vers les 4 pages.
 * L'apparence reprend strictement celle de l'outil HTML d'origine.
 */

import { useEffect, useState } from 'react';
import { useSharedState } from './lib/realtime.js';
import TabSuivi from './components/TabSuivi.jsx';
import TabDeploiement from './components/TabDeploiement.jsx';
import TabPlanning from './components/TabPlanning.jsx';
import TabEmails from './components/TabEmails.jsx';
import Login from './components/Login.jsx';

// Prefixe de deploiement, derive de `base` dans vite.config.js.
// Vite ne reecrit pas les chemins absolus du JSX : sans ce prefixe, le
// navigateur viserait la racine du domaine, servie par un autre projet.
const BASE = import.meta.env.BASE_URL;

const TABS = [
  { id: 'suivi', label: '📋 Suivi général' },
  { id: 'deploiement', label: '📍 Déploiement par site' },
  { id: 'planning', label: '🗓️ Générateur de planning' },
  { id: 'emails', label: '✉️ Emails' },
];

export default function App() {
  const [tab, setTab] = useState('suivi');
  const [team, setTeam] = useState([]);
  // Le mode d'authentification décide de la façon de se déconnecter : le SSO
  // part vers Microsoft par un GET, les comptes locaux effacent le cookie
  // par un POST.
  const [authMode, setAuthMode] = useState(null);
  const sync = useSharedState();

  useEffect(() => {
    fetch(`${BASE}api/config`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((cfg) => {
        setTeam(cfg.team || []);
        setAuthMode(cfg.authMode || null);
      })
      .catch(() => setTeam([]));
  }, [sync.user]);

  /** Déconnexion des comptes locaux : le cookie effacé, on repart à zéro. */
  async function seDeconnecter() {
    try {
      await fetch(`${BASE}auth/logout`, { method: 'POST', credentials: 'include' });
    } finally {
      window.location.reload();
    }
  }

  const { state, user } = sync;
  const others = sync.presence.filter((p) => p.name !== user?.name);

  // L'écran de connexion passe avant le test de `state` : une session qui
  // expire en cours d'usage laisserait sinon l'interface affichée mais figée,
  // sans aucun moyen de se reconnecter.
  if (sync.authError) {
    return <Login onConnected={sync.reconnect} />;
  }

  if (!state) {
    return (
      <div className="app-header">
        <div>
          <h1>Outils MAJ GT2 — SIFA</h1>
          <p>Connexion au serveur de synchronisation...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="app-header">
        <div className="header-left">
          <img src={`${BASE}logo_SIFA.png`} alt="SIFA Logistics" className="header-logo" />
          <div>
            <h1>Outils MAJ GT2 — SIFA</h1>
            <p>Suivi, déploiement par site et génération du planning, dans un seul endroit.</p>
          </div>
        </div>
        <div className="header-right">
          <div className="tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`tab-btn${tab === t.id ? ' active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* Pastilles des collègues connectés : visibles depuis tous les
              onglets, contrairement à la barre détaillée de l'onglet Suivi. */}
          {others.length > 0 && (
            <div className="presence-list" title="Collègues connectés">
              {others.map((p) => (
                <span
                  className="presence-badge"
                  key={p.name}
                  title={`${p.name}${p.tabs > 1 ? ` — ${p.tabs} onglets` : ''}`}
                >
                  {p.initials}
                </span>
              ))}
            </div>
          )}
          {user && (
            <div className="user-chip" title={user.email || user.name}>
              <span className="badge">{user.initials}</span>
              <span>
                {user.name}
                <br />
                {authMode === 'local' ? (
                  <button type="button" className="lien-deconnexion" onClick={seDeconnecter}>
                    Se déconnecter
                  </button>
                ) : (
                  <a href={`${BASE}auth/logout`}>Se déconnecter</a>
                )}
              </span>
            </div>
          )}
        </div>
      </div>

      {!sync.connected && (
        <div className="offline-veil">
          ⚠️ Connexion au serveur perdue — vos modifications ne sont plus partagées ni enregistrées.
          Reconnexion automatique en cours.
        </div>
      )}

      {tab === 'suivi' && <TabSuivi state={state} team={team} sync={sync} />}
      {tab === 'deploiement' && (
        <TabDeploiement state={state} team={team} sync={sync} active />
      )}
      {tab === 'planning' && <TabPlanning state={state} sync={sync} active />}
      {tab === 'emails' && <TabEmails state={state} sync={sync} active />}

      {sync.notice && <div className="toast">{sync.notice}</div>}
    </>
  );
}
