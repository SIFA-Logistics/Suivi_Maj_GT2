/**
 * Onglet « 📍 Déploiement par site ».
 *
 * Reproduit l'original : synthèse par site, onglets de sites, temps passé,
 * présence de l'équipe, liste des 15 étapes standard, notation par étoiles,
 * texte libre et génération du poster d'incident en PNG.
 *
 * Le site sélectionné est une préférence de navigation locale : il n'est
 * volontairement pas partagé, chacun peut consulter le site de son choix.
 */

import { useEffect, useRef, useState } from 'react';
import {
  computeDurationMinutes,
  computeStats,
  formatDuration,
  starsText,
  totalDurationMinutes,
} from '../lib/format.js';
import { Icon } from '../lib/flags.jsx';
import { ItemsList, Stars, SummaryCards, SyncedInput } from './Shared.jsx';

export default function TabDeploiement({ state, team, sync, active }) {
  const [activeZone, setActiveZone] = useState(0);
  const posterRef = useRef(null);

  const zoneIndex = Math.min(activeZone, state.zones.length - 1);
  const zone = state.zones[zoneIndex];

  // Texte libre : saisie locale immédiate (le poster se met à jour en direct,
  // comme dans l'outil d'origine), envoi au serveur différé.
  const [notesDraft, setNotesDraft] = useState(zone?.notes || '');
  const notesFocused = useRef(false);
  const notesTimer = useRef(null);

  useEffect(() => {
    if (!notesFocused.current) setNotesDraft(zone?.notes || '');
  }, [zone?.notes, zoneIndex]);

  useEffect(() => () => clearTimeout(notesTimer.current), []);

  function onNotesChange(e) {
    const v = e.target.value;
    setNotesDraft(v);
    clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => sync.setPath(['zones', zoneIndex, 'notes'], v), 250);
  }

  async function exportIncidentPNG() {
    const { default: html2canvas } = await import('html2canvas');
    const zoneName = zone.name.replace(/[^a-z0-9]+/gi, '_');
    const canvas = await html2canvas(posterRef.current, { scale: 2, backgroundColor: '#ffffff' });
    const a = document.createElement('a');
    a.download = `maj_gt2_${zoneName}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  }

  if (!zone) return null;

  const siteItems = state.zones.flatMap((z) => z.items);
  const zoneStats = computeStats(zone.items);
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`tab-page${active ? ' active' : ''}`}>
      <div className="summary">
        <SummaryCards
          stats={computeStats(siteItems)}
          extraDurationMinutes={totalDurationMinutes(state.zones)}
        />
      </div>

      <section className="phase">
        <h2>📍 Avancement par site</h2>
        <div className="phase-progress">
          Chaque site suit les mêmes étapes standard (GT + TSE). Sélectionnez un site pour
          voir/mettre à jour son avancement.
        </div>

        <div className="zone-tabs">
          {state.zones.map((z, zi) => {
            const done = z.items.filter((i) => i.status === 'done').length;
            return (
              <div
                key={z.name}
                className={`zone-tab${zi === zoneIndex ? ' active' : ''}`}
                onClick={() => setActiveZone(zi)}
              >
                <Icon icon={z.icon} /> {z.name} ({done}/{z.items.length})
              </div>
            );
          })}
        </div>

        <div>
          <div className="zone-panel active">
            <div className="time-track">
              <div className="label-title">⏱️ Temps passé sur ce site</div>
              <div className="field">
                <label>Début :</label>
                <SyncedInput
                  type="time"
                  value={zone.startTime || ''}
                  onCommit={(v) => sync.setPath(['zones', zoneIndex, 'startTime'], v)}
                />
              </div>
              <div className="field">
                <label>Fin :</label>
                <SyncedInput
                  type="time"
                  value={zone.endTime || ''}
                  onCommit={(v) => sync.setPath(['zones', zoneIndex, 'endTime'], v)}
                />
              </div>
              <span className="duration-badge">
                Durée : {formatDuration(computeDurationMinutes(zone))}
              </span>
            </div>

            <div className="team-present">
              <div className="label-title">✅ Personnes ayant réalisé la MAJ sur ce site</div>
              {team.map((person) => {
                const checked = zone.performedBy.includes(person.name);
                return (
                  <label
                    key={person.name}
                    className={`initial-check${checked ? ' checked' : ''}`}
                    title={person.name}
                    onClick={(e) => {
                      e.preventDefault();
                      sync.togglePath(['zones', zoneIndex, 'performedBy'], person.name);
                    }}
                  >
                    <input type="checkbox" checked={checked} readOnly style={{ display: 'none' }} />
                    <span className="badge">{person.initials}</span>
                    <span className="fullname">{person.name}</span>
                  </label>
                );
              })}
            </div>

            <ItemsList
              items={zone.items}
              team={team}
              basePath={['zones', zoneIndex, 'items']}
              setPath={sync.setPath}
            />
          </div>
        </div>
      </section>

      <div className="incident-block">
        <h2>⭐ Évaluation de la MAJ — <span>{zone.name}</span></h2>
        <div className="rating-row">
          <span className="rating-label">Note pour ce site :</span>
          <Stars
            value={zone.rating}
            onChange={(v) => sync.setPath(['zones', zoneIndex, 'rating'], v)}
          />
          <span className="rating-value">{zone.rating ? `${zone.rating}/5` : 'non noté'}</span>
        </div>

        <h2>📝 Texte libre — <span>{zone.name}</span></h2>
        <div className="hint">
          Notez ici tout incident, remarque, ou simplement que la MAJ est terminée pour ce site,
          puis générez une image prête à partager (mail, Teams, Workvivo...).
        </div>
        <textarea
          id="incidentNotes"
          placeholder="Ex : MAJ terminée sans incident. / Le script de migration SM a échoué à l'étape X, redémarrage nécessaire..."
          value={notesDraft}
          onChange={onNotesChange}
          onFocus={() => { notesFocused.current = true; }}
          onBlur={() => {
            notesFocused.current = false;
            clearTimeout(notesTimer.current);
            sync.setPath(['zones', zoneIndex, 'notes'], notesDraft);
          }}
        />
        <div className="incident-actions">
          <button className="btn-primary" onClick={exportIncidentPNG}>📥 Générer l'image</button>
        </div>

        <div id="incidentPosterWrap">
          <div id="incidentPoster" ref={posterRef}>
            <div className="ip-header">
              <div className="ip-logo"><span className="dot" />SIFA LOGISTICS</div>
              <div className="ip-date">{`${dateStr} à ${timeStr}`}</div>
            </div>
            <h3>
              <span className="ip-icon"><Icon icon={zone.icon} /></span>
              <span>MAJ GT2 — {zone.name}</span>
            </h3>
            <div className="ip-progress">
              {`Avancement : ${zoneStats.done}/${zoneStats.total} tâches (${zoneStats.pct}%)`}
              {zoneStats.blocked ? ` — ${zoneStats.blocked} bloquée(s)` : ''}
            </div>
            <div className="ip-team">
              {zone.performedBy.length
                ? `Réalisé par : ${zone.performedBy.join(', ')}`
                : 'Réalisé par : —'}
            </div>
            <div className="ip-duration">
              Durée sur site : {formatDuration(computeDurationMinutes(zone))}
            </div>
            <div className="ip-rating">{zone.rating ? starsText(zone.rating) : ''}</div>
            <div className="ip-notes">{notesDraft.trim()}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
