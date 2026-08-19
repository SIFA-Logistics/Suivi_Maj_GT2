/**
 * Drapeaux dessinés en SVG, repris à l'identique de l'outil d'origine.
 *
 * Motif (commentaire du fichier HTML original) : les emojis « drapeau pays »
 * ne s'affichent pas correctement sous Windows — ils sont rendus sous forme
 * de code lettres (EU/US/SG) au lieu du drapeau. On les remplace donc par
 * des SVG inline.
 */

const EU = (
  <span className="icon-flag" title="Europe">
    <svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg">
      <rect width="60" height="40" fill="#003399" />
      <g fill="#ffcc00">
        <circle cx="30" cy="8" r="1.7" /><circle cx="38.9" cy="10.8" r="1.7" /><circle cx="44.4" cy="18.1" r="1.7" />
        <circle cx="44.4" cy="21.9" r="1.7" /><circle cx="38.9" cy="29.2" r="1.7" /><circle cx="30" cy="32" r="1.7" />
        <circle cx="21.1" cy="29.2" r="1.7" /><circle cx="15.6" cy="21.9" r="1.7" /><circle cx="15.6" cy="18.1" r="1.7" />
        <circle cx="21.1" cy="10.8" r="1.7" />
      </g>
    </svg>
  </span>
);

const US = (
  <span className="icon-flag" title="États-Unis">
    <svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg">
      <rect width="60" height="40" fill="#fff" />
      <g fill="#b22234">
        <rect y="0" width="60" height="3.1" /><rect y="6.2" width="60" height="3.1" /><rect y="12.3" width="60" height="3.1" />
        <rect y="18.5" width="60" height="3.1" /><rect y="24.6" width="60" height="3.1" /><rect y="30.8" width="60" height="3.1" />
        <rect y="36.9" width="60" height="3.1" />
      </g>
      <rect width="24" height="21.5" fill="#3c3b6e" />
    </svg>
  </span>
);

const SG = (
  <span className="icon-flag" title="Singapour">
    <svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg">
      <rect width="60" height="20" fill="#ed2939" />
      <rect y="20" width="60" height="20" fill="#fff" />
      <circle cx="15" cy="10" r="6.5" fill="#fff" />
      <circle cx="18" cy="10" r="5.4" fill="#ed2939" />
      <g fill="#fff">
        <circle cx="25" cy="4" r="1.3" /><circle cx="29.5" cy="7.2" r="1.3" /><circle cx="27.8" cy="12.6" r="1.3" />
        <circle cx="20.2" cy="12.6" r="1.3" /><circle cx="18.5" cy="7.2" r="1.3" />
      </g>
    </svg>
  </span>
);

const FLAG_ICONS = {
  '🇪🇺': EU,
  '🇺🇸': US,
  '🇸🇬': SG,
};

/** Équivalent React de la fonction `renderIcon()` de l'outil d'origine. */
export function Icon({ icon }) {
  if (FLAG_ICONS[icon]) return FLAG_ICONS[icon];
  if (/^\/.+\.(png|jpe?g|svg|webp|gif)$/i.test(icon || '')) {
    return (
      <span className="icon-flag">
        <img src={icon} alt="" />
      </span>
    );
  }
  return <>{icon || '📍'}</>;
}
