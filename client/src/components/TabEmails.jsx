/**
 * Onglet « ✉️ Emails ».
 *
 * Deux modèles de courriels modifiables et copiables dans le presse-papiers.
 * Les textes sont désormais partagés : une correction faite par un membre de
 * l'équipe profite immédiatement aux autres.
 */

import { useState } from 'react';
import { SyncedTextarea } from './Shared.jsx';

function CopyButton({ getText }) {
  const [label, setLabel] = useState('📋 Copier le texte');

  async function copy() {
    const text = getText();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Repli pour les navigateurs sans API presse-papiers (ou hors HTTPS).
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setLabel('✅ Copié !');
    setTimeout(() => setLabel('📋 Copier le texte'), 1500);
  }

  return <button className="btn-secondary" onClick={copy}>{label}</button>;
}

export default function TabEmails({ state, sync, active }) {
  const emails = state.emails;

  return (
    <div className={`tab-page${active ? ' active' : ''}`}>
      <div className="hint" style={{ marginBottom: '16px' }}>
        Ces textes sont générés à partir des informations saisies dans l'onglet
        « Générateur de planning ». Modifiez-les si besoin avant de les copier.
      </div>

      <div className="email-card">
        <h2>📩 Mail au responsable d'agence — annonce de venue</h2>
        <SyncedTextarea
          className="email-preview"
          id="emailAgencyText"
          rows={14}
          value={emails.agency}
          onCommit={(v) => sync.setPath(['emails', 'agency'], v)}
        />
        <div className="incident-actions">
          <CopyButton getText={() => document.getElementById('emailAgencyText').value} />
        </div>
      </div>

      <div className="email-card">
        <h2>📩 Mail du planning de MAJ aux agences</h2>
        <SyncedTextarea
          className="email-preview"
          id="emailPlanningText"
          rows={12}
          value={emails.planning}
          onCommit={(v) => sync.setPath(['emails', 'planning'], v)}
        />
        <div className="incident-actions">
          <CopyButton getText={() => document.getElementById('emailPlanningText').value} />
        </div>
      </div>
    </div>
  );
}
