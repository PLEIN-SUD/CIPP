#!/usr/bin/env node
/**
 * Value parity across the editorial revision.
 *
 * The acceptance criterion is a regeneration at constant data: same substance, same figures, same
 * timestamps. The dossier itself cannot be regenerated here - its collection lives in the client
 * tenant's cachebec table, and client data does not enter this repository - so this checks the
 * property the criterion is really about: that the rewrite changed prose and layout and touched no
 * computed value.
 *
 * How: extract the value modules as they were before the revision, run them and the current ones on
 * byte-identical fixtures, and compare every factual output. Any difference is a blocking defect,
 * including a rounding or an attribution difference.
 *
 * Usage: node scripts/psit-value-parity.mjs [--before <ref>] [--json <path>]
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const readArg = (name, fallback) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : fallback
}
// Re-baselined on a48547664, the session-grouping fix. Until then the reference was ed40f7bdd, the
// commit before the editorial revision, and the criterion was "the rewrite changed no value". That
// criterion held: 135 values, zero difference. The session fix DID change one value on purpose, so
// keeping the old reference would report it as a defect for ever. Documented in PSIT-README.md.
const BEFORE = readArg('--before', 'a48547664')
const JSON_OUT = readArg('--json', null)
const WORK = 'psit/parity'

// One list for both sides. It used to be shorter on the "before" side because the reference,
// ed40f7bdd, predated the prose module; the reference now postdates it, so an amputated list only
// breaks the import graph.
const VALUE_MODULES = [
  'src/utils/psit-as-array.js',
  'src/utils/psit-report-prose.js',
  'src/utils/psit-bec-signals.js',
  'src/utils/psit-bec-incident.js',
  'src/utils/psit-bec-iocs.js',
  'src/utils/psit-bec-collection.js',
]

const MODULES = { before: VALUE_MODULES, after: VALUE_MODULES }

const git = (list) => execFileSync('git', list, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

/**
 * Node reads a bare .js as CommonJS in this package, so the extracted copies get .mjs and their
 * relative specifiers are rewritten to match. Nothing else about them is touched.
 */
const extract = (side, ref) => {
  const dir = `${WORK}/${side}`
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  for (const file of MODULES[side]) {
    // A module absent from an older reference is a fact about that reference, not an error: keep
    // the flag usable on any commit, including ones that predate the prose module.
    let source
    try {
      source = ref === null ? git(['show', `HEAD:${file}`]) : git(['show', `${ref}:${file}`])
    } catch {
      continue
    }
    const name = file.split('/').pop().replace(/\.js$/, '.mjs')
    const rewritten = source.replace(/from '(\.\/[a-z0-9-]+)'/g, (_, spec) => `from '${spec}.mjs'`)
    writeFileSync(`${dir}/${name}`, rewritten)
  }
  return dir
}

const load = async (dir) => {
  const url = (name) => pathToFileURL(resolve(`${dir}/${name}`)).href
  return {
    signals: await import(url('psit-bec-signals.mjs')),
    incident: await import(url('psit-bec-incident.mjs')),
    iocs: await import(url('psit-bec-iocs.mjs')),
    collection: await import(url('psit-bec-collection.mjs')),
  }
}

// ---------------------------------------------------------------------------------------------
// Fixture: the shape and the cardinalities of the real dossier, with synthetic values. The counts
// come from the tab's own badges (2 rules, 262 sent, 4 MFA methods, 1 password change, 278 sender
// entries, 135 sign-ins) so the comparison exercises the same code paths at the same volumes.
// ---------------------------------------------------------------------------------------------
const userData = {
  id: 'user-guid',
  displayName: 'P Martin',
  userPrincipalName: 'p.martin@contoso.test',
}

const signIn = (index) => {
  // A second successful address, interleaved in time with the first: the account holder still
  // working while the intruder is in. The fixture held only ONE successful address, which is exactly
  // the shape where the old session grouping happened to be right - so it measured nothing about the
  // dimension it was blind to. Eight sign-ins on the same three days, offset by four minutes from
  // the first block so the two addresses alternate.
  // Dense burst, inside the 30-minute threshold, so the grouping is actually exercised: the events
  // of the two addresses have to alternate AND be close enough to belong to one session each.
  if (index >= 22 && index < 30) {
    const step = index - 22
    const foreign = step % 2 === 0
    return {
      CreatedDateTime: `2026-08-20T07:${String(step * 5 + (foreign ? 0 : 2)).padStart(2, '0')}:00Z`,
      IPAddress: foreign ? '203.0.113.42' : '203.0.113.77',
      Country: foreign ? 'IT' : 'FR',
      City: foreign ? 'Verone' : 'Marseille',
      Status: 'Success',
      AppDisplayName: foreign ? 'Microsoft Graph' : 'Outlook',
      ForeignLocation: foreign,
    }
  }
  // 22 successes from one foreign address, the rest spread over failed spray sources: the shape the
  // dossier had.
  if (index < 22) {
    return {
      CreatedDateTime: `2026-08-${String(18 + (index % 3)).padStart(2, '0')}T0${index % 6}:${String(
        (index * 7) % 60
      ).padStart(2, '0')}:00Z`,
      IPAddress: '203.0.113.42',
      Country: 'IT',
      City: index % 2 === 0 ? 'Verone' : 'Sacconago',
      Status: 'Success',
      AppDisplayName: index % 3 === 0 ? 'Microsoft Graph' : 'Office365 Shell WCSS-Server',
      ForeignLocation: true,
    }
  }
  return {
    CreatedDateTime: `2026-08-1${index % 8}T02:${String(index % 60).padStart(2, '0')}:00Z`,
    IPAddress: `198.51.100.${index % 40}`,
    Country: index % 2 === 0 ? 'CN' : 'IN',
    Status: 'Failed',
    ForeignLocation: true,
  }
}

const sentMessage = (index) => ({
  MessageTraceId: `m${index}`,
  Subject:
    index % 17 === 0
      ? 'Reponse automatique : absence'
      : index % 5 === 0
        ? 'Mise a jour bancaire'
        : `Re: dossier ${index % 23}`,
  RecipientAddress:
    index % 4 === 0 ? `colleague${index % 9}@contoso.test` : `contact${index % 31}@client${index % 7}.test`,
  Received: `2026-08-${String(14 + (index % 6)).padStart(2, '0')}T0${index % 9}:${String(
    index % 60
  ).padStart(2, '0')}:00Z`,
  FromIP: index % 17 === 0 ? '2603:10a6:803:81::32' : '203.0.113.42',
  ForeignLocation: true,
})

const becData = {
  ExtractedAt: '2026-08-20T10:32:00Z',
  AnalysisWindowDays: 7,
  ExtractResult: 'Successfully extracted logs from auditlog',
  NewRules: [
    { Name: 'copie', ForwardTo: 'attacker@evil.test', RecentlyChanged: true },
    { Name: 'classement', MoveToFolder: 'DOSSIERS' },
  ],
  InboxRuleChanges: [],
  NewUsers: [],
  AddedApps: [],
  MaliciousSPs: [],
  MailboxPermissionChanges: [],
  MFADevices: Array.from({ length: 4 }, (_, index) => ({
    displayName: `methode ${index}`,
    createdDateTime: index === 0 ? '2026-08-19T09:00:00Z' : '2024-06-19T09:21:00Z',
  })),
  ChangedPasswords: [{ userPrincipalName: 'other@contoso.test' }],
  TrustedSenders: Array.from({ length: 51 }, (_, index) => `trusted${index}@vendor.test`),
  BlockedSenders: Array.from({ length: 227 }, (_, index) => `spam${index}@spam.test`),
  SafelistChanges: [],
  SharingChanges: [],
  IntuneDevices: [],
  SuspectUserSignIns: Array.from({ length: 135 }, (_, index) => signIn(index)),
  SentMessages: Array.from({ length: 262 }, (_, index) => sentMessage(index)),
  SentMessageAnalysis: {
    TotalMessages: 262,
    TotalRecipients: 262,
    RepeatedSubjects: [{ Subject: 'Mise a jour bancaire', Count: 53, Flagged: true }],
    Bursts: [{ WindowStart: '2026-08-19T07:10:00Z', WindowMinutes: 10, MessageCount: 12, RecipientCount: 31 }],
    Flagged: true,
  },
  LocationAnalysis: { UsageLocation: 'FR', SignInCountries: [] },
}

const remediation = {
  ActionsPerformed: [
    {
      Action: 'PasswordReset',
      Count: 1,
      FirstUtc: '2026-08-20T13:00:00Z',
      Operator: 'analyste@example.test',
      HasFailure: false,
    },
    {
      Action: 'SessionsRevoked',
      Count: 1,
      FirstUtc: '2026-08-20T13:01:00Z',
      Operator: 'analyste@example.test',
      HasFailure: true,
    },
  ],
}

const triageCases = {
  'aucune qualification': [],
  'une connexion inattendue': [
    {
      SignalId: 'signin-ip:203.0.113.42',
      Verdict: 'unexpected',
      Analyst: 'analyste@example.test',
      DecidedUtc: '2026-08-20T13:02:00Z',
      Justification: 'titulaire du compte en France',
    },
  ],
  'tout attendu': [
    { SignalId: 'signin-ip:203.0.113.42', Verdict: 'expected', Analyst: 'analyste@example.test', DecidedUtc: '2026-08-20T13:02:00Z' },
    { SignalId: 'rule-filing:classement', Verdict: 'expected', Analyst: 'analyste@example.test', DecidedUtc: '2026-08-20T13:03:00Z' },
    { SignalId: 'mail-pattern', Verdict: 'expected', Analyst: 'analyste@example.test', DecidedUtc: '2026-08-20T13:04:00Z' },
    { SignalId: 'mfa-recent', Verdict: 'expected', Analyst: 'analyste@example.test', DecidedUtc: '2026-08-20T13:05:00Z' },
  ],
}

/** Every factual value the reports state. Names are what goes in the comparison table. */
const measure = (mod, triage) => {
  const signals = mod.signals.buildSignals(becData, userData)
  const verdict = mod.signals.buildVerdict(signals, triage)
  const window = mod.signals.getAnalysisWindow(becData)
  const groups = mod.signals.groupSignInsByIp(becData.SuspectUserSignIns)
  const mail = mod.signals.classifySentMessages(becData, userData)
  const timeline = mod.signals.buildTimeline(becData)
  const exposure = mod.incident.buildExposure(becData, signals, triage, userData)
  const thirdParties = mod.incident.buildThirdPartyExposure(becData, userData)
  const containment = mod.incident.buildContainment(remediation)
  const iocs = mod.iocs.buildIocs(becData, userData)
  const firstAccess = mod.signals.firstUnauthorisedAccessUtc(becData, signals, triage)

  const byClass = (name) => signals.filter((signal) => signal.class === name).length

  return {
    'signaux, total': signals.length,
    'signaux établis': byClass('established'),
    'signaux à qualifier': byClass('toQualify'),
    'signaux écartés (bruit)': byClass('noise'),
    'verdict, statut': verdict.status,
    'verdict, questions ouvertes': verdict.openQuestions.length,
    'fenêtre, début': window.startUtc,
    'fenêtre, fin': window.endUtc,
    'fenêtre, jours': window.days,
    'adresses de connexion distinctes': groups.length,
    'connexions réussies, total': groups.reduce((total, group) => total + group.successes, 0),
    'connexions en échec, total': groups.reduce((total, group) => total + group.failures, 0),
    'connexions réussies, IP principale': groups[0]?.successes ?? null,
    'IP principale': groups[0]?.ip ?? null,
    'première connexion, IP principale': groups[0]?.firstSeenUtc ?? null,
    'dernière connexion, IP principale': groups[0]?.lastSeenUtc ?? null,
    'premier accès non autorisé retenu': firstAccess,
    'lignes de suivi collectées': mail.counts.collected,
    'messages générés par le service': mail.counts.systemGenerated,
    'messages internes': mail.counts.internal,
    'messages externes humains': mail.counts.humanExternal,
    'messages hors zone, humains externes': mail.foreignHumanExternal.length,
    'événements de chronologie': timeline.length,
    'événements hors fenêtre': (timeline.context || []).length,
    'accès établi': exposure.accessEstablished,
    'bases de l’accès': exposure.accessBasis.length,
    'voies d’exfiltration': exposure.exfiltration.length,
    'voies d’exfiltration, libellés': exposure.exfiltration.map((item) => item.label).join(' | '),
    'lecture des messages, statut': exposure.mailReadSuggested,
    'points non couverts': exposure.notCovered.length,
    'correspondants externes distincts': exposure.correspondentFloor.distinct,
    'suivi tronqué': exposure.correspondentFloor.truncated,
    'destinataires en annexe': thirdParties.recipients.length,
    'domaines en annexe': thirdParties.domains.length,
    'annexe, exclus service': thirdParties.excluded.systemGenerated,
    'annexe, exclus internes': thirdParties.excluded.internal,
    'annexe, tronquée': thirdParties.truncated,
    'actions de confinement, total': containment.length,
    'actions attestées': containment.filter((action) => action.done).length,
    'actions en erreur': containment.filter((action) => action.hasFailure).length,
    'indicateurs, total': iocs.total,
    'indicateurs, adresses de connexion': iocs.signInIps.length,
    'indicateurs, adresses d’envoi': iocs.sendingIps.length,
    'indicateurs, cibles de transfert': iocs.forwardTargets.length,
    'collecte, statut': mod.collection.getCollectionStatus(becData, { nowUtc: '2026-08-21T08:00:00Z' })
      .status,
  }
}

const beforeDir = extract('before', BEFORE)
const afterDir = extract('after', null)
const before = await load(beforeDir)
const after = await load(afterDir)

const rows = []
let differences = 0
for (const [caseName, triage] of Object.entries(triageCases)) {
  const a = measure(before, triage)
  const b = measure(after, triage)
  for (const key of Object.keys(a)) {
    const same = JSON.stringify(a[key]) === JSON.stringify(b[key])
    if (!same) differences += 1
    rows.push({ cas: caseName, valeur: key, avant: a[key], apres: b[key], identique: same })
  }
}

const pad = (value, width) => String(value).padEnd(width)
const widest = rows.reduce((max, row) => Math.max(max, row.valeur.length), 0)

let currentCase = null
for (const row of rows) {
  if (row.cas !== currentCase) {
    currentCase = row.cas
    console.log(`\n--- cas : ${currentCase}`)
  }
  const flag = row.identique ? '  ' : 'XX'
  console.log(
    `${flag} ${pad(row.valeur, widest)}  ${pad(JSON.stringify(row.avant), 34)}  ${JSON.stringify(
      row.apres
    )}`
  )
}

if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(rows, null, 2))

console.log(
  `\n${rows.length} valeurs comparées sur ${Object.keys(triageCases).length} cas de qualification.`
)
if (differences > 0) {
  console.error(`${differences} écart(s) : défaut bloquant.`)
  process.exit(1)
}
console.log('Aucun écart : la révision n’a modifié aucune valeur.')
