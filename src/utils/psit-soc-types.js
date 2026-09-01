// The catalogue of the SOC triage dashboard: one entry per alert type the SOC feeds us, with the
// investigation guide and the FP/TP clues the case view renders. This is data, not code: adding a
// type is adding an entry. The whole SOC Plein Sud section is strictly internal to PSIT, so its
// user-facing strings are in French - catalogue and page chrome alike (decision of 2026-08-24;
// the upstream English-only convention applies everywhere else).
//
// Type 8 (Google Workspace) is deliberately absent: out of the CIPP scope by decision of
// 2026-08-24, those alerts are triaged outside the tool. Third-party EDR alerts are equally out
// of scope; types 9-12 exist here for their Defender for Endpoint side only, which arrives
// through the Defender XDR incident feed.
//
// Default severities are exactly that: defaults, editable on the case. The external SOC states
// P-levels for types 1, 2, 6 and 11; the others carry the PSIT reading of the plan and are meant
// to be tuned from real cases.
//
// Steps that CIPP can answer carry an `evidence` key: the case view resolves it against the data
// it already holds and prints the answer under the step. A step without one is a step only a
// human can settle - calling the account holder, reading a process tree in the Defender portal -
// and it stays a plain question, which is honest.
//
// Each type declares the entities it investigates. The quick-entry drawer renders the matching
// picker from that: a consent case asks for an application, a machine case for a machine, and
// nobody is asked for an identifier they would have to go and find first. A type naming two
// entities gets two pickers, since an infostealer is a machine case and an identity case at once.
//
// This is a PUBLIC fork: no partner name, no internal tooling name goes in this file. Sources are
// named by role (external SOC), and the legitimate-RMM list ships empty here on purpose.

// RMM tooling PSIT deploys on purpose. The discriminant of type 10: a remote-access binary that is
// on this list, signed and in its standard path, is the MSP's own tooling, not a C2. Deliberately
// EMPTY in the repository: publishing the whitelisted tooling of a security dashboard tells an
// attacker which binaries get qualified as false positives. The real names are internal knowledge
// until this list is wired to CIPP's private runtime configuration (planned with the case view).
export const PSIT_LEGITIMATE_RMM = []

export const PSIT_SOC_SOURCES = {
  extsoc: 'SOC externe',
  xdr: 'Defender XDR',
  mdo: 'Defender for Office 365',
  manual: 'Saisie manuelle',
}

export const PSIT_SOC_STATUSES = [
  'new',
  'investigating',
  'qualified-fp',
  'qualified-tp',
  'qualified-btp',
  'on-hold',
  'contained',
  'closed',
]

export const PSIT_SOC_SEVERITIES = ['P1', 'P2', 'P3', 'P4']

export const PSIT_SOC_TYPES = [
  {
    id: 1,
    // MITRE ATT&CK defaults for this alert family (attack.mitre.org), correctable per case.
    attack: ['T1078'],
    source: 'extsoc',
    family: 'signin',
    entities: ['user'],
    severity: 'P4',
    label: 'Connexion suspecte',
    description:
      'Connexion depuis un pays inhabituel ou une IP signalée malveillante',
    guide: [
      { id: 'correlate', phase: 'validate', label: 'Vérifier si un dossier « voyage impossible » est déjà ouvert sur le même compte' },
      { id: 'sessions', phase: 'collect', label: 'Regrouper les connexions par adresse IP et repérer les succès', evidence: 'user.sessions' },
      { id: 'mfa', phase: 'collect', label: 'Vérifier MFA et protocole de chaque succès (client hérité ?)', evidence: 'user.signin-quality' },
      { id: 'device', phase: 'scope', label: "Vérifier l'appareil : géré, conforme, déjà vu sur ce compte" },
      { id: 'locations', phase: 'reconstruct', label: 'Confronter aux localisations nommées et au pays déclaré' },
      { id: 'client', phase: 'map', label: 'Contacter le titulaire ou le client : déplacement, VPN, roaming ?' },
    ],
    fpClues: [
      'MFA satisfaite sur le succès',
      'Appareil géré et conforme, déjà vu',
      'ASN opérateur mobile ou VPN d’entreprise',
      'Pays limitrophe ou déclaré (congés, déplacement)',
    ],
    tpClues: [
      'Succès sans MFA depuis une IP inconnue',
      'Succès après une rafale d’échecs (spray qui aboutit)',
      'ASN hébergeur ou datacenter',
      'Protocole hérité (IMAP, POP, SMTP AUTH)',
    ],
  },
  {
    id: 2,
    // MITRE ATT&CK defaults for this alert family (attack.mitre.org), correctable per case.
    attack: ['T1078', 'T1557'],
    source: 'extsoc',
    family: 'signin',
    entities: ['user'],
    severity: 'P2',
    label: 'Voyage impossible',
    description:
      'Activité simultanée depuis plusieurs pays, écart de temps impossible',
    guide: [
      { id: 'sessions', phase: 'validate', label: 'Construire les sessions par IP et mesurer l’écart de temps entre pays', evidence: 'user.sessions' },
      { id: 'aitm', phase: 'collect', label: 'Chercher la signature AiTM : même session vue de deux adresses, MFA « satisfaite » rejouée', evidence: 'user.signin-quality' },
      { id: 'devicecode', phase: 'collect', label: 'Vérifier le protocole : deviceCode = hameçonnage par code d’appareil' },
      { id: 'client', phase: 'map', label: 'Contacter le titulaire : VPN, roaming, second appareil ?' },
      { id: 'bec', phase: 'collect', label: 'Si TP : collecter le dossier BEC et dérouler la remédiation' },
    ],
    fpClues: [
      'VPN ou roaming confirmé par le titulaire',
      'Second appareil connu (mobile en itinérance)',
      'Un des deux pays est une sortie VPN d’entreprise',
    ],
    tpClues: [
      'Même identifiant de session depuis deux pays',
      'Protocole deviceCode',
      'Activité de configuration (règles, MFA) depuis le pays inattendu',
      'Écart de temps physiquement impossible sans VPN connu',
    ],
  },
  {
    id: 4,
    // MITRE ATT&CK defaults for this alert family (attack.mitre.org), correctable per case.
    attack: ['T1098'],
    source: 'extsoc',
    family: 'identity-persistence',
    entities: ['user'],
    severity: 'P2',
    label: 'Élévation de privilèges',
    description:
      'Ajout d’un rôle sensible sur un compte',
    guide: [
      { id: 'audit', phase: 'validate', label: 'Lire l’audit RoleManagement : acteur, IP source, rôle, heure', evidence: 'audit.events' },
      { id: 'actor', phase: 'map', label: 'Qualifier l’acteur : PIM, admin MSP (GDAP), ou compte utilisateur ?' },
      { id: 'target', phase: 'scope', label: 'Vérifier les rôles actuels du bénéficiaire' },
      { id: 'crosscase', phase: 'scope', label: 'Croiser avec les dossiers ouverts sur l’acteur et le bénéficiaire' },
    ],
    fpClues: [
      'Acteur = PIM ou service de provisioning',
      'Acteur = admin MSP via GDAP, heures ouvrées',
      'Ticket de changement connu',
    ],
    tpClues: [
      'Acteur = compte utilisateur standard',
      'HNO ou IP hors zone',
      'Rôle sensible (Global Reader, Privileged Auth Admin, Exchange Admin)',
      'Acteur lui-même signalé dans un autre dossier',
    ],
  },
  {
    id: 5,
    // MITRE ATT&CK defaults for this alert family (attack.mitre.org), correctable per case.
    attack: ['T1114.003', 'T1564.008'],
    source: 'extsoc',
    family: 'identity-persistence',
    entities: ['user'],
    severity: 'P2',
    label: 'Règle de boîte ou transfert',
    description:
      'Création ou modification de règle de boîte, transfert externe',
    guide: [
      { id: 'rules', phase: 'validate', label: 'Lister les règles de la boîte, règles masquées incluses', evidence: 'user.rules' },
      { id: 'targets', phase: 'collect', label: 'Qualifier chaque règle : destinataire externe ? suppression ? dossier de dissimulation ?', evidence: 'user.rules' },
      { id: 'origin', phase: 'reconstruct', label: 'Retrouver la création dans l’audit : IP, heure, hors zone ?', evidence: 'audit.events' },
      { id: 'forward', phase: 'collect', label: 'Vérifier le forward niveau boîte (ForwardingSmtpAddress)' },
    ],
    fpClues: [
      'Classement vers un dossier métier',
      'Créée depuis une IP habituelle, heures ouvrées',
      'Cohérente avec l’historique du poste',
    ],
    tpClues: [
      'Transfert ou redirection vers l’extérieur',
      'Suppression des messages entrants',
      'Déplacement vers RSS, Archive, Conversation History',
      'Créée HNO ou depuis une IP hors zone',
    ],
  },
  {
    id: 6,
    // MITRE ATT&CK defaults for this alert family (attack.mitre.org), correctable per case.
    attack: ['T1528'],
    source: 'extsoc',
    family: 'identity-persistence',
    entities: ['app', 'user'],
    severity: 'P4',
    label: 'Consentement OAuth',
    description:
      'Consentement accordé à une application tierce',
    guide: [
      { id: 'catalog', phase: 'validate', label: 'Confronter l’appId au catalogue malveillant CIPP', evidence: 'app.catalogue' },
      { id: 'scopes', phase: 'collect', label: 'Lire les permissions accordées : Mail.ReadWrite, Mail.Send, offline_access ?', evidence: 'app.scopes' },
      { id: 'publisher', phase: 'collect', label: 'Vérifier l’éditeur (vérifié ou non) et la date d’apparition', evidence: 'app.publisher' },
      { id: 'consent', phase: 'reconstruct', label: 'Retrouver le consentement dans l’audit : qui, quand, HNO ?', evidence: 'app.consent' },
    ],
    fpClues: [
      'Application métier connue de PSIT',
      'Éditeur vérifié, scopes en lecture seule',
    ],
    tpClues: [
      'Présente au catalogue malveillant',
      'Scopes messagerie + offline_access',
      'Consentement HNO, éditeur non vérifié',
      'Nom imitant Microsoft ou un outil connu',
    ],
  },
  {
    id: 7,
    // MITRE ATT&CK defaults for this alert family (attack.mitre.org), correctable per case.
    attack: ['T1098.002'],
    source: 'extsoc',
    family: 'identity-persistence',
    entities: ['user'],
    severity: 'P3',
    label: 'Compte ou accès à une boîte',
    description:
      'Ajout de compte utilisateur ou octroi d’accès à une boîte partagée, hors heures ouvrées',
    guide: [
      { id: 'audit', phase: 'validate', label: 'Retrouver la création dans l’audit : acteur, heure', evidence: 'audit.events' },
      { id: 'actor', phase: 'map', label: 'Qualifier l’acteur : provisioning RH, admin MSP, ou compte utilisateur ?' },
      { id: 'perms', phase: 'scope', label: 'Vérifier les délégations posées sur des BAL, surtout de direction' },
    ],
    fpClues: [
      'Onboarding RH (acteur = connecteur de provisioning ou admin MSP)',
      'Délégation demandée par le service concerné',
    ],
    tpClues: [
      'Créé par un compte utilisateur, HNO',
      'Délégation immédiate sur une BAL de direction',
      'Nom de compte imitant un existant',
    ],
  },
  {
    id: 9,
    // MITRE ATT&CK defaults for this alert family (attack.mitre.org), correctable per case.
    attack: ['T1204'],
    source: 'xdr',
    family: 'endpoint',
    entities: ['device'],
    severity: 'P1',
    label: 'Menace active (poste)',
    description:
      'Menace active non mitigée sur une machine, vue par Defender',
    guide: [
      { id: 'status', phase: 'validate', label: 'Vérifier le statut de remédiation dans le portail Defender', evidence: 'device.defender' },
      { id: 'hash', phase: 'collect', label: 'Qualifier le binaire : hash, signature, chemin (%temp% vs Program Files)' },
      { id: 'prevalence', phase: 'scope', label: 'Mesurer la prévalence du binaire sur le parc' },
      { id: 'identity', phase: 'scope', label: 'Pivot identité : sessions et mot de passe du titulaire de la machine' },
    ],
    fpClues: ['Remédiation en fait aboutie côté portail'],
    tpClues: [
      'Non mitigée = TP par défaut tant que le portail ne dit pas le contraire',
      'Binaire non signé dans un chemin utilisateur',
    ],
  },
  {
    id: 10,
    // MITRE ATT&CK defaults for this alert family (attack.mitre.org), correctable per case.
    attack: ['T1219'],
    source: 'xdr',
    family: 'endpoint',
    entities: ['device'],
    severity: 'P3',
    label: 'Accès distant ou service suspect',
    description:
      'Comportement de commande et contrôle bloqué, ou service suspect lancé sur un poste (ex. AnyDesk en --service)',
    guide: [
      { id: 'rmm', phase: 'validate', label: 'L’outil est-il un RMM déployé en interne (liste connue) ?' },
      { id: 'binary', phase: 'collect', label: 'Vérifier signature et chemin du binaire' },
      { id: 'service', phase: 'reconstruct', label: 'Si un service a été créé : nom, compte de lancement, date de création (récent et hors heures = persistance probable)' },
      { id: 'context', phase: 'map', label: 'Compte exécutant et heure : technicien en heures ouvrées ?', evidence: 'device.compliance' },
      { id: 'prevalence', phase: 'scope', label: 'Prévalence sur le parc du client' },
    ],
    fpClues: [
      'RMM ou agent connu (sauvegarde, antivirus), signé, chemin standard',
      'Compte exécutant = technicien, heures ouvrées',
    ],
    tpClues: [
      'Binaire non signé ou dans %temp%',
      'Exécution ou création de service hors heures ouvrées par un compte non technicien',
      'Outil d’accès distant hors liste interne',
    ],
  },
  {
    id: 11,
    // MITRE ATT&CK defaults for this alert family (attack.mitre.org), correctable per case.
    attack: ['T1204.002'],
    source: 'xdr',
    family: 'endpoint',
    entities: ['device'],
    severity: 'P3',
    label: 'Binaire ou fichier suspect',
    description:
      'Binaire, script ou fichier suspect observé sur un poste (VBS, runner, téléchargement récent)',
    guide: [
      { id: 'parent', phase: 'validate', label: 'Identifier le processus parent (Office vers wscript = TP probable)', evidence: 'device.compliance' },
      { id: 'binary', phase: 'collect', label: 'Qualifier le fichier : hash, signature, chemin, origine (mail, web, USB)' },
      { id: 'prevalence', phase: 'scope', label: 'Prévalence sur le parc' },
      { id: 'context', phase: 'scope', label: 'Autres alertes sur le poste ou sur son titulaire ?' },
      { id: 'identity', phase: 'scope', label: 'Si exécuté : pivot identité sur le titulaire de la machine' },
    ],
    fpClues: [
      'Script d’administration connu, chemin système',
      'Fichier signé d’un éditeur connu, origine légitime',
      'Prévalent sur le parc (outillage déployé)',
    ],
    tpClues: [
      'Parent = application Office ou navigateur',
      'Chemin utilisateur, téléchargé récemment, hash inconnu',
    ],
  },
  {
    id: 12,
    // MITRE ATT&CK defaults for this alert family (attack.mitre.org), correctable per case.
    attack: ['T1204.002'],
    source: 'xdr',
    family: 'endpoint',
    entities: ['device'],
    severity: 'P4',
    label: 'Détection bloquée (poste)',
    description:
      'Malware, logiciel indésirable ou scan de ports détecté et bloqué : risque résiduel faible, à confirmer',
    guide: [
      { id: 'eicar', phase: 'validate', label: 'EICAR ou fichier de test : clore en faux positif sans aller plus loin' },
      { id: 'blocked', phase: 'validate', label: 'Confirmer le blocage sur l’évidence : bloqué = risque résiduel faible', evidence: 'device.defender' },
      { id: 'hash', phase: 'collect', label: 'Qualifier le hash (détections génériques type Wacatac, Malgent) et sa prévalence' },
      { id: 'tolerated', phase: 'map', label: 'Logiciel indésirable : est-il toléré chez ce client ?' },
      { id: 'operator', phase: 'map', label: 'Scan de ports : compte exécutant et plage IP, outillage d’administration ?' },
      { id: 'context', phase: 'scope', label: 'Précédé d’une autre alerte identité ou EDR sur le même poste ?' },
    ],
    fpClues: [
      'EICAR ou fichier de test',
      'Détection bloquée, hash prévalent et bénin, aucun autre signal',
      'Logiciel toléré ou installé sciemment, détection préventive',
      'Scanner réseau des techniciens : compte connu, plage d’administration, heures ouvrées',
    ],
    tpClues: [
      'Actif ou non remédié malgré le libellé',
      'Hash inconnu, chemin utilisateur',
      'Scan depuis un poste utilisateur standard',
      'Précédé d’une alerte identité ou EDR sur le même poste',
    ],
  },
  {
    id: 15,
    // MITRE ATT&CK defaults for this alert family (attack.mitre.org), correctable per case.
    attack: ['T1555', 'T1539'],
    source: 'xdr',
    family: 'xdr',
    entities: ['device', 'user'],
    severity: 'P1',
    label: 'Infostealer',
    description:
      'Activité de vol d’identifiants sur un poste',
    guide: [
      { id: 'assume', phase: 'validate', label: 'TP jusqu’à preuve du contraire : les identifiants du poste sont considérés exposés' },
      { id: 'identity', phase: 'scope', label: 'Pivot identité immédiat : révoquer les sessions, réinitialiser le mot de passe', evidence: 'user.sessions' },
      { id: 'bec', phase: 'collect', label: 'Collecter le dossier BEC du titulaire' },
      { id: 'device', phase: 'collect', label: 'Machine : scan complet, envisager l’isolation (portail Defender)', evidence: 'device.defender' },
    ],
    fpClues: ['Rarissime : n’écarter que sur preuve (fichier de test, faux positif confirmé par MS)'],
    tpClues: ['Par défaut : agir d’abord, qualifier ensuite'],
  },
  {
    id: 18,
    // MITRE ATT&CK defaults for this alert family (attack.mitre.org), correctable per case.
    attack: ['T1566'],
    source: 'mdo',
    family: 'mail',
    entities: ['mail'],
    severity: 'P2',
    label: 'Phishing livré',
    description:
      'Phishing non bloqué, entités non purgées après livraison (ZAP incomplet)',
    guide: [
      { id: 'evidence', phase: 'validate', label: 'Lire l’évidence : networkMessageId, destinataires, objet, URLs, verdict' },
      { id: 'trace', phase: 'reconstruct', label: 'Message trace : à qui le message a réellement été livré' },
      { id: 'quarantine', phase: 'collect', label: 'Vérifier la quarantaine : déjà purgé en fait ?' },
      { id: 'block', phase: 'map', label: 'Bloquer expéditeur, domaine ou URL (Tenant Allow/Block List)' },
      { id: 'clicks', phase: 'collect', label: 'Limite : les clics Safe Links ne sont pas collectés ici, ne pas conclure « pas de clic »' },
      { id: 'identity', phase: 'scope', label: 'Si clic suspecté : pivot identité sur les destinataires' },
    ],
    fpClues: [
      'La remédiation a en fait abouti (remediationStatus)',
      'Message déjà en quarantaine',
      'Destinataire unique, URL déjà bloquée',
    ],
    tpClues: [
      'Message toujours en boîte (livré, non purgé)',
      'Plusieurs destinataires',
      'URL toujours active',
    ],
  },
  {
    // The external SOC groups three distinct actions under one subject label, and the message
    // never says which one fired. Routing them to the consent type would invent a fact the
    // source does not carry, so this type exists to find that fact first.
    id: 19,
    // MITRE ATT&CK defaults for this alert family (attack.mitre.org), correctable per case.
    attack: ['T1528'],
    source: 'extsoc',
    family: 'identity-persistence',
    entities: ['app', 'user'],
    severity: 'P4',
    label: 'Activité applicative',
    description:
      'Ajout, modification ou consentement applicatif, action non précisée par la source',
    guide: [
      {
        id: 'action', phase: 'validate',
        label:
          'Déterminer l’action réelle dans le journal d’audit Entra : ajout, modification ou consentement. L’alerte ne le dit pas.',
        evidence: 'app.consent',
      },
      { id: 'catalog', phase: 'collect', label: 'Confronter l’appId au catalogue malveillant CIPP', evidence: 'app.catalogue' },
      { id: 'scopes', phase: 'collect', label: 'Lire les permissions accordées : Mail.ReadWrite, Mail.Send, offline_access ?', evidence: 'app.scopes' },
      { id: 'publisher', phase: 'collect', label: 'Vérifier l’éditeur (vérifié ou non) et la date d’apparition', evidence: 'app.publisher' },
      {
        id: 'route', phase: 'map',
        label: 'Si l’action est un consentement, requalifier le dossier en type 6 pour son guide dédié',
      },
    ],
    fpClues: [
      'Synchronisation d’un outil métier connu',
      'Éditeur vérifié, permissions en lecture seule',
      'Application déjà présente depuis longtemps',
    ],
    tpClues: [
      'Présente au catalogue malveillant',
      'Permissions messagerie et offline_access',
      'Application apparue le jour de l’alerte',
      'Nom imitant Microsoft ou un outil connu',
    ],
  },
  {
    id: 20,
    // MITRE ATT&CK defaults for this alert family (attack.mitre.org), correctable per case.
    attack: ['T1530'],
    source: 'extsoc',
    family: 'data',
    entities: ['user'],
    severity: 'P3',
    label: 'Téléchargement massif',
    description:
      'Volume inhabituel de fichiers téléchargés depuis SharePoint ou OneDrive par un compte',
    guide: [
      {
        id: 'files', phase: 'collect',
        label:
          'Lire ce que le journal d’audit a réellement enregistré : quels fichiers, depuis quels sites (panneau « Téléchargements »)',
        evidence: 'download.files',
      },
      { id: 'baseline', phase: 'validate', label: 'Situer le volume : habituel pour ce compte et pour son service, ou hors norme ?' },
      { id: 'origin', phase: 'collect', label: 'Depuis quelles adresses les téléchargements sont partis', evidence: 'download.origin' },
      { id: 'context', phase: 'reconstruct', label: 'D’où : appareil géré, adresse habituelle, heures ouvrées ?', evidence: 'user.sessions' },
      { id: 'client', phase: 'map', label: 'Demander au titulaire ou à son responsable : migration, départ, sauvegarde personnelle ?' },
      { id: 'exfil', phase: 'scope', label: 'Si retenu : chercher un partage externe consécutif, et cadrer la révocation des accès' },
    ],
    fpClues: [
      'Migration ou réorganisation annoncée',
      'Appareil géré et conforme, heures ouvrées',
      'Fichiers du périmètre habituel du titulaire',
    ],
    tpClues: [
      'Départ récent ou annoncé du titulaire',
      'Appareil personnel, hors heures ouvrées, adresse inhabituelle',
      'Partage externe ou envoi sortant dans la foulée',
      'Fichiers hors du périmètre du titulaire',
    ],
  },
  {
    // Reached when a subject matches no pattern. The emitter adds rules without telling anyone,
    // and an unrecognised label is a table to complete, never an alert to drop: the case opens
    // here so an analyst sees it and gives it its real type.
    id: 99,
    // MITRE ATT&CK defaults for this alert family (attack.mitre.org), correctable per case.
    attack: [],
    source: 'extsoc',
    family: 'unknown',
    entities: [],
    severity: 'P3',
    label: 'À déterminer',
    description:
      'Libellé absent de la table de correspondance : le type reste à corriger',
    guide: [
      { id: 'read', phase: 'validate', label: 'Lire le sujet et le corps de l’alerte d’origine, dans le ticket' },
      {
        id: 'assign', phase: 'validate',
        label:
          'Corriger le type : action « Corriger le type » sur la ligne du dossier, dans la file d’attente. Le guide correspondant remplace celui-ci.',
      },
      {
        id: 'report', phase: 'validate',
        label: 'Signaler le libellé pour compléter la table, sans quoi la prochaine alerte identique reviendra ici',
      },
    ],
    fpClues: ['Rien à conclure tant que le type n’est pas déterminé'],
    tpClues: ['Rien à conclure tant que le type n’est pas déterminé'],
  },
]

/**
 * Types that were merged into another, and where they went.
 *
 * The catalogue was nineteen entries whose labels ran to a full sentence, several of them saying
 * the same thing twice: type 3's own guide read "run type 1's guide", and the Lighthouse family
 * repeated the endpoint one in English. Merging them is only safe because of this map: a dossier
 * already filed under a retired id keeps a category and a guide instead of falling back to a bare
 * number, and so does an alert the API resolver has not been remapped for yet.
 */
export const PSIT_SOC_RETIRED_TYPES = { 3: 1, 13: 12, 14: 12, 16: 11, 17: 10 }

/** The catalogue entry for a type id, or null: an unknown id renders as unknown, never throws. */
export const psitSocTypeById = (id) => {
  const numeric = Number(id)
  if (!Number.isFinite(numeric)) return null
  const resolved = PSIT_SOC_RETIRED_TYPES[numeric] ?? numeric
  return PSIT_SOC_TYPES.find((type) => type.id === resolved) ?? null
}

/**
 * The entity kinds a type investigates, in the order the drawer should ask for them. Unknown or
 * undeclared types ask for nothing rather than guessing: a picker for the wrong entity is worse
 * than no picker, since it fills the case with a fact that does not apply to it.
 */
export const psitSocTypeEntities = (id) => psitSocTypeById(id)?.entities ?? []

/** Options for an autoComplete field: "1 - Connexion depuis un pays inhabituel...". */
export const PSIT_SOC_TYPE_OPTIONS = PSIT_SOC_TYPES.map((type) => ({
  value: type.id,
  label: `${type.id} - ${type.label}`,
}))
