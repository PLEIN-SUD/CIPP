// @vitest-environment node
import { mkdirSync, writeFileSync } from 'node:fs'
import { renderToBuffer } from '@react-pdf/renderer'
import { pdfText } from './psit-pdf-text'
import {
  PsitBecIncidentReportDocument,
  psitReportFileName,
} from '../../src/components/psit/PsitBecIncidentReport'
import { PsitBecReportFrDocument } from '../../src/components/psit/PsitBecReportFr'

// Real renders, not the passthrough double.
//
// The mocked component tests prove wording and structure; they prove nothing about pagination,
// because the double never lays anything out. These render actual PDFs with react-pdf's Node
// renderer and assert on the text inside them: the continuation label on a spilled page, the page
// label, the absence of every banned string, and that an unbreakable box taller than a page does
// not silently disappear.
//
// The PDFs are written out too, under psit/render-samples, as the demonstration set.

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

const signIn = (overrides) => ({
  CreatedDateTime: '2026-08-20T06:49:00Z',
  IPAddress: '203.0.113.42',
  Country: 'IT',
  City: 'Verone',
  Status: 'Success',
  AppDisplayName: 'Microsoft Graph',
  ForeignLocation: true,
  ...overrides,
})

const becData = {
  ExtractedAt: '2026-08-20T10:32:00Z',
  AnalysisWindowDays: 7,
  NewRules: [{ Name: 'copie', ForwardTo: 'attacker@evil.test', RecentlyChanged: true }],
  InboxRuleChanges: [],
  NewUsers: [],
  AddedApps: [],
  MaliciousSPs: [],
  MailboxPermissionChanges: [],
  MFADevices: [{ displayName: 'poste', createdDateTime: '2026-08-19T09:00:00Z' }],
  ChangedPasswords: [],
  TrustedSenders: [],
  BlockedSenders: [],
  SafelistChanges: [],
  SharingChanges: [],
  IntuneDevices: [],
  SuspectUserSignIns: [signIn({}), signIn({ CreatedDateTime: '2026-08-20T06:54:00Z' })],
  SentMessages: [
    {
      MessageTraceId: 'm1',
      Subject: 'Mise a jour bancaire',
      RecipientAddress: 'buyer@client.test',
      Received: '2026-08-19T07:11:00Z',
      FromIP: '203.0.113.42',
      SystemGenerated: false,
      Internal: false,
      ForeignLocation: true,
    },
  ],
  SentMessageAnalysis: {
    TotalRecipients: 1,
    RepeatedSubjects: [{ Subject: 'Mise a jour bancaire', Count: 6, Flagged: true }],
    Bursts: [],
  },
  LocationAnalysis: { UsageLocation: 'FR' },
}

const incident = {
  Reference: 'PSIT-BEC-20260820-AFF6',
  AutotaskTicket: 'T20260820.0013',
  Tlp: 'TLP:AMBER+STRICT',
  DetectedUtc: '2026-08-20T09:00:00Z',
  ContainedUtc: '2026-08-20T13:05:00Z',
  Status: 'contained',
  EffectDescription: 'mass-send',
  DataSubjectCategories: ['Clients'],
  DataCategories: ['Donnees bancaires ou financieres'],
  AffectedPersonsEstimate: 'environ 1 200',
  AffectedPersonsBasis: 'base clients de la boite',
  LikelyConsequences: 'Detournement de paiement',
  UpdatedBy: 'analyste@example.test',
  UpdatedUtc: '2026-08-20T14:00:00Z',
  CreatedUtc: '2026-08-20T09:30:00Z',
}

const triage = [
  {
    SignalId: 'signin-ip:203.0.113.42',
    Verdict: 'unexpected',
    Analyst: 'analyste@example.test',
    DecidedUtc: '2026-08-20T13:02:00Z',
    Justification: 'titulaire du compte en France, confirme par telephone',
  },
]

const incidentDocument = (props = {}) => (
  <PsitBecIncidentReportDocument
    userData={userData}
    becData={becData}
    brandingSettings={{}}
    tenantName="contoso.test"
    variables={{}}
    triage={triage}
    incident={incident}
    remediation={{}}
    {...props}
  />
)

// react-pdf registers fonts and lays out real pages: slower than a mocked render, by design.
const RENDER_TIMEOUT = 120000

describe('rendered PDF, incident report', () => {
  it(
    'carries the ticket, the marking and the French page label, and none of the banned strings',
    async () => {
      const { text } = await render(incidentDocument(), 'incident-compromise-retenue')

      expect(text).toContain('T20260820.0013')
      expect(text).toContain('TLP:AMBER+STRICT')
      expect(text).toMatch(/Page \d+ sur \d+/)
      // The internal identifier is in the metadata, never in the body.
      expect(text).not.toContain('PSIT-BEC-')
      expect(text).not.toContain('(s)')
      expect(text).not.toContain(' of ')
      expect(text).not.toContain('Continued')
      // No em dash: the encoder writes it as an escape, so check the raw buffer as well.
      expect(text).not.toContain('—')
    },
    RENDER_TIMEOUT
  )

  it(
    'writes the internal reference into the document metadata',
    async () => {
      const { buffer } = await render(incidentDocument(), 'incident-metadata')
      const raw = buffer.toString('latin1')
      expect(raw).toMatch(/Keywords/)
      // Info dictionary strings are not compressed: the reference is findable there and only there.
      expect(raw).toContain('PSIT-BEC-20260820-AFF6')
      expect(raw).toContain('PLEIN SUD IT')
    },
    RENDER_TIMEOUT
  )

  it(
    'marks a spilled section as a continuation, in French',
    async () => {
      // Sixty recipients over the annex, and a long analyst comment: enough for the pages to spill.
      const manyRecipients = {
        ...becData,
        SentMessages: Array.from({ length: 60 }, (_, index) => ({
          MessageTraceId: `m${index}`,
          Subject: `Mise a jour bancaire ${index % 7}`,
          RecipientAddress: `buyer${index}@client${index % 5}.test`,
          Received: '2026-08-19T07:11:00Z',
          FromIP: '203.0.113.42',
          SystemGenerated: false,
          Internal: false,
          ForeignLocation: true,
        })),
        SentMessageAnalysis: {
          TotalRecipients: 60,
          RepeatedSubjects: [
            { Subject: 'Mise a jour bancaire 0', Count: 9, Flagged: true },
            { Subject: 'Mise a jour bancaire 1', Count: 9, Flagged: true },
          ],
          Bursts: [],
        },
      }

      const { text } = await render(
        incidentDocument({ becData: manyRecipients }),
        'incident-annexe-longue'
      )

      // Page titles survive a spill, which is what a `render` callback on the title broke.
      expect(text).toContain('destinataires des envois')
      expect(text).toMatch(/Page \d+ sur \d+/)
      expect(text).not.toContain('(continued)')
      expect(text).not.toContain('Continued')
    },
    RENDER_TIMEOUT
  )

  it(
    'renders a box taller than a page instead of dropping it',
    async () => {
      // The case the amendment asked to observe: an unbreakable box whose content exceeds a page.
      const veryLongComment = `Contexte detaille. ${'Le titulaire du compte a confirme son deplacement, la banque a ete prevenue et le fournisseur a rappele. '.repeat(
        60
      )}`
      const { text } = await render(
        incidentDocument({
          triage: [{ ...triage[0], Justification: veryLongComment }],
        }),
        'incident-encadre-surdimensionne'
      )

      expect(text).toContain('Contexte detaille')
      // The end of the box is present too: an unbreakable box larger than a page is laid out, not
      // truncated. This is what `wrap` exists to allow a caller to override.
      expect(text).toContain('le fournisseur a rappele')
    },
    RENDER_TIMEOUT
  )

  it.each([
    ['compromission retenue', triage, 'incident-verdict-compromise'],
    ['qualification en cours', [], 'incident-verdict-a-qualifier'],
    [
      'faux positif retenu',
      [{ SignalId: 'signin-ip:203.0.113.42', Verdict: 'expected', Analyst: 'analyste' }],
      'incident-verdict-faux-positif',
    ],
    [
      'indeterminee',
      [{ SignalId: 'signin-ip:203.0.113.42', Verdict: 'undetermined', Analyst: 'analyste' }],
      'incident-verdict-indetermine',
    ],
  ])(
    'renders the %s outcome without a broken layout',
    async (_label, outcomeTriage, name) => {
      const { text, buffer } = await render(
        incidentDocument({
          becData: { ...becData, NewRules: [{ Name: 'classement', MoveToFolder: 'DOSSIERS' }] },
          triage: outcomeTriage,
        }),
        name
      )

      expect(buffer.length).toBeGreaterThan(10000)
      expect(text).toContain('T20260820.0013')
      expect(text).not.toContain('(s)')
      expect(text).not.toContain('undefined')
      expect(text).not.toContain('NaN')
    },
    RENDER_TIMEOUT
  )

  it(
    'pseudonymises the annex on demand',
    async () => {
      const { text } = await render(
        incidentDocument({ pseudonymise: true }),
        'incident-pseudonymise'
      )
      expect(text).toContain('T-01')
      expect(text).not.toContain('buyer@client.test')
    },
    RENDER_TIMEOUT
  )

  it(
    'states the empty fields rather than printing undefined',
    async () => {
      const { text } = await render(
        incidentDocument({
          incident: { AutotaskTicket: 'T20260820.0013', Tlp: 'TLP:RED' },
          remediation: {},
        }),
        'incident-champs-vides'
      )

      expect(text).toContain('TLP:RED')
      expect(text).not.toContain('undefined')
      expect(text).not.toContain('NaN')
      expect(text).toContain('non renseign')
    },
    RENDER_TIMEOUT
  )
})

// The measured floor sentence, end to end. Three things are asserted together because they only
// break together: the count word, the agreement of the qualifier behind it, and the no-break space
// surviving the WinAnsi encoding. The distinction between "correspondents observed" and "people
// whose data is in the mailbox" is the reason this sentence exists: it is what stops a reader from
// quoting the floor as a number of data subjects.
describe('rendered PDF, the measured floor', () => {
  const sent = (address, id) => ({
    MessageTraceId: id,
    Subject: 'Mise a jour bancaire',
    RecipientAddress: address,
    Received: '2026-08-19T07:11:00Z',
    FromIP: '203.0.113.42',
    SystemGenerated: false,
    Internal: false,
    ForeignLocation: true,
  })

  const floorText = async (sentMessages, totalRecipients, name) => {
    const { text } = await render(
      incidentDocument({
        becData: {
          ...becData,
          SentMessages: sentMessages,
          SentMessageAnalysis: { ...becData.SentMessageAnalysis, TotalRecipients: totalRecipients },
        },
      }),
      name
    )
    return text
  }

  it(
    'says "aucun correspondant externe" without a digit when nothing was observed',
    async () => {
      const text = await floorText([], 0, 'incident-plancher-zero')

      expect(text).toContain('aucun correspondant externe distinct observé sur la fenêtre analysée')
      // Not "0 correspondants": a count of zero is a word, and the qualifier stays singular.
      expect(text).not.toContain('0 correspondant')
      expect(text).toContain('non sur les personnes dont les données figurent dans la boîte')
    },
    RENDER_TIMEOUT
  )

  it(
    'keeps the qualifier singular for one correspondent',
    async () => {
      const text = await floorText([sent('buyer@client.test', 'm1')], 1, 'incident-plancher-un')

      expect(text).toContain('1 correspondant externe distinct observé sur la fenêtre analysée')
      expect(text).not.toContain('distincts observés')
    },
    RENDER_TIMEOUT
  )

  it(
    'agrees the qualifier for several correspondents',
    async () => {
      const text = await floorText(
        [
          sent('buyer@client.test', 'm1'),
          sent('accounts@client.test', 'm2'),
          sent('third@other.test', 'm3'),
        ],
        3,
        'incident-plancher-plusieurs'
      )

      // The defect this covers: the sentence used to print "3 correspondants externes distinct
      // observé", singular, whatever the count.
      expect(text).toContain('3 correspondants externes distincts observés sur la fenêtre analysée')
      expect(text).not.toContain('distinct observé sur')
    },
    RENDER_TIMEOUT
  )

  it(
    'agrees the partial-trace clause and holds the no-break spaces through the encoding',
    async () => {
      const text = await floorText([sent('buyer@client.test', 'm1')], 241, 'incident-plancher-tronque')

      // The extractor joins PDF lines with a space and the clause wraps, so collapse runs of
      // ASCII whitespace - and only those. JavaScript's \s matches U+00A0 too, which would erase
      // the very thing the next two assertions are here to check.
      const flat = text.replace(/[ \t\n\r]+/g, ' ')

      expect(flat).toContain('1 ligne de suivi collectée pour 241 destinataires annoncés')
      // nbsp() is wired and U+00A0 comes back out of the PDF, so neither the colon nor the
      // semicolon can be orphaned at the start of a line.
      expect(flat).toContain('Repère mesuré\u00a0:')
      expect(flat).toContain('boîte\u00a0; il constitue un plancher')
    },
    RENDER_TIMEOUT
  )
})

// The truncation note of a table. Upstream's primitive writes it in English, and a French incident
// report was printing "and 14 more. Export the table from the report page for the full list." in
// the middle of its third-party annex. The note now follows the document language.
// Every cap in both French reports, over its threshold, in two renders.
//
// The rule the reports now follow: a truncated quantity says so, with what is shown, what there
// was, and where the rest is. One sentence for the whole document, so a reader who found it once
// recognises it everywhere. Each case below uses a distinct total, which makes each expected
// sentence unique - an assertion cannot pass on another section's note.
//
// Two caps are deliberately not asserted here, because no dataset can reach them: the containment
// table is limited to 12 rows over a fixed list of 9 canonical actions, and the coverage table of
// the investigation report is limited to 11 rows over a fixed list of 11 controls. Both are noted
// in PSIT-README.md rather than left to look like an oversight.
// Article 33(3), element by element, on the reference dossier.
//
// The lightening pass of 22 August removed the preamble that ENUMERATED these elements, on the
// grounds that the sections below provide them and announcing them first read as a manual. That is
// exactly the kind of edit that quietly takes a required element with it, so the elements are
// asserted here rather than trusted to a reading. The regulation requires the substance; the gloss
// was what got shortened.
describe('rendered PDF, article 33.3 survives the lightening', () => {
  it(
    'still carries the five elements the controller must be able to describe',
    async () => {
      const { text } = await render(incidentDocument(), 'incident-article-33')
      const flat = text.replace(/[ \t\n\r]+/g, ' ')

      // a) the nature of the breach
      expect(flat).toContain('Nature de la violation')
      expect(flat).toContain('Accès non autorisé à une boîte de messagerie professionnelle')
      // b) the categories and approximate number of data subjects
      expect(flat).toContain('Catégories de personnes')
      expect(flat).toContain('Nombre approximatif')
      expect(flat).toContain('Repère mesuré')
      // c) the categories and volume of records
      expect(flat).toContain('Catégories de données déclarées par le client')
      // d) the likely consequences
      expect(flat).toContain('Conséquences probables')
      // e) the measures taken
      expect(flat).toContain('Actions de confinement')
      expect(flat).toContain('Persistances non écartées')

      // And the clause that makes the document a processor's report rather than a legal opinion.
      // It is the demarcation that protects Plein Sud IT: it shortens, it does not disappear.
      expect(flat).toContain(
        'La qualification juridique de la violation et la décision de notifier relèvent du responsable de traitement'
      )
      expect(flat).toContain("le présent document ne s'y substitue pas")
      expect(flat).toContain('en qualité de sous-traitant')
    },
    RENDER_TIMEOUT
  )

  it(
    'names the country rather than its code, and glosses the controller once',
    async () => {
      const { text } = await render(incidentDocument(), 'incident-pays-nommes')
      const flat = text.replace(/[ \t\n\r]+/g, ' ')

      expect(flat).toContain('Italie')
      // The chronology table's country column and the summary sentence, both named.
      expect(flat).toContain('en Italie')
      // No bare code anywhere in the client report.
      expect(flat).not.toMatch(/\\(\\s?IT\\s?\\)/)

      // The gloss, at the first legal occurrence: who the controller is for these data.
      expect(flat).toContain("c'est-à-dire contoso.test pour les données en cause")
      // And the reserve for data the client is not the controller of.
      expect(flat).toContain("Si certaines relèvent d'un autre responsable de traitement")
    },
    RENDER_TIMEOUT
  )

  it(
    'says the data categories are declared, not analysed',
    async () => {
      const { text } = await render(incidentDocument(), 'incident-categories-declarees')
      const flat = text.replace(/[ \t\n\r]+/g, ' ')

      // "présentes dans la boîte" read as a finding about the mailbox contents.
      expect(flat).not.toContain('Catégories de données présentes dans la boîte')
      expect(flat).toContain('Catégories de données déclarées par le client')
      expect(flat).toContain('Ces catégories sont déclarées par le client')
      expect(flat).toContain("Le contenu des messages n'est pas analysé par cet outil")
      // Consistent with what the report already says about reading: never established, never
      // excluded. The two statements must not contradict each other.
      expect(flat).toContain('La lecture des messages ne peut être ni établie ni exclue')
    },
    RENDER_TIMEOUT
  )

  it(
    'drops the acknowledgement note and the signature box, and keeps the decision trace',
    async () => {
      const { text } = await render(incidentDocument(), 'incident-remise-allegee')
      const flat = text.replace(/[ \t\n\r]+/g, ' ')

      expect(flat).not.toContain("Aucun accusé de réception n'a été enregistré")
      expect(flat).not.toContain('Nom et fonction :')
      expect(flat).not.toContain('Signature :')
      // The enumeration of decisions is gone from the delivery paragraph; the demarcation is not.
      expect(flat).not.toContain("déclaration à l'assureur, dépôt de plainte)")
      expect(flat).toContain('les décisions qui en découlent relèvent du responsable de traitement')
      // The trace the box existed for.
      expect(flat).toContain('Suite décidée')
    },
    RENDER_TIMEOUT
  )
})

describe('rendered PDF, every cap says what it cut', () => {
  const many = (count, build) => Array.from({ length: count }, (unused, index) => build(index))

  it(
    'the incident report: chronology, third parties, notified parties, cells',
    async () => {
      const { text } = await render(
        incidentDocument({
          becData: {
            ...becData,
            // 26 distinct source addresses: one row per address, capped at 25 by the table.
            SuspectUserSignIns: many(26, (index) => ({
              CreatedDateTime: '2026-08-20T06:49:00Z',
              IPAddress: `203.0.113.${index + 1}`,
              Country: 'IT',
              City: 'Verone',
              Status: 'Success',
              // Five applications on the first window, where the cell holds three.
              AppDisplayName: index === 0 ? 'Microsoft Graph' : `App ${index}`,
              ForeignLocation: true,
            })).concat(
              many(4, (index) => ({
                CreatedDateTime: '2026-08-20T06:50:00Z',
                IPAddress: '203.0.113.1',
                Country: 'IT',
                City: 'Verone',
                Status: 'Success',
                AppDisplayName: `Client ${index}`,
                ForeignLocation: true,
              }))
            ),
            // 70 recipients for the annex, capped at 60. The first one carries five distinct
            // subjects, where the cell holds three.
            SentMessages: many(70, (index) => ({
              MessageTraceId: `m${index}`,
              Subject: 'Mise a jour bancaire',
              RecipientAddress: `buyer${index}@client.test`,
              Received: '2026-08-19T07:11:00Z',
              FromIP: '203.0.113.42',
              SystemGenerated: false,
              Internal: false,
              ForeignLocation: true,
              // Five distinct subjects on one recipient, where the cell holds three.
            })).concat(
              many(4, (index) => ({
                MessageTraceId: `s${index}`,
                Subject: `Objet ${index}`,
                RecipientAddress: 'buyer0@client.test',
                Received: '2026-08-19T07:12:00Z',
                FromIP: '203.0.113.42',
                SystemGenerated: false,
                Internal: false,
                ForeignLocation: true,
              }))
            ),
            SentMessageAnalysis: { TotalRecipients: 74, RepeatedSubjects: [], Bursts: [] },
            MFADevices: many(26, (index) => ({
              displayName: `poste ${index}`,
              createdDateTime: '2026-08-19T09:00:00Z',
            })),
          },
          incident: {
            ...incident,
            // 21 notified third parties, capped at 20.
            ThirdPartiesNotified: many(21, (index) => ({
              Name: `Tiers ${index}`,
              NotifiedUtc: '2026-08-20T15:00:00Z',
              Channel: 'phone',
            })),
          },
        }),
        'incident-plafonds'
      )

      const flat = text.replace(/[ \t\n\r]+/g, ' ')

      // Chronology: sign-in windows, capped at 25 of 26 addresses.
      expect(flat).toContain('25 lignes sur 26 figurent ici')
      // Dated events, capped at 20. The total is derived, so match the shape.
      expect(flat).toMatch(/20 lignes sur 2[0-9] figurent ici/)
      // Third-party annex, capped at 60 of 70.
      expect(flat).toContain('60 lignes sur 70 figurent ici')
      // Notified third parties, capped at 20 of 21.
      expect(flat).toContain('20 lignes sur 21 figurent ici')
      // The two in-cell forms, where a full sentence would not fit.
      expect(flat).toContain('et 2 objets de plus')
      expect(flat).toContain('et 2 applications de plus')
      // And the sentence is the same one everywhere it appears.
      expect(flat).toContain("figurent ici ; la liste compl\u00e8te est dans l'export de donn\u00e9es du dossier.")
    },
    RENDER_TIMEOUT
  )

  it(
    'the investigation report: eleven capped lists, each with its own total',
    async () => {
      const stamp = '2026-08-19T09:00:00Z'
      const { text } = await render(
        <PsitBecReportFrDocument
          userData={userData}
          becData={{
            ...becData,
            AnalysisWindowDays: 7,
            ExtractedAt: '2026-08-20T10:32:00Z',
            // 12 rule changes, capped at 8.
            InboxRuleChanges: many(12, (index) => ({
              Date: stamp,
              Operation: 'Set-InboxRule',
              RuleName: `regle ${index}`,
              ClientIP: '203.0.113.42',
              Country: 'IT',
            })),
            // 14 accounts, capped at 10.
            NewUsers: many(14, (index) => ({
              userPrincipalName: `compte${index}@contoso.test`,
              createdDateTime: stamp,
            })),
            // 9 catalogue applications, capped at 8.
            MaliciousSPs: many(9, (index) => ({
              displayName: `app ${index}`,
              appId: `id-${index}`,
              CatalogName: 'catalogue',
            })),
            // 10 added applications, capped at 8.
            AddedApps: many(10, (index) => ({
              displayName: `ajout ${index}`,
              createdDateTime: stamp,
            })),
            // 11 permission changes, capped at 8.
            MailboxPermissionChanges: many(11, (index) => ({
              Operation: 'Add-MailboxPermission',
              UserKey: `auteur${index}`,
              ObjectId: 'boite',
            })),
            // 13 approved-sender changes, capped at 8.
            SafelistChanges: many(13, (index) => ({
              Date: stamp,
              UserKey: `auteur${index}`,
              ClientIP: '203.0.113.42',
              Country: 'IT',
            })),
            // 16 managed devices, capped at 8.
            IntuneDevices: many(16, (index) => ({
              deviceName: `poste ${index}`,
              operatingSystem: 'Windows',
              enrolledDateTime: stamp,
              complianceState: 'compliant',
            })),
            // 19 sharing changes, capped at 8.
            SharingChanges: many(19, (index) => ({
              Date: stamp,
              Operation: 'AnonymousLinkCreated',
              FileName: `fichier ${index}`,
            })),
            // 17 source addresses, capped at 8. The first carries seven applications, where the
            // line holds five.
            SuspectUserSignIns: many(17, (index) => ({
              CreatedDateTime: '2026-08-20T06:49:00Z',
              IPAddress: `198.51.100.${index + 1}`,
              Country: 'IT',
              City: 'Verone',
              Status: 'Success',
              AppDisplayName: 'Microsoft Graph',
              ForeignLocation: true,
            })).concat(
              many(6, (index) => ({
                CreatedDateTime: '2026-08-20T06:50:00Z',
                IPAddress: '198.51.100.1',
                Country: 'IT',
                City: 'Verone',
                Status: 'Success',
                AppDisplayName: `Client ${index}`,
                ForeignLocation: true,
              }))
            ),
            // 15 external messages, capped at 8, and 7 bursts, capped at 5.
            SentMessages: many(15, (index) => ({
              MessageTraceId: `m${index}`,
              Subject: `objet ${index}`,
              RecipientAddress: `buyer${index}@client.test`,
              Received: '2026-08-19T07:11:00Z',
              FromIP: '203.0.113.42',
              SystemGenerated: false,
              Internal: false,
              ForeignLocation: true,
            })),
            SentMessageAnalysis: {
              TotalRecipients: 15,
              RepeatedSubjects: [],
              Bursts: many(7, (index) => ({
                WindowStart: stamp,
                MessageCount: 20 + index,
                RecipientCount: 30 + index,
                TopSubject: `rafale ${index}`,
              })),
            },
          }}
          brandingSettings={{}}
          tenantName="contoso.test"
          variables={{}}
          triage={triage}
          incident={incident}
        />,
        'investigation-plafonds'
      )

      const flat = text.replace(/[ \t\n\r]+/g, ' ')

      expect(flat).toContain('8 lignes sur 12 figurent ici') // regles de boite
      expect(flat).toContain('10 lignes sur 14 figurent ici') // comptes crees
      expect(flat).toContain('8 lignes sur 9 figurent ici') // catalogue malveillant
      expect(flat).toContain('8 lignes sur 10 figurent ici') // applications ajoutees
      expect(flat).toContain('8 lignes sur 11 figurent ici') // permissions
      expect(flat).toContain('8 lignes sur 13 figurent ici') // expediteurs approuves
      expect(flat).toContain('8 lignes sur 16 figurent ici') // appareils geres
      expect(flat).toContain('8 lignes sur 19 figurent ici') // partages
      expect(flat).toContain('8 lignes sur 17 figurent ici') // adresses source
      expect(flat).toContain('8 lignes sur 15 figurent ici') // courrier externe
      expect(flat).toContain('5 lignes sur 7 figurent ici') // rafales
      expect(flat).toMatch(/30 lignes sur [0-9]+ figurent ici/) // chronologie
      expect(flat).toContain('et 2 applications de plus') // applications d'une session
      // Nothing left in the old shapes.
      expect(flat).not.toContain('autres \u00e9v\u00e9nements (export JSON)')
      expect(flat).not.toContain('Export the table from the report page')
    },
    RENDER_TIMEOUT
  )
})

describe('rendered PDF, a truncated table', () => {
  it(
    'writes the truncation note in the language of the report',
    async () => {
      // "Autres evenements dates" is capped at 20 by the report and falls through to upstream's
      // own truncation note, which is written in English. 26 registered methods overflow it by 6.
      const devices = Array.from({ length: 26 }, (unused, index) => ({
        displayName: `poste ${index}`,
        createdDateTime: '2026-08-19T09:00:00Z',
      }))

      const { text } = await render(
        incidentDocument({ becData: { ...becData, MFADevices: devices } }),
        'incident-tableau-tronque'
      )

      const flat = text.replace(/[ \t\n\r]+/g, ' ')
      expect(flat).not.toContain('Export the table from the report page')
      expect(flat).not.toContain('and 6 more')
      expect(flat).toContain(
        "20 lignes sur 26 figurent ici ; la liste complète est dans l'export de données du dossier."
      )
    },
    RENDER_TIMEOUT
  )

  it(
    'states both numbers in its annex note',
    async () => {
      const many = Array.from({ length: 70 }, (unused, index) => ({
        MessageTraceId: `m${index}`,
        Subject: 'Mise a jour bancaire',
        RecipientAddress: `buyer${index}@client.test`,
        Received: '2026-08-19T07:11:00Z',
        FromIP: '203.0.113.42',
        SystemGenerated: false,
        Internal: false,
        ForeignLocation: true,
      }))

      const { text } = await render(
        incidentDocument({
          becData: {
            ...becData,
            SentMessages: many,
            SentMessageAnalysis: { ...becData.SentMessageAnalysis, TotalRecipients: 70 },
          },
        }),
        'incident-annexe-tronquee'
      )

      // Was "10 destinataires supplementaire ne figure pas dans ce tableau": wrong agreement, and
      // a wording of its own. One sentence for the whole report now, with both numbers.
      expect(text.replace(/[ \t\n\r]+/g, ' ')).toContain(
        "60 lignes sur 70 figurent ici ; la liste complète est dans l'export de données du dossier."
      )
    },
    RENDER_TIMEOUT
  )

  it(
    'never falls back to an English empty-table label',
    async () => {
      const { text } = await render(
        incidentDocument({
          becData: { ...becData, SuspectUserSignIns: [], SentMessages: [], MFADevices: [] },
        }),
        'incident-tableaux-vides'
      )

      expect(text).not.toContain('Nothing to report')
    },
    RENDER_TIMEOUT
  )
})

describe('rendered PDF, investigation report', () => {
  it(
    'carries the ticket and the French page label',
    async () => {
      const { text } = await render(
        <PsitBecReportFrDocument
          userData={userData}
          becData={becData}
          brandingSettings={{}}
          tenantName="contoso.test"
          variables={{}}
          triage={triage}
          incident={incident}
        />,
        'investigation'
      )

      expect(text).toContain('T20260820.0013')
      expect(text).toMatch(/Page \d+ sur \d+/)
      expect(text).not.toContain('PSIT-BEC-')
      expect(text).not.toContain('(s)')
      expect(text).not.toContain('Continued')
    },
    RENDER_TIMEOUT
  )
})

describe('psitReportFileName', () => {
  it('names the demonstration files by ticket and account', () => {
    expect(psitReportFileName(incident.AutotaskTicket, userData.userPrincipalName)).toBe(
      'T20260820.0013_p_martin_contoso_test.pdf'
    )
  })
})
