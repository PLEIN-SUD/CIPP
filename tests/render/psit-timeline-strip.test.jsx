// @vitest-environment node
import { mkdirSync, writeFileSync } from 'node:fs'
import { renderToBuffer } from '@react-pdf/renderer'
import { pdfText } from './psit-pdf-text'
import { PsitBecIncidentReportDocument } from '../../src/components/psit/PsitBecIncidentReport'

// The strip, rendered for real.
//
// What these assertions can and cannot reach is worth stating, because it is unusual here: text
// inside an Svg IS written to the content stream, so every axis tick, every track label and every
// sign-in count is assertable. A Rect and a Line write no text at all, so NOTHING about a segment's
// position, width or colour can be checked here. That half is a visual control on the PDFs written
// under psit/render-samples, and the greyscale print is the only way to check the two fills apart.
//
// The geometry itself is covered without rendering, in tests/utils/psit-report-timeline.test.js.

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
  ContainedUtc: '2026-08-20T13:05:00Z',
  Status: 'contained',
  EffectDescription: 'mass-send',
  UpdatedBy: 'analyste@example.test',
  UpdatedUtc: '2026-08-20T14:00:00Z',
  CreatedUtc: '2026-08-20T09:30:00Z',
}

/** A sign-in on 2026-08-20 at `hour:minute` UTC. */
const at = (hour, minute, ip, overrides = {}) => ({
  CreatedDateTime: `2026-08-20T${String(hour).padStart(2, '0')}:${String(minute).padStart(
    2,
    '0'
  )}:00Z`,
  IPAddress: ip,
  Country: ip.startsWith('203') ? 'IT' : 'FR',
  City: ip.startsWith('203') ? 'Verone' : 'Marseille',
  Status: 'Success',
  AppDisplayName: 'Microsoft Graph',
  ForeignLocation: ip.startsWith('203'),
  ...overrides,
})

const becData = (signIns, overrides = {}) => ({
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
  SuspectUserSignIns: signIns,
  SentMessages: [],
  SentMessageAnalysis: { TotalRecipients: 0, RepeatedSubjects: [], Bursts: [] },
  LocationAnalysis: { UsageLocation: 'FR' },
  ...overrides,
})

const document = (data, triage = []) => (
  <PsitBecIncidentReportDocument
    userData={userData}
    becData={data}
    brandingSettings={{}}
    tenantName="contoso.test"
    variables={{}}
    triage={triage}
    incident={incident}
    remediation={{}}
  />
)

const TIMEOUT = 120000

describe('rendered PDF, the chronology strip', () => {
  it(
    'draws the reference shape: two addresses, then a burst on the last day',
    async () => {
      // The dossier's own shape. The account holder works from one address while the intruder is on
      // another, and the last morning is dense.
      const signIns = [
        // Two addresses interleaved over the previous evening.
        at(18, 10, '203.0.113.42', { CreatedDateTime: '2026-08-19T18:10:00Z' }),
        at(18, 20, '198.51.100.9', { CreatedDateTime: '2026-08-19T18:20:00Z' }),
        at(18, 30, '203.0.113.42', { CreatedDateTime: '2026-08-19T18:30:00Z' }),
        at(18, 40, '198.51.100.9', { CreatedDateTime: '2026-08-19T18:40:00Z' }),
        // Then a dense morning on the foreign address alone.
        ...[0, 20, 40, 60, 80, 100, 120].map((minutes) =>
          at(6 + Math.floor(minutes / 60), minutes % 60, '203.0.113.42')
        ),
      ]

      const { text } = await render(
        document(becData(signIns), [
          {
            SignalId: 'signin-ip:203.0.113.42',
            Verdict: 'unexpected',
            Analyst: 'analyste@example.test',
            DecidedUtc: '2026-08-20T13:02:00Z',
            Justification: 'titulaire du compte en France, confirme par telephone',
          },
        ]),
        'frise-reference'
      )

      const flat = text.replace(/[ \t\n\r]+/g, ' ')

      // Track labels: the address and the country NAMED, one per track. A client reading "(IT)"
      // reads the encoding of the information rather than the information itself.
      expect(flat).toContain('203.0.113.42, Italie')
      expect(flat).toContain('198.51.100.9, France')
      expect(flat).not.toContain('(IT)')
      // Axis ticks, in the short third date format and nowhere else in the document.
      expect(flat).toMatch(/\b1[4-9]\/08\b/)
      expect(flat).toContain('20/08')
      // The note, and the sentence the brief asked for word for word.
      expect(flat).toContain("La qualification porte sur l'adresse source, non sur chaque session")
      expect(flat).toContain('Connexions interactives relevées dans les journaux Entra ID')
      expect(flat).toContain('Les connexions non interactives (jetons, IMAP, EWS) ne sont pas')
      // The coarseness is stated, not implied.
      expect(flat).toMatch(/Une session plus courte que \d+ minutes est dessinée à une largeur/)
    },
    TIMEOUT
  )

  it(
    'says nothing about failures when the collection returned none',
    async () => {
      const { text } = await render(
        document(becData([at(6, 0, '203.0.113.42'), at(6, 20, '203.0.113.42')])),
        'frise-sans-echec'
      )

      expect(text).not.toContain('en échec sur le même axe')
    },
    TIMEOUT
  )

  it(
    'locates failed attempts on the same axis when they are collected',
    async () => {
      const withFailures = [
        at(6, 0, '203.0.113.42'),
        at(6, 20, '203.0.113.42'),
        ...[0, 2, 4, 6, 8].map((minute) => at(5, minute, '198.51.100.9', { Status: 'Failure' })),
      ]

      const { text } = await render(document(becData(withFailures)), 'frise-echecs')
      const flat = text.replace(/[ \t\n\r]+/g, ' ')

      expect(flat).toContain('5 tentatives en échec sur le même axe')
      expect(flat).toContain("Aucune échelle de comptage n'y est portée")
    },
    TIMEOUT
  )

  it(
    'folds past four addresses and says how many, in the report-wide wording',
    async () => {
      const many = ['203.0.113.42', '198.51.100.1', '198.51.100.2', '198.51.100.3', '198.51.100.4', '198.51.100.5']
        .flatMap((ip, index) => [at(6, index * 3, ip), at(6, index * 3 + 1, ip)])

      const { text } = await render(document(becData(many)), 'frise-pistes-repliees')
      const flat = text.replace(/[ \t\n\r]+/g, ' ')

      expect(flat).toContain('autres adresses')
      // The single truncation formulation of the whole document, not a variant of its own.
      expect(flat).toContain('3 lignes sur 6 figurent ici')
      expect(flat).toContain("partagent la piste « autres adresses »")
    },
    TIMEOUT
  )

  it(
    'marks a session that runs past the edge of the window',
    async () => {
      const straddling = [
        // Two sign-ins before the window opens: the session is clipped at the left edge.
        { ...at(6, 0, '203.0.113.42'), CreatedDateTime: '2026-08-13T10:00:00Z' },
        { ...at(6, 0, '203.0.113.42'), CreatedDateTime: '2026-08-13T10:20:00Z' },
        at(6, 0, '203.0.113.42'),
      ]

      const { text } = await render(document(becData(straddling)), 'frise-session-debordante')
      const flat = text.replace(/[ \t\n\r]+/g, ' ')

      expect(flat).toContain("Un trait vertical épais au bord de l'axe marque une session")
      expect(flat).toContain("Son étendue réelle n'est pas connue de cette collecte")
    },
    TIMEOUT
  )

  it(
    'keeps the strip and the full axis on a single session',
    async () => {
      const { text } = await render(document(becData([at(6, 0, '203.0.113.42')])), 'frise-une-session')
      const flat = text.replace(/[ \t\n\r]+/g, ' ')

      expect(flat).toContain('203.0.113.42, Italie')
      // The window is kept whole, so the six empty days show: the first tick is six days back.
      expect(flat).toContain('14/08')
      expect(flat).toContain('20/08')
    },
    TIMEOUT
  )

  it(
    'renders no strip and no empty frame when the window holds no session',
    async () => {
      const { text } = await render(
        document(becData([at(6, 0, '198.51.100.9', { Status: 'Failure' })])),
        'frise-aucune-session'
      )

      // The table says what there is; the strip does not draw a frame to say nothing.
      expect(text).not.toContain('Connexions interactives relevées dans les journaux Entra ID')
      expect(text).not.toContain('autres adresses')
    },
    TIMEOUT
  )

  it(
    'carries the year in the ticks when the window straddles two',
    async () => {
      const newYear = becData(
        [
          { ...at(6, 0, '203.0.113.42'), CreatedDateTime: '2026-01-02T06:00:00Z' },
          { ...at(6, 0, '203.0.113.42'), CreatedDateTime: '2026-01-02T06:20:00Z' },
        ],
        { ExtractedAt: '2026-01-03T10:32:00Z' }
      )

      const { text } = await render(document(newYear), 'frise-passage-annee')
      const flat = text.replace(/[ \t\n\r]+/g, ' ')

      expect(flat).toMatch(/\b0[123]\/01\/26\b/)
    },
    TIMEOUT
  )
})
