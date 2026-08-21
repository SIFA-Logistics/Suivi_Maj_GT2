/**
 * Onglet « 🗓️ Générateur de planning ».
 *
 * Formulaire à gauche, aperçu du poster à droite, export PNG via html2canvas.
 * Contrairement à l'outil d'origine où ces valeurs n'étaient que locales,
 * elles font désormais partie de l'état partagé : le planning est commun à
 * toute l'équipe et se met à jour en direct.
 */

import { useRef } from 'react';
import { formatDateFR, formatDateShortFR, formatTimeFR, linesToArray } from '../lib/format.js';
import { Icon } from '../lib/flags.jsx';
import { SyncedInput, SyncedTextarea } from './Shared.jsx';

/**
 * « Mardi 09/06 au soir - Vendredi 19/06 au soir ».
 * La date de fin est facultative : sans elle, seule la date de début s'affiche,
 * comme avant l'ajout de l'intervalle.
 */
function formatPhaseRange(startDate, startExtra, endDate, endExtra) {
  const start = `${formatDateFR(startDate)}${startExtra ? ` ${startExtra}` : ''}`;
  if (!endDate) return start;
  return `${start} - ${formatDateFR(endDate)}${endExtra ? ` ${endExtra}` : ''}`;
}

export default function TabPlanning({ state, sync, active }) {
  const posterRef = useRef(null);
  const p = state.planning;
  const set = (key, value) => sync.setPath(['planning', key], value);

  async function exportPNG() {
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(posterRef.current, { scale: 2, backgroundColor: '#ffffff' });
    const a = document.createElement('a');
    a.download = `planning_maj_${p.version}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  }

  const prepExtra = (p.prepDateExtra || '').trim();
  const testExtra = (p.testDateExtra || '').trim();
  const prepEndExtra = (p.prepEndDateExtra || '').trim();
  const testEndExtra = (p.testEndDateExtra || '').trim();

  return (
    <div className={`tab-page${active ? ' active' : ''}`}>
      <div className="layout">
        <div className="form-panel">
          <h3 className="section-title">Informations générales</h3>
          <label>Version de la MAJ</label>
          <SyncedInput value={p.version} onCommit={(v) => set('version', v)} />

          <h3 className="section-title">Préparation</h3>
          <label>Date</label>
          <div className="date-row">
            <SyncedInput type="date" value={p.prepDate} onCommit={(v) => set('prepDate', v)} />
            <SyncedInput
              value={p.prepDateExtra}
              onCommit={(v) => set('prepDateExtra', v)}
              placeholder="précision (ex : au soir)"
            />
          </div>
          <label>Date de fin (facultative)</label>
          <div className="date-row">
            <SyncedInput
              type="date"
              value={p.prepEndDate}
              onCommit={(v) => set('prepEndDate', v)}
            />
            <SyncedInput
              value={p.prepEndDateExtra}
              onCommit={(v) => set('prepEndDateExtra', v)}
              placeholder="précision (ex : au soir)"
            />
          </div>
          <label>Points clés (une ligne par point)</label>
          <SyncedTextarea
            id="prepPoints"
            value={p.prepPoints}
            onCommit={(v) => set('prepPoints', v)}
          />

          <h3 className="section-title">Début des tests</h3>
          <label>Date</label>
          <div className="date-row">
            <SyncedInput type="date" value={p.testDate} onCommit={(v) => set('testDate', v)} />
            <SyncedInput
              value={p.testDateExtra}
              onCommit={(v) => set('testDateExtra', v)}
              placeholder="précision (ex : après-midi)"
            />
          </div>
          <label>Date de fin (facultative)</label>
          <div className="date-row">
            <SyncedInput
              type="date"
              value={p.testEndDate}
              onCommit={(v) => set('testEndDate', v)}
            />
            <SyncedInput
              value={p.testEndDateExtra}
              onCommit={(v) => set('testEndDateExtra', v)}
              placeholder="précision (ex : après-midi)"
            />
          </div>
          <label>Points clés (une ligne par point)</label>
          <SyncedTextarea
            id="testPoints"
            value={p.testPoints}
            onCommit={(v) => set('testPoints', v)}
          />

          <h3 className="section-title">Sites / zones</h3>
          <div>
            {p.zones.map((z, i) => (
              <div className="zone-block" key={i}>
                <button
                  className="remove-btn"
                  onClick={() => sync.removePath(['planning', 'zones'], i)}
                >
                  Supprimer
                </button>
                <label>Icône (emoji)</label>
                <SyncedInput
                  value={z.icon}
                  onCommit={(v) => sync.setPath(['planning', 'zones', i, 'icon'], v)}
                />
                <label>Nom du site</label>
                <SyncedInput
                  value={z.name}
                  onCommit={(v) => sync.setPath(['planning', 'zones', i, 'name'], v)}
                />
                <div className="row">
                  <div>
                    <label>Date</label>
                    <SyncedInput
                      type="date"
                      value={z.date}
                      onCommit={(v) => sync.setPath(['planning', 'zones', i, 'date'], v)}
                    />
                  </div>
                  <div>
                    <label>Heure</label>
                    <SyncedInput
                      type="time"
                      value={z.time}
                      onCommit={(v) => sync.setPath(['planning', 'zones', i, 'time'], v)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button
            className="btn-add"
            onClick={() =>
              sync.insertPath(['planning', 'zones'], { icon: '📍', name: 'Nouveau site', date: '', time: '' })
            }
          >
            + Ajouter un site
          </button>

          <h3 className="section-title">Bandeau d'alerte (bas de page)</h3>
          <SyncedTextarea value={p.bannerText} onCommit={(v) => set('bannerText', v)} />

          <button className="btn-export" onClick={exportPNG}>📥 Télécharger l'image (PNG)</button>
        </div>

        <div id="posterWrap">
          <div id="poster" ref={posterRef}>
            <div className="m-band">
              <div className="m-brand">
                <span className="badge"><img src="/logo_SIFA.png" alt="SIFA Logistics" /></span>
                <span className="word">SIFA Logistics</span>
              </div>
              <div className="m-title">
                <span className="warn"><span className="warn-tri" /><span className="warn-mark">!</span></span>
                <span className="txt">MAJ {p.version}</span>
                <span className="warn"><span className="warn-tri" /><span className="warn-mark">!</span></span>
              </div>
              <div className="m-doc-label">
                {p.zones.length} site{p.zones.length > 1 ? 's' : ''} planifié{p.zones.length > 1 ? 's' : ''}
              </div>
            </div>

            <div className="m-body">
              <div className="d-phases">
                <div className="d-phase">
                  <h4>📋 Préparation</h4>
                  <div className="date-line">
                    📅 {formatPhaseRange(p.prepDate, prepExtra, p.prepEndDate, prepEndExtra)}
                  </div>
                  <ul>
                    {linesToArray(p.prepPoints).map((l, i) => <li key={i}>{l}</li>)}
                  </ul>
                </div>
                <div className="d-phase test">
                  <h4>🧪 Début des tests</h4>
                  <div className="date-line">
                    📅 {formatPhaseRange(p.testDate, testExtra, p.testEndDate, testEndExtra)}
                  </div>
                  <ul>
                    {linesToArray(p.testPoints).map((l, i) => <li key={i}>{l}</li>)}
                  </ul>
                </div>
              </div>

              <div className="r-track-wrap">
                <div className="r-track-line" />
                <div className="r-stations">
                  {p.zones.map((z, i) => (
                    <div className="r-station" key={i}>
                      <div className="date">{formatDateShortFR(z.date)} · {formatTimeFR(z.time)}</div>
                      <span className="dot" />
                      <div className="card">
                        <div className="icon-row"><span className="slot"><Icon icon={z.icon} /></span></div>
                        <div className="name">{z.name}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="m-stamp-wrap">
                <div className="m-stamp"><div className="m-stamp-inner">
                  <span className="bang">!</span>
                  <span className="txt">{p.bannerText}</span>
                </div></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
