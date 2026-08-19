/**
 * Composants réutilisables : contrôles de saisie synchronisés, sélecteurs de
 * statut et d'assignation, étoiles de notation, cartes de synthèse.
 *
 * Le balisage et les classes CSS reproduisent exactement ceux générés par
 * l'outil HTML d'origine.
 */

import { useEffect, useRef, useState } from 'react';
import { STATUS, statusClass, formatDuration } from '../lib/format.js';

/**
 * Champ texte partagé : la frappe est locale et instantanée, l'envoi au
 * serveur est différé (anti-rafale). Tant que le champ a le focus, une
 * modification distante ne vient pas écraser la saisie en cours — même
 * précaution que l'outil d'origine, qui testait `document.activeElement`.
 */
function useSyncedValue(remoteValue, onCommit, delay = 250) {
  const [local, setLocal] = useState(remoteValue ?? '');
  const focused = useRef(false);
  const timer = useRef(null);

  useEffect(() => {
    if (!focused.current) setLocal(remoteValue ?? '');
  }, [remoteValue]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const onChange = (e) => {
    const v = e.target.value;
    setLocal(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onCommit(v), delay);
  };

  const onFocus = () => {
    focused.current = true;
  };

  const onBlur = () => {
    focused.current = false;
    clearTimeout(timer.current);
    onCommit(local);
  };

  return { value: local, onChange, onFocus, onBlur };
}

export function SyncedTextarea({ value, onCommit, ...rest }) {
  const bind = useSyncedValue(value, onCommit);
  return <textarea {...rest} {...bind} />;
}

export function SyncedInput({ value, onCommit, type = 'text', ...rest }) {
  // Les champs date/heure émettent une valeur complète d'un coup : inutile
  // de différer, on transmet immédiatement.
  const immediate = type === 'date' || type === 'time';
  const bind = useSyncedValue(value, onCommit, immediate ? 0 : 250);
  return <input type={type} {...rest} {...bind} />;
}

export function StatusSelect({ value, onChange }) {
  return (
    <select
      className={`status ${statusClass(value)}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {STATUS.map((s) => (
        <option key={s.v} value={s.v}>
          {s.l}
        </option>
      ))}
    </select>
  );
}

export function AssigneeSelect({ value, team, onChange }) {
  return (
    <select
      className={`assignee${value ? '' : ' unassigned'}`}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Non assigné</option>
      {team.map((person) => (
        <option key={person.name} value={person.name}>
          {person.name}
        </option>
      ))}
    </select>
  );
}

/** Liste de tâches (texte + assignation + statut), identique à l'original. */
export function ItemsList({ items, team, basePath, setPath }) {
  return (
    <ul className="items">
      {items.map((item, i) => (
        <li key={item.id || i}>
          <span className="txt">{item.txt}</span>
          <AssigneeSelect
            value={item.assigned}
            team={team}
            onChange={(v) => setPath([...basePath, i, 'assigned'], v)}
          />
          <StatusSelect
            value={item.status}
            onChange={(v) => setPath([...basePath, i, 'status'], v)}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * Étoiles de notation. Comme dans l'original, recliquer sur l'étoile
 * courante remet la note à zéro.
 */
export function Stars({ value, onChange, small }) {
  return (
    <span className={`stars${small ? ' small' : ''}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`star${i <= value ? ' filled' : ''}`}
          onClick={() => onChange(value === i ? 0 : i)}
        >
          {i <= value ? '★' : '☆'}
        </span>
      ))}
    </span>
  );
}

export function SummaryCards({ stats, extraDurationMinutes }) {
  return (
    <>
      <div className="card">
        <div className="num">{stats.pct}%</div>
        <div className="label">Avancement</div>
        <div className="progress-wrap">
          <div className="progress-bar" style={{ width: `${stats.pct}%` }} />
        </div>
      </div>
      <div className="card">
        <div className="num">
          {stats.done}/{stats.total}
        </div>
        <div className="label">Tâches terminées</div>
      </div>
      <div className="card">
        <div className="num" style={{ color: 'var(--orange)' }}>{stats.inProgress}</div>
        <div className="label">En cours</div>
      </div>
      <div className="card">
        <div className="num" style={{ color: 'var(--red)' }}>{stats.blocked}</div>
        <div className="label">Bloquées</div>
      </div>
      <div className="card">
        <div className="num" style={{ color: 'var(--purple)' }}>{stats.cancelled}</div>
        <div className="label">Annulées</div>
      </div>
      {extraDurationMinutes !== undefined && (
        <div className="card">
          <div className="num">{formatDuration(extraDurationMinutes)}</div>
          <div className="label">⏱️ Temps total (somme de tous les sites)</div>
        </div>
      )}
    </>
  );
}
