/**
 * ISO 3166-1 alpha-2 codes to French country names.
 *
 * The reports were printing "(IT)" to clients. An analyst reads a two-letter code without thinking;
 * a client reads it as noise, and a code is exactly the kind of detail that makes a document feel
 * written for someone else. The name is the information - the code is the encoding of it.
 *
 * Written out rather than taken from Intl.DisplayNames, for two reasons that both matter here. The
 * PDF renderer runs in Node as well as in the browser and Node's ICU build is a deployment detail
 * nobody controls; and the reports already refuse toLocaleString elsewhere, because a browser in a
 * different locale would silently produce a different document. A table is boring and it is the
 * same table everywhere.
 *
 * Feminine and masculine both occur, so callers that need "en Italie" versus "au Portugal" cannot
 * simply prefix a preposition - `inCountry()` carries that.
 */

const NAMES = {
  AD: 'Andorre',
  AE: 'Émirats arabes unis',
  AF: 'Afghanistan',
  AL: 'Albanie',
  AM: 'Arménie',
  AO: 'Angola',
  AR: 'Argentine',
  AT: 'Autriche',
  AU: 'Australie',
  AZ: 'Azerbaïdjan',
  BA: 'Bosnie-Herzégovine',
  BD: 'Bangladesh',
  BE: 'Belgique',
  BF: 'Burkina Faso',
  BG: 'Bulgarie',
  BH: 'Bahreïn',
  BJ: 'Bénin',
  BR: 'Brésil',
  BY: 'Bélarus',
  CA: 'Canada',
  CD: 'République démocratique du Congo',
  CG: 'Congo',
  CH: 'Suisse',
  CI: "Côte d'Ivoire",
  CL: 'Chili',
  CM: 'Cameroun',
  CN: 'Chine',
  CO: 'Colombie',
  CR: 'Costa Rica',
  CU: 'Cuba',
  CY: 'Chypre',
  CZ: 'Tchéquie',
  DE: 'Allemagne',
  DK: 'Danemark',
  DO: 'République dominicaine',
  DZ: 'Algérie',
  EC: 'Équateur',
  EE: 'Estonie',
  EG: 'Égypte',
  ES: 'Espagne',
  ET: 'Éthiopie',
  FI: 'Finlande',
  FR: 'France',
  GA: 'Gabon',
  GB: 'Royaume-Uni',
  GE: 'Géorgie',
  GH: 'Ghana',
  GN: 'Guinée',
  GR: 'Grèce',
  GT: 'Guatemala',
  HK: 'Hong Kong',
  HN: 'Honduras',
  HR: 'Croatie',
  HT: 'Haïti',
  HU: 'Hongrie',
  ID: 'Indonésie',
  IE: 'Irlande',
  IL: 'Israël',
  IN: 'Inde',
  IQ: 'Irak',
  IR: 'Iran',
  IS: 'Islande',
  IT: 'Italie',
  JM: 'Jamaïque',
  JO: 'Jordanie',
  JP: 'Japon',
  KE: 'Kenya',
  KG: 'Kirghizistan',
  KH: 'Cambodge',
  KR: 'Corée du Sud',
  KP: 'Corée du Nord',
  KW: 'Koweït',
  KZ: 'Kazakhstan',
  LB: 'Liban',
  LI: 'Liechtenstein',
  LK: 'Sri Lanka',
  LT: 'Lituanie',
  LU: 'Luxembourg',
  LV: 'Lettonie',
  LY: 'Libye',
  MA: 'Maroc',
  MC: 'Monaco',
  MD: 'Moldavie',
  ME: 'Monténégro',
  MG: 'Madagascar',
  MK: 'Macédoine du Nord',
  ML: 'Mali',
  MM: 'Birmanie',
  MN: 'Mongolie',
  MT: 'Malte',
  MU: 'Maurice',
  MX: 'Mexique',
  MY: 'Malaisie',
  MZ: 'Mozambique',
  NA: 'Namibie',
  NE: 'Niger',
  NG: 'Nigeria',
  NL: 'Pays-Bas',
  NO: 'Norvège',
  NP: 'Népal',
  NZ: 'Nouvelle-Zélande',
  OM: 'Oman',
  PA: 'Panama',
  PE: 'Pérou',
  PH: 'Philippines',
  PK: 'Pakistan',
  PL: 'Pologne',
  PT: 'Portugal',
  PY: 'Paraguay',
  QA: 'Qatar',
  RO: 'Roumanie',
  RS: 'Serbie',
  RU: 'Russie',
  RW: 'Rwanda',
  SA: 'Arabie saoudite',
  SC: 'Seychelles',
  SD: 'Soudan',
  SE: 'Suède',
  SG: 'Singapour',
  SI: 'Slovénie',
  SK: 'Slovaquie',
  SN: 'Sénégal',
  SO: 'Somalie',
  SV: 'Salvador',
  SY: 'Syrie',
  TD: 'Tchad',
  TG: 'Togo',
  TH: 'Thaïlande',
  TN: 'Tunisie',
  TR: 'Turquie',
  TW: 'Taïwan',
  TZ: 'Tanzanie',
  UA: 'Ukraine',
  UG: 'Ouganda',
  US: 'États-Unis',
  UY: 'Uruguay',
  UZ: 'Ouzbékistan',
  VE: 'Venezuela',
  VN: 'Viêt Nam',
  YE: 'Yémen',
  ZA: 'Afrique du Sud',
  ZM: 'Zambie',
  ZW: 'Zimbabwe',
}

/** Codes a country name would be wrong for: they are not places. */
const NOT_A_COUNTRY = new Set(['XX', 'ZZ', 'UNKNOWN', 'N/A'])

/**
 * The country's French name, or the code back when the table does not know it.
 *
 * Falling back to the code rather than to "pays inconnu" is deliberate: a code an analyst can look
 * up is worth more than a placeholder, and the table will always be behind ISO by a few entries.
 *
 * `withCode` appends it in parentheses, for the technical report where the code correlates with
 * other tools. The client report never shows the code alone, and never shows it at all.
 */
export const countryName = (code, { withCode = false, fallback = 'pays non déterminé' } = {}) => {
  const key = String(code ?? '')
    .trim()
    .toUpperCase()
  if (!key || NOT_A_COUNTRY.has(key)) return fallback

  const name = NAMES[key]
  if (!name) return key
  return withCode ? `${name} (${key})` : name
}

/** True when the table knows the code, so a caller can choose a different phrasing if not. */
export const isKnownCountry = (code) =>
  Boolean(NAMES[String(code ?? '').trim().toUpperCase()])

/**
 * Countries that take "aux" or "au" rather than "en".
 *
 * Only the ones the reports actually meet. Anything absent gets "en", which is right for the
 * feminine names and for masculine names beginning with a vowel - the two largest groups.
 */
const ARTICLE = {
  CA: 'au',
  US: 'aux',
  NL: 'aux',
  JP: 'au',
  MA: 'au',
  PT: 'au',
  BR: 'au',
  MX: 'au',
  CL: 'au',
  PE: 'au',
  QA: 'au',
  KW: 'au',
  LU: 'au',
  LI: 'au',
  MC: 'à',
  SG: 'à',
  HK: 'à',
  TD: 'au',
  TG: 'au',
  SN: 'au',
  ML: 'au',
  NE: 'au',
  BJ: 'au',
  GA: 'au',
  CM: 'au',
  CG: 'au',
  RW: 'au',
  MZ: 'au',
  ZW: 'au',
  KE: 'au',
  NG: 'au',
  GH: 'au',
  BD: 'au',
  PK: 'au',
  NP: 'au',
  LK: 'au',
  KH: 'au',
  VN: 'au',
  KZ: 'au',
  UZ: 'en',
  IQ: 'en',
  IR: 'en',
  IL: 'en',
  YE: 'au',
  SD: 'au',
  SV: 'au',
  HN: 'au',
  PY: 'au',
  VE: 'au',
  BH: 'au',
  BF: 'au',
}

/**
 * "en Italie", "au Canada", "aux États-Unis": the country with the preposition that fits it.
 *
 * A report that writes "en Canada" reads as machine output, and the whole point of naming the
 * country was to stop reading that way.
 */
export const inCountry = (code, { fallback = 'dans un pays non déterminé' } = {}) => {
  const key = String(code ?? '')
    .trim()
    .toUpperCase()
  if (!key || NOT_A_COUNTRY.has(key)) return fallback

  const name = NAMES[key]
  // An unknown code is not a place name, so it takes no preposition at all.
  if (!name) return `dans le pays ${key}`
  return `${ARTICLE[key] || 'en'} ${name}`
}
