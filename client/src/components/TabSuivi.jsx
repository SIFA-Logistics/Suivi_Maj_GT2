/**
 * Onglet « 📋 Suivi général ».
 *
 * Reprend la structure de l'outil d'origine : évaluation globale, cartes de
 * synthèse, puis la section « Préparation & communication (global) » avec
 * ses 4 groupes de tâches.
 */

import { useRef } from 'react';
import { computeStats } from '../lib/format.js';
import { ItemsList, Stars, SummaryCards } from './Shared.jsx';
import RealtimeBar from './RealtimeBar.jsx';

export default function TabSuivi({ state, team, sync }) {
  const fileInputRef = useRef(null);
  const globalItems = state.global.flatMap((g) => g.items);
  const stats = computeStats(globalItems);

  async function handleReset() {
    const ok = window.confirm(
      'Réinitialiser toutes les données (statuts, assignations, notes, notes par étoiles, équipe présente) '
      + 'pour TOUTE L\'ÉQUIPE ?\n\n'
      + "L'état actuel sera automatiquement archivé sur le serveur avant réinitialisation : rien n'est perdu."
    );
    if (!ok) return;
    const res = await sync.reset();
    if (res?.ok) sync.setNotice(`🔄 Réinitialisation effectuée. Archive créée : ${res.archive}`);
    else sync.setNotice(`⚠️ Échec de la réinitialisation : ${res?.error || 'erreur inconnue'}`);
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `suivi_maj_gt2_${state.version}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        const ok = window.confirm(
          'Remplacer les données de TOUTE L\'ÉQUIPE par le contenu de ce fichier ?\n\n'
          + "L'état actuel sera archivé sur le serveur au préalable."
        );
        if (!ok) return;
        const res = await sync.importState(parsed);
        if (!res?.ok) sync.setNotice(`⚠️ Import refusé : ${res?.error || 'erreur inconnue'}`);
      } catch {
        window.alert('Fichier invalide.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  return (
    <div className="tab-page active">
      <RealtimeBar
        connected={sync.connected}
        presence={sync.presence}
        user={sync.user}
        lastSavedAt={sync.lastSavedAt}
      />

      <div className="toolbar">
        <button className="btn-danger" onClick={handleReset}>🔄 Tout réinitialiser</button>
        <button className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
          Importer une copie
        </button>
        <input
          type="file"
          id="fileInput"
          accept="application/json"
          ref={fileInputRef}
          onChange={handleImport}
        />
        <button className="btn-secondary" onClick={handleExport}>Exporter une copie</button>
      </div>

      <div className="global-rating-card">
        <h2>⭐ Évaluation globale de la MAJ</h2>
        <div className="rating-row" style={{ marginBottom: 0 }}>
          <Stars
            value={state.globalRating}
            onChange={(v) => sync.setPath(['globalRating'], v)}
          />
          <span className="rating-value">
            {state.globalRating ? `${state.globalRating}/5` : 'non noté'}
          </span>
        </div>
      </div>

      <div className="summary">
        <SummaryCards stats={stats} />
      </div>

      <section className="phase">
        <h2>📋 Préparation &amp; communication (global)</h2>
        {state.global.map((group, gi) => (
          <div key={group.group}>
            <h3 style={{ fontSize: '13px', color: '#5b6b82', margin: '14px 0 4px' }}>
              {group.group}
            </h3>
            <ItemsList
              items={group.items}
              team={team}
              basePath={['global', gi, 'items']}
              setPath={sync.setPath}
            />
          </div>
        ))}
      </section>

      <div className="footnote">
        Les données sont enregistrées sur le serveur et partagées en direct avec toute l'équipe :
        aucune action de sauvegarde n'est nécessaire. « Exporter une copie » reste disponible pour
        archiver un instantané en dehors de l'outil.
      </div>
    </div>
  );
}
