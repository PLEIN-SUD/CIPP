// @vitest-environment node
import { mkdirSync, writeFileSync } from 'node:fs'
import { renderToBuffer } from '@react-pdf/renderer'
import { pdfText } from './psit-pdf-text'
import { PsitBecIncidentReportDocument } from '../../src/components/psit/PsitBecIncidentReport'
import { PsitBecReportFrDocument } from '../../src/components/psit/PsitBecReportFr'

// The four exposure states, rendered.
//
// The distinction these tests exist to protect: "not referenced in public breaches" and "we could
// not check" must never print the same paragraph. The second dressed as the first is a false
// statement in a document a client may hand to an insurer, and it is the kind of falsehood that
// happens by omission - a block that renders nothing when the service is down reads as a clean
// result to everyone except the person who wrote the code.
//
// Also asserted: no breach is NAMED in the client report. Which services an employee used is not
// the controller's business; the count and the kinds of data are.

const OUT_DIR = 'psit/render-samples'

const render = async (element, name) => {
  const buffer = await renderToBuffer(element)
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(`${OUT_DIR}/${name}.pdf`, buffer)
  return { buffer, text: pdfText(buffer) }
}

const userData = {
  id: 'user-guid',
  displayName: 'P Martin',
  userPrincipalName: 'p.martin@contoso.test',
}

const incident = {
  Reference: 'PSIT-BEC-20260820-AFF6',
  AutotaskTicket: 'T20260820.0013',
  Tlp: 'TLP:AMBER+STRICT',
  DetectedUtc: '2026-08-20T09:00:00Z',
  Status: 'contained',
  UpdatedBy: 'analyste@example.test',
  UpdatedUtc: '2026-08-20T14:00:00Z',
  CreatedUtc: '2026-08-20T09:30:00Z',
}

/**
 * A one-pixel PNG as a data URI: what the collection stores, small enough to sit in a fixture.
 *
 * Built and checked rather than copied from memory. The first attempt here was a base64 string that
 * looked like a PNG and whose zlib stream failed its checksum, and react-pdf does not raise on that
 * - it HANGS. Two renders sat at the 120-second timeout with no error until zlib surfaced
 * Z_DATA_ERROR from somewhere inside an unresolved promise.
 */
const LOGO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNoAAAAggCBd81ytgAAAABJRU5ErkJggg=='

const breach = (name, date, classes, password, logo = null) => ({
  Name: name,
  BreachDate: date,
  DataClasses: classes,
  Password: password,
  ...(logo ? { Logo: logo } : {}),
})

const becData = (breachExposure) => ({
  ExtractedAt: '2026-08-20T10:32:00Z',
  AnalysisWindowDays: 7,
  NewRules: [],
  InboxRuleChanges: [],
  NewUsers: [],
  AddedApps: [],
  MaliciousSPs: [],
  MailboxPermissionChanges: [],
  MFADevices: [],
  ChangedPasswords: [],
  TrustedSenders: [],
  BlockedSenders: [],
  SafelistChanges: [],
  SharingChanges: [],
  IntuneDevices: [],
  SuspectUserSignIns: [
    {
      CreatedDateTime: '2026-08-20T06:49:00Z',
      IPAddress: '203.0.113.42',
      Country: 'IT',
      City: 'Verone',
      Status: 'Success',
      AppDisplayName: 'Microsoft Graph',
      ForeignLocation: true,
    },
  ],
  SentMessages: [],
  SentMessageAnalysis: { TotalRecipients: 0, RepeatedSubjects: [], Bursts: [] },
  LocationAnalysis: { UsageLocation: 'FR' },
  ...(breachExposure === undefined ? {} : { BreachExposure: breachExposure }),
})

const ok = (breaches) => ({
  Status: 'ok',
  CheckedUtc: '2026-08-20T10:32:00Z',
  Source: 'Have I Been Pwned (api/v3/breachedaccount)',
  Addresses: ['p.martin@contoso.test', 'pm@contoso.test'],
  Breaches: breaches,
})

const incidentDocument = (data) => (
  <PsitBecIncidentReportDocument
    userData={userData}
    becData={data}
    brandingSettings={{}}
    tenantName="contoso.test"
    variables={{}}
    triage={[]}
    incident={incident}
    remediation={{}}
  />
)

const investigationDocument = (data) => (
  <PsitBecReportFrDocument
    userData={userData}
    becData={data}
    brandingSettings={{}}
    tenantName="contoso.test"
    variables={{}}
    triage={[]}
    incident={incident}
  />
)

const TIMEOUT = 120000
const flatten = (text) => text.replace(/[ \t\n\r]+/g, ' ')

describe('rendered PDF, breach exposure in the client report', () => {
  it(
    'state 1: exposure with passwords, aggregated and without naming a breach',
    async () => {
      const { text } = await render(
        incidentDocument(
          becData(
            ok([
              breach('Dropbox', '2012-07-01', ['Email addresses', 'Passwords'], true),
              breach('Adobe', '2013-10-04', ['Email addresses', 'Password hints', 'Passwords'], true),
              breach('Forum', '2021-03-15', ['Email addresses'], false),
            ])
          )
        ),
        'exposition-etat1-mots-de-passe'
      )
      const flat = flatten(text)

      expect(flat).toContain(
        "L'adresse p.martin@contoso.test figure dans 3 compromissions de données publiques entre 2012 et 2021"
      )
      expect(flat).toContain('dont 2 compromissions de données publiques exposant des mots de passe')
      expect(flat).toContain("elle n'établit pas le vecteur d'accès initial de l'incident")
      expect(flat).toContain('Vérification effectuée le 20 août 2026 à 10:32 UTC via Have I Been Pwned')
      // Aggregate only. No breach is named in the document the client reads.
      expect(flat).not.toContain('Dropbox')
      expect(flat).not.toContain('Adobe')
      expect(flat).not.toContain('Forum')
      // And the reset recommendation appears, because an exposure was found.
      expect(flat).toContain('Réinitialisation des mots de passe réutilisés')
    },
    TIMEOUT
  )

  it(
    'state 2: exposure with no password, same reserve, no password clause',
    async () => {
      const { text } = await render(
        incidentDocument(becData(ok([breach('Forum', '2021-03-15', ['Usernames'], false)]))),
        'exposition-etat2-sans-mot-de-passe'
      )
      const flat = flatten(text)

      expect(flat).toContain('figure dans 1 compromission de données publiques entre 2021 et 2021')
      expect(flat).not.toContain('exposant des mots de passe')
      expect(flat).toContain("elle n'établit pas le vecteur d'accès initial de l'incident")
      // The reset still applies: a reused password is a risk even with no password in the dump.
      expect(flat).toContain('Réinitialisation des mots de passe réutilisés')
    },
    TIMEOUT
  )

  it(
    'state 3: nothing referenced, and the coverage reserve that goes with it',
    async () => {
      const { text } = await render(
        incidentDocument(becData(ok([]))),
        'exposition-etat3-aucune'
      )
      const flat = flatten(text)

      expect(flat).toContain("L'adresse ne figure pas dans les compromissions publiques référencées")
      expect(flat).toContain("L'absence de référencement ne vaut pas absence de compromission")
      expect(flat).toContain('la couverture des bases publiques est partielle')
      expect(flat).toContain('Vérification effectuée le 20 août 2026')
      // No exposure, so no reset recommendation on that ground.
      expect(flat).not.toContain('Réinitialisation des mots de passe réutilisés')
    },
    TIMEOUT
  )

  it(
    'state 4: the check could not run, and the block says so instead of vanishing',
    async () => {
      for (const [status, fragment, name] of [
        ['not-configured', 'configuré', 'exposition-etat4-non-configure'],
        ['rate-limited', 'quota', 'exposition-etat4-quota'],
        ['error', 'indisponible', 'exposition-etat4-indisponible'],
      ]) {
        const { text } = await render(
          incidentDocument(becData({ ...ok([]), Status: status })),
          name
        )
        const flat = flatten(text)

        expect(flat).toContain("La vérification d'exposition n'a pas pu être effectuée")
        expect(flat).toContain(fragment)
        // Never the sentence of state 3: that would assert a result nobody obtained.
        expect(flat).not.toContain("L'adresse ne figure pas dans les compromissions publiques")
        expect(flat).not.toContain('Vérification effectuée le')
        expect(flat).not.toContain('Réinitialisation des mots de passe réutilisés')
      }
    },
    TIMEOUT
  )

  it(
    'a dossier collected before the feature reads as unchecked, not as clear',
    async () => {
      const { text } = await render(
        incidentDocument(becData(undefined)),
        'exposition-dossier-ancien'
      )
      const flat = flatten(text)

      expect(flat).toContain("La vérification d'exposition n'a pas pu être effectuée")
      expect(flat).toContain('antérieure')
      expect(flat).not.toContain("L'adresse ne figure pas dans les compromissions publiques")
    },
    TIMEOUT
  )

  it(
    'says which year is missing rather than printing undefined',
    async () => {
      const { text } = await render(
        incidentDocument(becData(ok([breach('Undated', null, ['Passwords'], true)]))),
        'exposition-sans-date'
      )
      const flat = flatten(text)

      expect(flat).toContain('année non déterminée')
      expect(flat).not.toContain('undefined')
      expect(flat).not.toContain('NaN')
    },
    TIMEOUT
  )

  it(
    'stays aggregate and stable on a high count',
    async () => {
      const many = Array.from({ length: 34 }, (unused, index) =>
        breach(`Service ${index}`, `20${String(10 + (index % 12)).padStart(2, '0')}-06-01`, ['Passwords'], index % 2 === 0)
      )
      const { text } = await render(
        incidentDocument(becData(ok(many))),
        'exposition-nombre-eleve'
      )
      const flat = flatten(text)

      expect(flat).toContain('figure dans 34 compromissions de données publiques')
      expect(flat).toContain('dont 17 compromissions de données publiques exposant des mots de passe')
      // Aggregate stays aggregate: thirty-four names would be a page of them.
      expect(flat).not.toContain('Service 0')
      expect(flat).not.toContain('Service 33')
    },
    TIMEOUT
  )
})

describe('rendered PDF, breach exposure in the investigation report', () => {
  it(
    'names the breaches, with their dates, classes and password flag',
    async () => {
      const { text } = await render(
        investigationDocument(
          becData(
            ok([
              breach('Dropbox', '2012-07-01', ['Email addresses', 'Passwords'], true, LOGO),
              breach('Forum', '2021-03-15', ['Usernames'], false),
            ])
          )
        ),
        'investigation-exposition'
      )
      const flat = flatten(text)

      // This is the one document where a breach is named.
      expect(flat).toContain('Dropbox')
      expect(flat).toContain('Forum')
      expect(flat).toContain('2012-07-01')
      expect(flat).toContain('exposés')
      expect(flat).toContain('non exposés')
      expect(flat).toContain('Usernames')
      // Both looked-up addresses are stated: a report that cannot say what it examined asserts a
      // coverage nobody can reconstruct.
      expect(flat).toContain('p.martin@contoso.test et pm@contoso.test')
      expect(flat).toContain('1 compromission de données publiques sur 2 expose des mots de passe')
      expect(flat).toContain(
        "Aucun mot de passe ni fragment n'est collecté"
      )
    },
    TIMEOUT
  )

  it(
    'keeps the annex when the check found nothing, and says so',
    async () => {
      const { text } = await render(
        investigationDocument(becData(ok([]))),
        'investigation-exposition-aucune'
      )
      const flat = flatten(text)

      // The page stays: a check that ran and returned nothing is a finding, and a page that
      // vanishes is also what used to shift the lettering of the annexes after it.
      expect(flat).toContain("exposition publique de l'identifiant")
      expect(flat).toContain('ne figure pas dans les compromissions publiques référencées')
      expect(flat).toContain('p.martin@contoso.test et pm@contoso.test')
      expect(flat).toContain('Vérification effectuée')
      // No breach table when there is nothing to put in it.
      expect(flat).not.toContain('Compromissions référencées')
    },
    TIMEOUT
  )

  it(
    'keeps the annex when the check could not run, with the reason',
    async () => {
      const { text } = await render(
        investigationDocument(becData({ ...ok([]), Status: 'error' })),
        'investigation-exposition-echec'
      )
      const flat = flatten(text)

      expect(flat).toContain("exposition publique de l'identifiant")
      expect(flat).toContain("n'a pas pu être effectuée")
      expect(flat).toContain('service indisponible')
      expect(flat).not.toContain('Compromissions référencées')
    },
    TIMEOUT
  )

  it(
    'keeps a breach whose logo is missing, without a hole in the row',
    async () => {
      const { text } = await render(
        investigationDocument(
          becData(ok([breach('WithLogo', '2015-01-01', ['Passwords'], true, LOGO), breach('NoLogo', '2016-01-01', ['Passwords'], true)]))
        ),
        'investigation-exposition-sans-logo'
      )
      const flat = flatten(text)

      expect(flat).toContain('WithLogo')
      expect(flat).toContain('NoLogo')
    },
    TIMEOUT
  )
})
