/**
 * Fonctions de calcul et de formatage, reprises à l'identique de l'outil
 * HTML d'origine afin que les affichages (durées, dates, statistiques)
 * soient rigoureusement les mêmes.
 */

export const STATUS = [
  { v: 'todo', l: 'À faire', c: 'status-todo' },
  { v: 'progress', l: 'En cours', c: 'status-progress' },
  { v: 'done', l: 'Fait', c: 'status-done' },
  { v: 'blocked', l: 'Bloqué', c: 'status-blocked' },
  { v: 'cancelled', l: 'Annulé', c: 'status-cancelled' },
];

export function statusClass(v) {
  return (STATUS.find((s) => s.v === v) || STATUS[0]).c;
}

export function parseTimeToMinutes(t) {
  if (!t) return null;
  const parts = t.split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

export function computeDurationMinutes(zone) {
  const s = parseTimeToMinutes(zone.startTime);
  const e = parseTimeToMinutes(zone.endTime);
  if (s === null || e === null) return null;
  let diff = e - s;
  if (diff < 0) diff += 24 * 60; // passage après minuit
  return diff;
}

export function formatDuration(mins) {
  if (mins === null || mins === undefined) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function totalDurationMinutes(zones) {
  return zones.reduce((sum, z) => sum + (computeDurationMinutes(z) || 0), 0);
}

export function computeStats(items) {
  const active = items.filter((i) => i.status !== 'cancelled');
  const total = active.length;
  const done = active.filter((i) => i.status === 'done').length;
  const blocked = items.filter((i) => i.status === 'blocked').length;
  const inProgress = items.filter((i) => i.status === 'progress').length;
  const cancelled = items.filter((i) => i.status === 'cancelled').length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return { total, done, blocked, inProgress, cancelled, pct };
}

export function starsText(value) {
  return '★'.repeat(value) + '☆'.repeat(5 - value);
}

export function formatDateFR(iso) {
  if (!iso) return 'jj/mm';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return 'jj/mm';
  let weekday = d.toLocaleDateString('fr-FR', { weekday: 'long' });
  weekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${weekday} ${dd}/${mm}`;
}

export function formatDateShortFR(iso) {
  if (!iso) return 'jj/mm';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return 'jj/mm';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

export function formatTimeFR(iso) {
  if (!iso) return 'hh:mm';
  const [h, m] = iso.split(':');
  if (h === undefined) return 'hh:mm';
  return m === '00' ? `${parseInt(h, 10)}h` : `${parseInt(h, 10)}h${m}`;
}

export function linesToArray(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}
