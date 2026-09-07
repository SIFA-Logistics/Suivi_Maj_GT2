/**
 * Couche de synchronisation temps réel (Socket.io).
 *
 * Remplace le mécanisme de partage de l'outil d'origine (sauvegarde dans un
 * fichier local + copier/coller manuel via Confluence). Le principe :
 *
 *  1. le client applique la modification localement, immédiatement (optimiste),
 *  2. il l'émet au serveur,
 *  3. le serveur l'applique à l'état de référence et la pousse aux autres
 *     clients connectés — sans interrogation périodique.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';

/**
 * Applique une opération de façon immuable : seuls les nœuds situés sur le
 * chemin sont recopiés, ce qui permet à React de ne re-rendre que le
 * nécessaire.
 */
export function applyOpImmutable(root, op) {
  const { type, path } = op;
  if (!Array.isArray(path) || path.length === 0) return root;

  const clone = (node) => (Array.isArray(node) ? node.slice() : { ...node });
  const next = clone(root);
  let cursor = next;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    const child = cursor[key];
    if (child === null || typeof child !== 'object') return root;
    cursor[key] = clone(child);
    cursor = cursor[key];
  }
  const key = path[path.length - 1];

  switch (type) {
    case 'set':
      cursor[key] = op.value;
      break;
    case 'toggleArray': {
      const arr = Array.isArray(cursor[key]) ? cursor[key].slice() : [];
      const idx = arr.indexOf(op.value);
      if (idx === -1) arr.push(op.value);
      else arr.splice(idx, 1);
      cursor[key] = arr;
      break;
    }
    case 'insert': {
      const arr = Array.isArray(cursor[key]) ? cursor[key].slice() : [];
      const at = Number.isInteger(op.index) ? op.index : arr.length;
      arr.splice(Math.max(0, Math.min(at, arr.length)), 0, op.value);
      cursor[key] = arr;
      break;
    }
    case 'remove': {
      const arr = Array.isArray(cursor[key]) ? cursor[key].slice() : [];
      if (!Number.isInteger(op.index) || op.index < 0 || op.index >= arr.length) return root;
      arr.splice(op.index, 1);
      cursor[key] = arr;
      break;
    }
    default:
      return root;
  }
  return next;
}

export function useSharedState() {
  const socketRef = useRef(null);
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(false);
  const [user, setUser] = useState(null);
  const [presence, setPresence] = useState([]);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    // `?as=Prénom Nom` : identité de démonstration, ignorée dès que le SSO
    // est actif (AUTH_MODE=entra).
    const previewAs = new URLSearchParams(window.location.search).get('as');
    const socket = io({
      path: `${import.meta.env.BASE_URL}socket.io`,
      transports: ['websocket', 'polling'],
      withCredentials: true,
      auth: previewAs ? { as: previewAs } : {},
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setAuthError(null);
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (err) => {
      setConnected(false);
      if (String(err.message).includes('non authentifié')) {
        setAuthError('Session expirée — reconnexion nécessaire.');
      }
    });

    socket.on('init', (payload) => {
      setState(payload.state);
      setUser(payload.user);
      setPresence(payload.presence || []);
      setLastSavedAt(payload.lastSavedAt || null);
    });

    // Modification poussée par un collègue : appliquée immédiatement.
    socket.on('op', (op) => {
      setState((prev) => (prev ? applyOpImmutable(prev, op) : prev));
      setLastSavedAt(new Date().toISOString());
    });

    socket.on('state:full', (payload) => {
      setState(payload.state);
      const who = payload.by?.name || 'un collègue';
      setNotice(
        payload.reason === 'reset'
          ? `🔄 Données réinitialisées par ${who} (l'état précédent a été archivé sur le serveur).`
          : `📥 Données remplacées par l'import de ${who}.`
      );
    });

    socket.on('presence', (list) => setPresence(list || []));

    return () => socket.close();
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  /** Émet une opération et l'applique localement sans attendre le serveur. */
  const apply = useCallback((op) => {
    setState((prev) => (prev ? applyOpImmutable(prev, op) : prev));
    socketRef.current?.emit('op', op, (res) => {
      if (res && res.ok) setLastSavedAt(new Date().toISOString());
      else if (res && !res.ok) console.warn('[realtime] opération refusée par le serveur', op, res.error);
    });
  }, []);

  const setPath = useCallback((path, value) => apply({ type: 'set', path, value }), [apply]);
  const togglePath = useCallback((path, value) => apply({ type: 'toggleArray', path, value }), [apply]);
  const insertPath = useCallback(
    (path, value, index) => apply({ type: 'insert', path, value, index }),
    [apply]
  );
  const removePath = useCallback((path, index) => apply({ type: 'remove', path, index }), [apply]);

  const reset = useCallback(
    () =>
      new Promise((resolve) => {
        socketRef.current?.emit('reset', {}, (res) => resolve(res));
      }),
    []
  );

  const importState = useCallback(
    (next) =>
      new Promise((resolve) => {
        socketRef.current?.emit('import', { state: next }, (res) => resolve(res));
      }),
    []
  );

  /**
   * Relance la poignée de main après une connexion réussie.
   *
   * Socket.io réessaie tout seul après une coupure réseau, mais pas après un
   * refus du middleware d'authentification : l'erreur est jugée définitive.
   * Sans cet appel, le formulaire disparaîtrait sans que l'application ne se
   * charge, et il faudrait recharger la page à la main.
   */
  const reconnect = useCallback(() => {
    setAuthError(null);
    socketRef.current?.connect();
  }, []);

  return useMemo(
    () => ({
      state,
      connected,
      user,
      presence,
      lastSavedAt,
      authError,
      notice,
      setNotice,
      setPath,
      togglePath,
      insertPath,
      removePath,
      reset,
      importState,
      reconnect,
    }),
    [state, connected, user, presence, lastSavedAt, authError, notice, setPath, togglePath, insertPath, removePath, reset, importState, reconnect]
  );
}
