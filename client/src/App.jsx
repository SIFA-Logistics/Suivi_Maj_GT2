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

const TABS = [
  { id: 'suivi', label: '📋 Suivi général' },
  { id: 'deploiement', label: '📍 Déploiement par site' },
  { id: 'planning', label: '🗓️ Générateur de planning' },
  { id: 'emails', label: '✉️ Emails' },
];

export default function App() {
  const [tab, setTab] = useState('suivi');
  const [team, setTeam] = useState([]);
  const sync = useSharedState();

  useEffect(() => {
    fetch('/baha/api/config', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((cfg) => setTeam(cfg.team || []))
      .catch(() => setTeam([]));
  }, []);

  const { state, user } = sync;
  const others = sync.presence.filter((p) => p.name !== user?.name);

  if (!state) {
    return (
      <div className="app-header">
        <div>
          <h1>Outils MAJ GT2 — SIFA</h1>
          <p>
            {sync.authError
              ? `${sync.authError} `
              : 'Connexion au serveur de synchronisation...'}
            {sync.authError && <a href="/baha/auth/login" style={{ color: '#fff' }}>Se reconnecter</a>}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="app-header">
        <div className="header-left">
          <img src="/logo_SIFA.png" alt="SIFA Logistics" className="header-logo" />
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
                <a href="/baha/auth/logout">Se déconnecter</a>
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
