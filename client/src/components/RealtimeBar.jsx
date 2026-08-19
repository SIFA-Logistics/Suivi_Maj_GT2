/**
 * Barre d'état de la synchronisation temps réel.
 *
 * Elle occupe la place — et reprend le style — des deux barres de l'outil
 * d'origine (« Partage d'équipe via Confluence » et « Sauvegarde
 * automatique »), devenues inutiles : les données sont désormais partagées
 * et enregistrées côté serveur en continu.
 */

export default function RealtimeBar({ connected, presence, user, lastSavedAt }) {
  const savedLabel = lastSavedAt
    ? new Date(lastSavedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : 'aucun changement depuis le démarrage';

  const others = presence.filter((p) => p.name !== user?.name);

  return (
    <div className={`realtime-bar ${connected ? 'connected' : 'disconnected'}`}>
      <div className="realtime-status">
        {connected ? '🟢 Synchronisation temps réel active' : '🔴 Connexion au serveur perdue'}
        <small>
          {connected
            ? `Dernier enregistrement serveur : ${savedLabel} · ${presence.length} personne${presence.length > 1 ? 's' : ''} connectée${presence.length > 1 ? 's' : ''}`
            : 'Vos modifications ne sont plus partagées. Reconnexion automatique en cours...'}
        </small>
      </div>
      <div className="realtime-actions">
        {presence.length === 0 && <span className="presence-empty">Personne d'autre en ligne</span>}
        <div className="presence-list">
          {user && (
            <span className="presence-badge self" title={`${user.name} (vous)`}>
              {user.initials}
            </span>
          )}
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
      </div>
    </div>
  );
}
