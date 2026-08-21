/**
 * État initial partagé de l'outil « Suivi MAJ GTrans2 ».
 *
 * Reprend à l'identique les données de l'outil HTML d'origine :
 *  - les 4 groupes de tâches globales (onglet « Suivi général »),
 *  - les 8 sites et leurs 15 étapes standard (onglet « Déploiement par site »),
 *  - les valeurs par défaut du générateur de planning,
 *  - les deux modèles d'emails.
 */

export const APP_VERSION = '1.2024.7.64';

/** Équipe MAJ GT2 (6 personnes) avec leurs initiales. */
export const TEAM_INFO = [
  { name: "Baha Marzougui", initials: "BM" },
  { name: "François Mendes", initials: "FM" },
  { name: "Maher Haboubi", initials: "MH" },
  { name: "Michel L'Hotellier", initials: "ML" },
  { name: "Océane Coissac", initials: "OC" },
  { name: "Patrice Sécheresse", initials: "PS" },
];

const GLOBAL_GROUPS = [
  {
    group: "Préparation du déplacement",
    items: [
      "Envoyer un mail au responsable d'agence pour annoncer la venue",
      "Définir les personnes qui feront le déplacement",
      "Réserver l'hôtel + transport",
    ],
  },
  {
    group: "Communication",
    items: [
      "Faire le planning",
      "Envoyer les invitations (calendrier)",
      "Envoyer le mail planning MAJ (listes de diffusion)",
      "Envoyer le planning au PO",
      "Envoyer le message sur Dev/Tech du planning",
    ],
  },
  {
    group: "Préparation du texte de MAJ",
    items: [
      "Créer le nouveau document de MAJ",
      "Partager au dév & PO",
      "Envoyer à Julien pour publication sur Workvivo",
    ],
  },
  {
    group: "Phase de test",
    items: [
      "Créer le répertoire de centralisation des scripts (\\\\sifainfo03\\Developpement\\MAJ)",
      "Définir et communiquer la date limite de génération des scripts SQL",
      "Création BDD de test SM",
      "Création BDD de test AF",
      "Déployer les scripts de mise à jour sur les BDD de test",
      "Générer un exécutable pour les tests",
      "Tests en français",
      "Tests en anglais",
      "Test sur SM",
      "Test sur AF",
    ],
  },
];

const ZONE_DEFS = [
  { name: "Europe", icon: "🇪🇺" },
  { name: "Antilles", icon: "🏝️" },
  { name: "Réunion", icon: "🌋" },
  { name: "Mayotte", icon: "/logo_Mayotte.jpg" },
  { name: "États-Unis", icon: "🇺🇸" },
  { name: "Singapour", icon: "🇸🇬" },
  { name: "Polynésie française", icon: "🌴" },
  { name: "Nouvelle-Calédonie", icon: "🌴" },
];

const ZONE_ITEMS = [
  "Envoyer le message de MAJ pour redémarrer les serveurs (si applicable)",
  "Générer/ouvrir la procédure d'installation pour ce site",
  "Créer le nouvel onglet patch dans le fichier GT2 - Patch.xlsx",
  "[GT] Désactiver les tâches planifiées",
  "[GT] Suppression des patchs (D et C)",
  "[GT] Déposer la procédure d'installation",
  "[GT] Lancer l'installation",
  "[GT] Nettoyage des fichiers (si nécessaire)",
  "[GT] Déposer les patchs",
  "[GT] Déployer les scripts de mise à jour",
  "[GT] Déposer la documentation",
  "[TSE] Lancer GT2 sur les TS",
  "[TSE] Redémarrer les serveurs",
  "[TSE] Créer la doc dans GT2",
  "[GT] Relancer les tâches planifiées",
];

const PLANNING_ZONES = [
  { icon: "🇪🇺", name: "Europe", date: "2026-06-20", time: "14:00" },
  { icon: "🏝️", name: "Antilles", date: "2026-06-24", time: "07:30" },
  { icon: "🌋", name: "Réunion", date: "2026-06-25", time: "18:00" },
  { icon: "/logo_Mayotte.jpg", name: "Mayotte", date: "2026-06-25", time: "18:00" },
  { icon: "🇺🇸", name: "États-Unis", date: "2026-06-29", time: "10:00" },
  { icon: "🇸🇬", name: "Singapour", date: "2026-06-29", time: "16:00" },
  { icon: "🌴", name: "Polynésie française", date: "2026-07-01", time: "14:00" },
  { icon: "🌴", name: "Nouvelle-Calédonie", date: "2026-07-01", time: "14:00" },
];

const EMAIL_AGENCY = `Objet : Déplacement sur site pour la MAJ GTrans2 le lundi 8 décembre

Bonjour,

Nous prévoyons une mise à jour de GTrans2 le XXXXX.
Dans un souci d'amélioration continue, il serait bénéfique que nous soyons présents sur place lors de cette mise à jour et du déploiement en production.
Cela nous permettrait d'être plus réactifs et d'optimiser notre manière de procéder.
Lors de la dernière mise à jour, nous nous étions déplacés et cela s'était bien passé.
Les utilisateurs semblaient apprécier notre présence.
Pour cette nouvelle mise à jour, j'aimerais venir accompagné de deux ou trois développeurs dans vos locaux.
L'idée serait de positionner des développeurs sur les différents pôles (douane, réception, exploitation, etc.) afin d'assurer un suivi précis et efficace.
Merci de me faire savoir si cela te convient.`;

const EMAIL_PLANNING = `Objet : Planification des prochaines mises à jour Gtrans

Bonjour,

Nous souhaitons vous informer que des mises à jour GTrans seront déployées à partir de la semaine prochaine.
Vous trouverez ci-dessous le planning détaillé des interventions, organisé par région :

[Insérer ici l'image du planning générée dans l'onglet « Générateur de planning »]

N'hésitez pas à revenir vers nous si vous avez des questions ou besoin d'informations complémentaires.`;

/**
 * Construit un état neuf. Chaque tâche reçoit un identifiant stable
 * (`g-<groupe>-<index>` / `z-<site>-<index>`) utilisé comme clé React
 * et comme cible des patches temps réel.
 */
export function createInitialState() {
  return {
    version: APP_VERSION,
    lastUpdated: null,
    globalRating: 0,
    global: GLOBAL_GROUPS.map((g, gi) => ({
      group: g.group,
      items: g.items.map((txt, ii) => ({
        id: `g-${gi}-${ii}`,
        txt,
        status: 'todo',
        assigned: '',
      })),
    })),
    zones: ZONE_DEFS.map((z, zi) => ({
      name: z.name,
      icon: z.icon,
      notes: '',
      rating: 0,
      performedBy: [],
      startTime: '',
      endTime: '',
      items: ZONE_ITEMS.map((txt, ii) => ({
        id: `z-${zi}-${ii}`,
        txt,
        status: 'todo',
        assigned: '',
      })),
    })),
    planning: {
      version: APP_VERSION,
      prepDate: '2026-06-09',
      prepDateExtra: 'au soir',
      // Fin d'intervalle facultative : vide, seule la date de début s'affiche.
      prepEndDate: '',
      prepEndDateExtra: '',
      prepPoints: `Compléter le fichier de script par équipe
Renseigner correctement la tâche associée
Vérifier les procédures et vues modifiées`,
      testDate: '2026-06-10',
      testDateExtra: 'après-midi',
      testEndDate: '',
      testEndDateExtra: '',
      testPoints: `Exécutable généré le 10/06 à 12h
Validation des développements
Détection des anomalies`,
      bannerText:
        "Une personne de chaque équipe doit assurer une surveillance des tickets à partir de 7h le lundi 22/06.",
      zones: PLANNING_ZONES.map((z) => ({ ...z })),
    },
    emails: {
      agency: EMAIL_AGENCY,
      planning: EMAIL_PLANNING,
    },
  };
}
