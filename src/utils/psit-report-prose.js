// Editorial rules for every PSIT report, in one place.
//
// The reports read like generated text: "3 voie(s) d'exfiltration", "Label : Valeur : Explication",
// two date formats in the same document, participles that do not agree. None of that is a data
// problem - the numbers and the findings are right - but the client reads the prose, and prose that
// betrays a template reads as unverified.
//
// Nothing here touches data: these are string functions over values the caller already holds.
//
// On the no-break space: French typography wants a thin one (U+202F) before a colon, but Helvetica's
// WinAnsi encoding has no such glyph and react-pdf would draw nothing at all. U+00A0 is in WinAnsi,
// so that is what nbsp() inserts.

const NBSP = ' '

// Gender and plural of every noun the reports count. `many` is spelled out rather than derived:
// "signal" pluralises to "signaux" and "tiers" not at all, and a rule that gets those wrong is
// worse than a table.
const NOUNS = {
  action: { one: 'action', many: 'actions', gender: 'f' },
  adresse: { one: 'adresse', many: 'adresses', gender: 'f' },
  appareil: { one: 'appareil', many: 'appareils', gender: 'm' },
  application: { one: 'application', many: 'applications', gender: 'f' },
  compte: { one: 'compte', many: 'comptes', gender: 'm' },
  compromission: { one: 'compromission de donn\u00e9es publiques', many: 'compromissions de donn\u00e9es publiques', gender: 'f' },
  connexion: { one: 'connexion', many: 'connexions', gender: 'f' },
  correspondant: { one: 'correspondant externe', many: 'correspondants externes', gender: 'm' },
  destinataire: { one: 'destinataire', many: 'destinataires', gender: 'm' },
  dossier: { one: 'dossier', many: 'dossiers', gender: 'm' },
  entree: { one: 'entrée', many: 'entrées', gender: 'f' },
  fichier: { one: 'fichier', many: 'fichiers', gender: 'm' },
  jour: { one: 'jour', many: 'jours', gender: 'm' },
  ligne: { one: 'ligne', many: 'lignes', gender: 'f' },
  ligneSuivi: { one: 'ligne de suivi', many: 'lignes de suivi', gender: 'f' },
  message: { one: 'message', many: 'messages', gender: 'm' },
  methode: { one: 'méthode', many: 'méthodes', gender: 'f' },
  minute: { one: 'minute', many: 'minutes', gender: 'f' },
  modification: { one: 'modification', many: 'modifications', gender: 'f' },
  objet: { one: 'objet', many: 'objets', gender: 'm' },
  personne: { one: 'personne', many: 'personnes', gender: 'f' },
  qualification: { one: 'qualification', many: 'qualifications', gender: 'f' },
  question: { one: 'question', many: 'questions', gender: 'f' },
  regle: { one: 'règle', many: 'règles', gender: 'f' },
  session: { one: 'session', many: 'sessions', gender: 'f' },
  site: { one: 'site', many: 'sites', gender: 'm' },
  signal: { one: 'signal', many: 'signaux', gender: 'm' },
  tentative: { one: 'tentative', many: 'tentatives', gender: 'f' },
  typeFichier: { one: 'type de fichier', many: 'types de fichiers', gender: 'm' },
  // Invariable: "1 tiers", "4 tiers".
  tiers: { one: 'tiers', many: 'tiers', gender: 'm' },
  voieExfiltration: { one: "voie d'exfiltration", many: "voies d'exfiltration", gender: 'f' },
}

const noun = (key) => {
  const entry = NOUNS[key]
  if (!entry) throw new Error(`psit-report-prose: unknown noun "${key}"`)
  return entry
}

/**
 * Explicit value for a count the collection did not gather. It renders "non déterminé" and is the
 * only way to express that: an absent count must never be printed as zero.
 */
export const NOT_COLLECTED = Symbol('psit:not-collected')

/**
 * Throws on a missing count, deliberately.
 *
 * "aucune connexion" is an affirmative finding; a missing datum is a collection failure. Printing
 * one as the other manufactures a false statement in a document that can be produced as evidence,
 * so a caller has to decide: a real zero, or NOT_COLLECTED.
 */
const asCount = (value) => {
  if (value === null || value === undefined || value === '') {
    throw new Error('psit-report-prose: missing count. Pass 0 for none, NOT_COLLECTED for ungathered')
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`psit-report-prose: "${value}" is not a count`)
  }
  return parsed > 0 ? Math.floor(parsed) : 0
}

/**
 * Cardinality as a reader expects it: "aucune connexion", "1 connexion", "14 connexions".
 * Never "connexion(s)".
 */
export const cardinal = (value, key) => {
  const entry = noun(key)
  if (value === NOT_COLLECTED) return 'non déterminé'
  const total = asCount(value)
  if (total === 0) return `${entry.gender === 'f' ? 'aucune' : 'aucun'} ${entry.one}`
  if (total === 1) return `1 ${entry.one}`
  return `${total} ${entry.many}`
}

/** Same agreement, figure kept at zero: for a table cell or a stat tile. */
export const counted = (value, key) => {
  const entry = noun(key)
  if (value === NOT_COLLECTED) return 'non déterminé'
  const total = asCount(value)
  return `${total} ${total > 1 ? entry.many : entry.one}`
}

/**
 * Agrees a past participle with the cardinality, negation included:
 *   0 -> "aucune voie d'exfiltration n'a été relevée"
 *   1 -> "1 voie d'exfiltration a été relevée"
 *   3 -> "3 voies d'exfiltration ont été relevées"
 * `participle` is given in the masculine singular ("relevé", "enregistré", "retenu").
 */
export const sentence = (value, key, participle) => {
  const entry = noun(key)
  if (value === NOT_COLLECTED) return `${entry.one} : non déterminé`
  const total = asCount(value)
  const plural = total > 1
  const agreed = `${participle}${entry.gender === 'f' ? 'e' : ''}${plural ? 's' : ''}`
  const auxiliary = total === 0 ? "n'a été" : plural ? 'ont été' : 'a été'
  return `${cardinal(total, key)} ${auxiliary} ${agreed}`
}

/**
 * Agrees adjectives and participles with a counted noun:
 *   1 -> "correspondant externe distinct observé"
 *   5 -> "correspondants externes distincts observés"
 * Words are given in the masculine singular. NOT_COLLECTED agrees as a singular, since the phrase
 * around it no longer states a count.
 *
 * `sentence()` covers the "a été relevée" shape; this one covers a bare qualifier, which is where
 * the reports had "5 correspondants externes distinct observé".
 */
export const agree = (value, key, ...words) => {
  const entry = noun(key)
  const total = value === NOT_COLLECTED ? 1 : asCount(value)
  const plural = total > 1
  return words
    .map((word) => `${word}${entry.gender === 'f' ? 'e' : ''}${plural ? 's' : ''}`)
    .join(' ')
}

/**
 * "de" in front of a phrase, elided: the reports were printing "suivis de une campagne d'envoi en
 * masse". Also collapses "de des" to "d'", which is what French does with a partitive after "de".
 */
export const elideDe = (text) => {
  const body = String(text ?? '').trim()
  if (!body) return 'de'
  const stripped = body.replace(/^des\s+/i, '')
  if (stripped !== body) return `d'${stripped}`
  return /^[aeiouyàâäeéèêëiîïoôöuùûüh]/i.test(body) ? `d'${body}` : `de ${body}`
}

/**
 * A truncated list says so, with both numbers and where the rest is.
 *
 * One sentence for the whole report rather than one per section: a reader who has learnt to look
 * for it in the annex should find the same words in the chronology. "ligne" is the noun everywhere,
 * so no section has to name its own unit to say the same thing.
 *
 * Returns null when nothing was cut, so a caller can drop it with .filter(Boolean).
 */
export const truncationNote = (shown, total) => {
  const kept = asCount(shown)
  const all = asCount(total)
  if (all <= kept) return null
  return `${cardinal(kept, 'ligne')} sur ${all} ${
    kept > 1 ? 'figurent' : 'figure'
  } ici ; la liste complète est dans l'export de données du dossier.`
}

/**
 * The same statement inside a table cell or a sentence, where a full sentence would not fit:
 * "objet A, objet B, et 4 objets de plus". The noun is named here because the cell has no title
 * to carry it.
 */
export const andMore = (shown, total, key) => {
  const hidden = asCount(total) - asCount(shown)
  return hidden > 0 ? `et ${cardinal(hidden, key)} de plus` : null
}

/**
 * A capped list, rendered with its own truncation note. Takes the FULL array: the cap is applied
 * here so the note counts what it cut, which is exactly what pre-slicing a list to the same number
 * a table was already limiting to made impossible.
 */
export const listWithNote = (items, cap, render) => {
  const all = Array.isArray(items) ? items : []
  const shown = all.slice(0, cap)
  return [...shown.map(render), truncationNote(shown.length, all.length)]
    .filter(Boolean)
    .join('\n')
}

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]

// Parsed from the ISO string rather than through toLocaleString: the reports state UTC, and a
// browser in Paris would silently shift every date by two hours.
const utcParts = (value) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const iso = date.toISOString()
  return {
    year: iso.slice(0, 4),
    month: Number(iso.slice(5, 7)),
    day: Number(iso.slice(8, 10)),
    time: iso.slice(11, 16),
    seconds: iso.slice(11, 19),
    date: iso.slice(0, 10),
  }
}

/** Running prose: "le 17 août 2026 à 16:08 UTC". `article: false` for "du ..." / "au ...". */
export const dateProse = (value, { article = true, fallback = 'date non renseignée' } = {}) => {
  const parts = utcParts(value)
  if (!parts) return fallback
  const day = parts.day === 1 ? '1er' : String(parts.day)
  const stamp = `${day} ${MONTHS[parts.month - 1]} ${parts.year} à ${parts.time} UTC`
  return article ? `le ${stamp}` : stamp
}

/** Tables and annexes: "2026-08-17 16:08:12 UTC". No T, no Z, seconds kept. */
export const dateTable = (value, { fallback = 'non renseigné' } = {}) => {
  const parts = utcParts(value)
  if (!parts) return fallback
  return `${parts.date} ${parts.seconds} UTC`
}

/**
 * An axis tick: "20/08", or "20/08/26" when the window straddles two years.
 *
 * The third and last date format of the reports, and it exists for one reason: a graduation has a
 * few points of width. `dateProse` and `dateTable` are both too long to sit under a tick without
 * colliding with the next one. Everything else keeps to the two long forms - a fourth format would
 * be a report that spells dates three ways.
 *
 * The year is deliberately two digits: on a strip whose whole point is a window of a few days, a
 * four-digit year in every tick is noise. When the window fits in one year, the year is stated once
 * in the note under the strip instead.
 */
export const dateAxis = (value, { withYear = false, fallback = 'date non déterminée' } = {}) => {
  const parts = utcParts(value)
  if (!parts) return fallback
  const stamp = `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}`
  return withYear ? `${stamp}/${parts.year.slice(2)}` : stamp
}

/** The day alone, for a period: "17 août 2026". */
export const dayProse = (value, { fallback = 'date non renseignée' } = {}) => {
  const parts = utcParts(value)
  if (!parts) return fallback
  const day = parts.day === 1 ? '1er' : String(parts.day)
  return `${day} ${MONTHS[parts.month - 1]} ${parts.year}`
}

/**
 * French spacing: a no-break space before double punctuation and inside quotation marks, so a line
 * never breaks between a word and its colon.
 *
 * Only a space already present is replaced, which leaves "16:08" and "https://" alone.
 */
export const nbsp = (text) =>
  String(text ?? '')
    .replace(/ +([:;!?»])/g, `${NBSP}$1`)
    .replace(/« +/g, `«${NBSP}`)

/** "a, b et c" - replaces the semicolon-joined enumerations the reports used to print. */
export const enumerate = (items, { conjunction = 'et', empty = 'aucun' } = {}) => {
  const list = (Array.isArray(items) ? items : [items])
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
  if (list.length === 0) return empty
  if (list.length === 1) return list[0]
  return `${list.slice(0, -1).join(', ')} ${conjunction} ${list[list.length - 1]}`
}

/**
 * One full sentence per enumeration value, per place it is rendered. The reports used to print the
 * raw value after a colon ("Lecture des messages : not-provable"), or a
 * label-colon-value-colon-explanation chain that reads like a debug dump.
 *
 * `summary` is a clause fit to sit inside a paragraph, `body` a standalone sentence, `box` the short
 * form for a boxed title. A missing variant falls back to `body`.
 */
const PHRASES = {
  // Public-breach exposure. Four states because "not referenced" and "we could not check" are
  // different facts, and the second one printed as the first is a false statement in a document a
  // client may hand to an insurer. The templates carry {upn}, {n}, {m}, {min}, {max}, {reason}.
  breach: {
    'exposed-passwords': {
      body: "L'adresse {upn} figure dans {n} entre {min} et {max}, dont {m} exposant des mots de passe. Cette exposition constitue un facteur de risque de réutilisation de mot de passe ; elle n'établit pas le vecteur d'accès initial de l'incident.",
    },
    exposed: {
      body: "L'adresse {upn} figure dans {n} entre {min} et {max}. Cette exposition constitue un facteur de risque de réutilisation de mot de passe ; elle n'établit pas le vecteur d'accès initial de l'incident.",
    },
    clear: {
      body: "L'adresse ne figure pas dans les compromissions publiques référencées à la date de la vérification. L'absence de référencement ne vaut pas absence de compromission : la couverture des bases publiques est partielle.",
    },
    unchecked: {
      body: "La vérification d'exposition n'a pas pu être effectuée ({reason}).",
    },
  },
  verdict: {
    compromised: {
      box: 'compromission retenue',
      body: 'La compromission du compte est retenue.',
      summary: 'la compromission du compte est retenue',
    },
    toQualify: {
      box: 'qualification en cours',
      body: "La qualification est en cours : des signaux attendent une réponse de l'analyste.",
      summary: 'la qualification est en cours',
    },
    undetermined: {
      box: 'indéterminée',
      body: "La qualification reste indéterminée : un signal n'a pu être ni confirmé ni écarté.",
      summary: 'la qualification reste indéterminée',
    },
    clean: {
      box: 'faux positif retenu',
      body: 'Le dossier est classé en faux positif.',
      summary: 'le dossier est classé en faux positif',
    },
  },
  mailRead: {
    proven: {
      body: "La lecture des messages est établie par les journaux d'audit.",
      summary: 'la lecture des messages est établie',
    },
    'not-provable': {
      body: "La lecture des messages ne peut être ni établie ni exclue : l'événement MailItemsAccessed relève de Purview Audit (Premium) et n'est pas collecté sur ce tenant.",
      summary: 'la lecture des messages ne peut être ni établie ni exclue',
    },
    excluded: {
      body: "La lecture des messages est écartée par les journaux d'audit.",
      summary: 'la lecture des messages est écartée',
    },
    unknown: {
      body: "La lecture des messages n'a pas été qualifiée.",
      summary: "la lecture des messages n'a pas été qualifiée",
    },
  },
  incidentStatus: {
    ongoing: { body: 'Incident en cours de traitement.', box: 'en cours de traitement' },
    contained: { body: 'Incident confiné.', box: 'confiné' },
    monitoring: { body: 'Incident sous surveillance.', box: 'sous surveillance' },
    closed: { body: 'Incident clos.', box: 'clos' },
  },
  channel: {
    courriel: { body: 'par courriel' },
    telephone: { body: 'par téléphone' },
    portail: { body: 'par le portail de déclaration' },
    courrier: { body: 'par courrier' },
  },
  effect: {
    'mass-send': { body: "une campagne d'envoi en masse vers des destinataires externes" },
    'thread-hijack': {
      body: 'des envois dans des fils de discussion existants (détournement de fils)',
    },
    both: {
      body: "une campagne d'envoi en masse et des envois dans des fils de discussion existants",
    },
    'access-only': { body: "un accès sans activité d'envoi observée" },
  },
  determination: {
    expected: { body: 'attendue', box: 'attendue' },
    unexpected: { body: 'inattendue', box: 'inattendue' },
    undetermined: { body: 'indéterminée', box: 'indéterminée' },
  },
}

export const phrase = (domain, value, context = 'body') => {
  const entry = PHRASES[domain]?.[value]
  if (!entry) return null
  return entry[context] ?? entry.body ?? null
}

/** The values an enumerated field accepts: for the panel's select, and for the lint. */
export const phraseValues = (domain) => Object.keys(PHRASES[domain] || {})

export const PROSE_DOMAINS = Object.keys(PHRASES)

// Lexicon the reports must not print, checked by the lint on template literals and warned about in
// the panel on analyst free text - the lint cannot see stored data, the panel can.
export const BANNED_LEXICON = [
  { pattern: /\bspams?\b/i, why: "« spam » : écrire « envoi en masse » ou « campagne d'envoi »" },
  {
    pattern: /\bmassif(?:s|ve|ves)?\b/i,
    why: '« massif » : préférer « en masse », qui décrit sans juger',
  },
  {
    pattern: /(?<![\p{L}-])utilisateur(?![\p{L}])/iu,
    why: "« utilisateur » seul : écrire « le titulaire du compte » ou « l'acteur de la session »",
  },
  { pattern: /[—–]/, why: 'tiret cadratin ou demi-cadratin : deux-points, parenthèses ou virgule' },
  { pattern: /\(s\)/, why: '« (s) » : utiliser cardinal() du module de prose' },
]

/** Returns the banned-lexicon hits of a free-text field, for a non-blocking panel warning. */
export const lexiconWarnings = (text) => {
  const value = String(text ?? '')
  if (!value.trim()) return []
  return BANNED_LEXICON.filter((rule) => rule.pattern.test(value)).map((rule) => rule.why)
}
