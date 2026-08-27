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
  'contained',
  'closed',
]

export const PSIT_SOC_SEVERITIES = ['P1', 'P2', 'P3', 'P4']

export const PSIT_SOC_TYPES = [
  {
    id: 1,
    source: 'extsoc',
    family: 'signin',
    entities: ['user'],
    severity: 'P4',
    label: 'Connexion depuis un pays inhabituel ou une IP signalée malveillante',
    guide: [
      { id: 'sessions', label: 'Regrouper les connexions par adresse IP et repérer les succès', evidence: 'user.sessions' },
      { id: 'mfa', label: 'Vérifier MFA et protocole de chaque succès (client hérité ?)', evidence: 'user.signin-quality' },
      { id: 'device', label: "Vérifier l'appareil : géré, conforme, déjà vu sur ce compte" },
      { id: 'locations', label: 'Confronter aux localisations nommées et au pays déclaré' },
      { id: 'client', label: 'Contacter le titulaire ou le client : déplacement, VPN, roaming ?' },
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
    source: 'extsoc',
    family: 'signin',
    entities: ['user'],
    severity: 'P2',
    label: 'Voyage impossible : activité simultanée depuis plusieurs pays',
    guide: [
      { id: 'sessions', label: 'Construire les sessions par IP et mesurer l’écart de temps entre pays', evidence: 'user.sessions' },
      { id: 'aitm', label: 'Chercher la signature AiTM : même session vue de deux adresses, MFA « satisfaite » rejouée', evidence: 'user.signin-quality' },
      { id: 'devicecode', label: 'Vérifier le protocole : deviceCode = hameçonnage par code d’appareil' },
      { id: 'client', label: 'Contacter le titulaire : VPN, roaming, second appareil ?' },
      { id: 'bec', label: 'Si TP : collecter le dossier BEC et dérouler la remédiation' },
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
    id: 3,
    source: 'extsoc',
    family: 'signin',
    entities: ['user'],
    severity: 'P3',
    label: 'Connexion O365 depuis l’étranger (corrélée au voyage impossible)',
    guide: [
      { id: 'correlate', label: 'Vérifier si un cas de type 2 est ouvert sur le même compte' },
      { id: 'sessions', label: 'Dérouler le guide du type 1 sur les connexions concernées', evidence: 'user.sessions' },
    ],
    fpClues: ['Mêmes indices que le type 1'],
    tpClues: ['Mêmes indices que les types 1 et 2 : reprendre la criticité du type 2 si confirmé'],
  },
  {
    id: 4,
    source: 'extsoc',
    family: 'identity-persistence',
    entities: ['user'],
    severity: 'P2',
    label: 'Élévation de privilèges : ajout de rôle sensible',
    guide: [
      { id: 'audit', label: 'Lire l’audit RoleManagement : acteur, IP source, rôle, heure' },
      { id: 'actor', label: 'Qualifier l’acteur : PIM, admin MSP (GDAP), ou compte utilisateur ?' },
      { id: 'target', label: 'Vérifier les rôles actuels du bénéficiaire' },
      { id: 'crosscase', label: 'Croiser avec les cas ouverts sur l’acteur et le bénéficiaire' },
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
      'Acteur lui-même signalé dans un autre cas',
    ],
  },
  {
    id: 5,
    source: 'extsoc',
    family: 'identity-persistence',
    entities: ['user'],
    severity: 'P2',
    label: 'Création ou modification de règle de boîte, forward externe',
    guide: [
      { id: 'rules', label: 'Lister les règles de la boîte, règles masquées incluses', evidence: 'user.rules' },
      { id: 'targets', label: 'Qualifier chaque règle : destinataire externe ? suppression ? dossier de dissimulation ?', evidence: 'user.rules' },
      { id: 'origin', label: 'Retrouver la création dans l’audit : IP, heure, hors zone ?' },
      { id: 'forward', label: 'Vérifier le forward niveau boîte (ForwardingSmtpAddress)' },
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
    source: 'extsoc',
    family: 'identity-persistence',
    entities: ['app', 'user'],
    severity: 'P4',
    label: 'Consentement d’application OAuth',
    guide: [
      { id: 'catalog', label: 'Confronter l’appId au catalogue malveillant CIPP', evidence: 'app.catalogue' },
      { id: 'scopes', label: 'Lire les permissions accordées : Mail.ReadWrite, Mail.Send, offline_access ?', evidence: 'app.scopes' },
      { id: 'publisher', label: 'Vérifier l’éditeur (vérifié ou non) et la date d’apparition', evidence: 'app.publisher' },
      { id: 'consent', label: 'Retrouver le consentement dans l’audit : qui, quand, HNO ?', evidence: 'app.consent' },
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
    source: 'extsoc',
    family: 'identity-persistence',
    entities: ['user'],
    severity: 'P3',
    label: 'Ajout de compte utilisateur ou octroi d’accès à une BAL (HNO)',
    guide: [
      { id: 'audit', label: 'Retrouver la création dans l’audit : acteur, heure' },
      { id: 'actor', label: 'Qualifier l’acteur : provisioning RH, admin MSP, ou compte utilisateur ?' },
      { id: 'perms', label: 'Vérifier les délégations posées sur des BAL, surtout de direction' },
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
    source: 'xdr',
    family: 'endpoint',
    entities: ['device'],
    severity: 'P1',
    label: 'Menace active non mitigée sur une machine (MDE)',
    guide: [
      { id: 'status', label: 'Vérifier le statut de remédiation dans le portail Defender', evidence: 'device.defender' },
      { id: 'hash', label: 'Qualifier le binaire : hash, signature, chemin (%temp% vs Program Files)' },
      { id: 'prevalence', label: 'Mesurer la prévalence du binaire sur le parc' },
      { id: 'identity', label: 'Pivot identité : sessions et mot de passe du titulaire de la machine' },
    ],
    fpClues: ['Remédiation en fait aboutie côté portail'],
    tpClues: [
      'Non mitigée = TP par défaut tant que le portail ne dit pas le contraire',
      'Binaire non signé dans un chemin utilisateur',
    ],
  },
  {
    id: 10,
    source: 'xdr',
    family: 'endpoint',
    entities: ['device'],
    severity: 'P3',
    label: 'Comportement C2 bloqué (ex. AnyDesk lancé en --service)',
    guide: [
      { id: 'rmm', label: 'L’outil est-il un RMM déployé par PSIT (liste interne) ?' },
      { id: 'binary', label: 'Vérifier signature et chemin du binaire' },
      { id: 'context', label: 'Compte exécutant et heure : technicien en heures ouvrées ?', evidence: 'device.compliance' },
      { id: 'prevalence', label: 'Prévalence sur le parc du client' },
    ],
    fpClues: [
      'RMM de la liste interne PSIT, signé, chemin standard',
      'Compte exécutant = technicien, heures ouvrées',
    ],
    tpClues: [
      'Binaire non signé ou dans %temp%',
      'Exécution HNO par un compte non technicien',
      'Outil d’accès distant hors liste PSIT',
    ],
  },
  {
    id: 11,
    source: 'xdr',
    family: 'endpoint',
    entities: ['device'],
    severity: 'P3',
    label: 'Binaire ou script suspect (VBS, runner)',
    guide: [
      { id: 'parent', label: 'Identifier le processus parent (Office vers wscript = TP probable)', evidence: 'device.compliance' },
      { id: 'binary', label: 'Qualifier le script : chemin, signature, contenu si disponible' },
      { id: 'prevalence', label: 'Prévalence sur le parc' },
      { id: 'identity', label: 'Si exécuté : pivot identité sur le titulaire de la machine' },
    ],
    fpClues: [
      'Script d’administration connu, chemin système',
      'Prévalent sur le parc (outillage déployé)',
    ],
    tpClues: [
      'Parent = application Office ou navigateur',
      'Chemin utilisateur, téléchargé récemment',
    ],
  },
  {
    id: 12,
    source: 'xdr',
    family: 'endpoint',
    entities: ['device'],
    severity: 'P4',
    label: 'Malware détecté et bloqué, scan de ports horizontal',
    guide: [
      { id: 'blocked', label: 'Confirmer le blocage : risque résiduel faible si bloqué', evidence: 'device.defender' },
      { id: 'operator', label: 'Compte exécutant et plage IP : outillage d’administration des techniciens ?' },
      { id: 'context', label: 'Précédé d’une autre alerte identité sur le même poste ?' },
    ],
    fpClues: [
      'Scanner réseau des techniciens : compte connu, plage d’administration, heures ouvrées',
      'Détection bloquée sans autre signal',
    ],
    tpClues: [
      'Scan depuis un poste utilisateur standard',
      'Précédé d’une alerte identité ou EDR sur le même poste',
    ],
  },
  {
    id: 13,
    source: 'xdr',
    family: 'xdr',
    entities: ['device'],
    severity: 'P2',
    label: 'Malware blocked / prevented / active (Wacatac, Malgent, FakeFolder, EICAR)',
    guide: [
      { id: 'eicar', label: 'EICAR = fichier de test : clore benign en un clic' },
      { id: 'status', label: 'Lire remediationStatus sur l’évidence : bloqué = risque résiduel faible', evidence: 'device.defender' },
      { id: 'hash', label: 'Qualifier le hash (détections génériques Wacatac/Malgent) et la prévalence' },
      { id: 'writeback', label: 'Qualifier dans Defender (classification + détermination) via le cas' },
    ],
    fpClues: ['EICAR ou fichier de test', 'Bloqué, hash prévalent et bénin'],
    tpClues: ['Actif ou non remédié', 'Hash inconnu, chemin utilisateur'],
  },
  {
    id: 14,
    source: 'xdr',
    family: 'xdr',
    entities: ['device'],
    severity: 'P4',
    label: 'Unwanted software prevented',
    guide: [
      { id: 'pua', label: 'PUA bloquée : identifier le logiciel et sa source' },
      { id: 'tolerated', label: 'Est-il toléré chez ce client ? Qualifier rapidement' },
    ],
    fpClues: ['Logiciel toléré ou installé sciemment, détection préventive'],
    tpClues: ['Accompagné d’autres détections sur le même poste'],
  },
  {
    id: 15,
    source: 'xdr',
    family: 'xdr',
    entities: ['device', 'user'],
    severity: 'P1',
    label: 'Infostealer activity',
    guide: [
      { id: 'assume', label: 'TP jusqu’à preuve du contraire : les identifiants du poste sont considérés exposés' },
      { id: 'identity', label: 'Pivot identité immédiat : révoquer les sessions, réinitialiser le mot de passe', evidence: 'user.sessions' },
      { id: 'bec', label: 'Collecter le dossier BEC du titulaire' },
      { id: 'device', label: 'Machine : scan complet, envisager l’isolation (portail Defender)', evidence: 'device.defender' },
    ],
    fpClues: ['Rarissime : n’écarter que sur preuve (fichier de test, faux positif confirmé par MS)'],
    tpClues: ['Par défaut : agir d’abord, qualifier ensuite'],
  },
  {
    id: 16,
    source: 'xdr',
    family: 'xdr',
    entities: ['device'],
    severity: 'P3',
    label: 'Suspicious file observed',
    guide: [
      { id: 'hash', label: 'Qualifier le fichier : hash, signature, origine (mail, web, USB)' },
      { id: 'prevalence', label: 'Prévalence sur le parc' },
      { id: 'context', label: 'Autres alertes sur le poste ou le titulaire ?', evidence: 'device.compliance' },
    ],
    fpClues: ['Fichier signé d’un éditeur connu, origine légitime'],
    tpClues: ['Origine mail ou web récente, hash inconnu, exécuté'],
  },
  {
    id: 17,
    source: 'xdr',
    family: 'xdr',
    entities: ['device'],
    severity: 'P3',
    label: 'Suspicious service launched',
    guide: [
      { id: 'service', label: 'Identifier le service : nom, binaire, compte de lancement' },
      { id: 'persistence', label: 'Créé récemment ? HNO ? chemin non standard ? = persistance probable' },
      { id: 'rmm', label: 'Confronter à la liste RMM PSIT (un agent RMM crée des services)', evidence: 'device.compliance' },
    ],
    fpClues: ['Service d’un agent connu (RMM, antivirus, sauvegarde)'],
    tpClues: ['Service créé HNO, binaire non signé, chemin utilisateur'],
  },
  {
    id: 18,
    source: 'mdo',
    family: 'mail',
    entities: ['mail'],
    severity: 'P2',
    label: 'Phishing non bloqué, entités non purgées après livraison (ZAP incomplet)',
    guide: [
      { id: 'evidence', label: 'Lire l’évidence : networkMessageId, destinataires, objet, URLs, verdict' },
      { id: 'trace', label: 'Message trace : à qui le message a réellement été livré' },
      { id: 'quarantine', label: 'Vérifier la quarantaine : déjà purgé en fait ?' },
      { id: 'block', label: 'Bloquer expéditeur, domaine ou URL (Tenant Allow/Block List)' },
      { id: 'clicks', label: 'Limite : les clics Safe Links ne sont pas collectés ici, ne pas conclure « pas de clic »' },
      { id: 'identity', label: 'Si clic suspecté : pivot identité sur les destinataires' },
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
    source: 'extsoc',
    family: 'identity-persistence',
    entities: ['app', 'user'],
    severity: 'P4',
    label: 'Activité applicative : ajout, modification ou consentement',
    guide: [
      {
        id: 'action',
        label:
          'Déterminer l’action réelle dans le journal d’audit Entra : ajout, modification ou consentement. L’alerte ne le dit pas.',
        evidence: 'app.consent',
      },
      { id: 'catalog', label: 'Confronter l’appId au catalogue malveillant CIPP', evidence: 'app.catalogue' },
      { id: 'scopes', label: 'Lire les permissions accordées : Mail.ReadWrite, Mail.Send, offline_access ?', evidence: 'app.scopes' },
      { id: 'publisher', label: 'Vérifier l’éditeur (vérifié ou non) et la date d’apparition', evidence: 'app.publisher' },
      {
        id: 'route',
        label: 'Si l’action est un consentement, requalifier le cas en type 6 pour son guide dédié',
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
    // Reached when a subject matches no pattern. The emitter adds rules without telling anyone,
    // and an unrecognised label is a table to complete, never an alert to drop: the case opens
    // here so an analyst sees it and gives it its real type.
    id: 99,
    source: 'extsoc',
    family: 'unknown',
    entities: [],
    severity: 'P3',
    label: 'Type non déterminé : libellé absent de la table de correspondance',
    guide: [
      { id: 'read', label: 'Lire le sujet et le corps de l’alerte d’origine, dans le ticket' },
      { id: 'assign', label: 'Corriger le type sur le cas : le guide correspondant apparaît alors' },
      {
        id: 'report',
        label: 'Signaler le libellé pour compléter la table, sans quoi la prochaine alerte identique reviendra ici',
      },
    ],
    fpClues: ['Rien à conclure tant que le type n’est pas déterminé'],
    tpClues: ['Rien à conclure tant que le type n’est pas déterminé'],
  },
]

/** The catalogue entry for a type id, or null: an unknown id renders as unknown, never throws. */
export const psitSocTypeById = (id) => {
  const numeric = Number(id)
  if (!Number.isFinite(numeric)) return null
  return PSIT_SOC_TYPES.find((type) => type.id === numeric) ?? null
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
