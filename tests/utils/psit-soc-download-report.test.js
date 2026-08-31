import { describe, expect, it } from 'vitest'
import {
  DOWNLOAD_CONCLUSION,
  buildDownloadReportModel,
} from '../../src/utils/psit-soc-download-report'
import { psitReadDownloadAudit } from '../../src/utils/psit-soc-download'

// The dossier as Get-PSITSocCase returns it: Qualification nested, journal author under Analyst,
// the download evidence with the summary captured at the first successful read (PascalCase,
// because the API filed the summary object it had just built).
const baseCase = {
  CaseId: 'PSIT-SOC-20260828-AAAA',
  Tenant: 'client.test',
  TypeId: 20,
  Entities: { upn: 'y.exemple@client.test' },
  Qualification: { Verdict: 'true-positive', Justification: 'Départ annoncé, volume hors norme.' },
  ActionLog: [
    { Action: 'audit-search', Detail: 'Recherche lancée', Analyst: 'a@partner.test', Utc: '2026-08-30T09:00:00Z' },
    { Action: 'block-signin', Detail: 'Connexion bloquée', Analyst: 'a@partner.test', Utc: '2026-08-30T10:00:00Z' },
  ],
  Evidence: {
    download: {
      searchId: 'search-1',
      user: 'y.exemple@client.test',
      startUtc: '2026-08-28T03:27:00Z',
      endUtc: '2026-08-28T19:27:00Z',
      launchedUtc: '2026-08-30T09:00:00Z',
      launchedBy: 'a@partner.test',
      previous: [{ searchId: 'search-0' }],
      summary: {
        FileCount: 370,
        SiteCount: 2,
        Sites: ['https://client.sharepoint.com/sites/Compta/'],
        Extensions: [{ Extension: 'xlsx', Count: 300 }],
        FirstUtc: '2026-08-28T15:20:00Z',
        LastUtc: '2026-08-28T15:50:00Z',
        Addresses: ['203.0.113.9'],
        AddressCount: 1,
        Agents: ['Mozilla/5.0'],
        Operations: [
          { Operation: 'FileDownloaded', Count: 250 },
          { Operation: 'FileAccessed', Count: 120 },
        ],
      },
    },
  },
}

// A live endpoint answer, as the panel reads it.
const liveRead = psitReadDownloadAudit({
  Started: true,
  Running: false,
  Status: 'succeeded',
  Records: [
    { Name: 'Budget.xlsx', Site: 's', Operation: 'FileDownloaded', WhenUtc: '2026-08-28T15:20:00Z', Ip: '203.0.113.9' },
  ],
  Summary: {
    FileCount: 1,
    SiteCount: 1,
    Sites: ['s'],
    Extensions: [{ Extension: 'xlsx', Count: 1 }],
    FirstUtc: '2026-08-28T15:20:00Z',
    LastUtc: '2026-08-28T15:20:00Z',
    Addresses: ['203.0.113.9'],
    AddressCount: 1,
    Agents: ['Microsoft SkyDriveSync 24.201'],
    Operations: [{ Operation: 'FileDownloaded', Count: 1 }],
  },
  Window: { User: 'y.exemple@client.test', StartUtc: '2026-08-28T03:27:00Z', EndUtc: '2026-08-28T19:27:00Z' },
})

describe('buildDownloadReportModel: the four outcomes', () => {
  it('states an exfiltration for a true positive, in the words a client can read', () => {
    const model = buildDownloadReportModel({ socCase: baseCase, read: liveRead })
    expect(model.kind).toBe(DOWNLOAD_CONCLUSION.EXFILTRATION)
    expect(model.conclusion).toMatch(/sortie de données/)
    expect(model.conclusion).not.toMatch(/exfiltration|massif/i)
  })

  it('states a legitimate use for a false positive', () => {
    const model = buildDownloadReportModel({
      socCase: { ...baseCase, Qualification: { Verdict: 'false-positive' } },
      read: liveRead,
    })
    expect(model.kind).toBe(DOWNLOAD_CONCLUSION.LEGITIMATE)
    expect(model.conclusion).toMatch(/activité légitime/)
  })

  it('never turns an undetermined dossier into an all-clear', () => {
    // The app report shipped that bug once: a binary verdict reading produced a client PDF
    // asserting legitimacy the analyst had explicitly refused to conclude.
    const model = buildDownloadReportModel({
      socCase: { ...baseCase, Qualification: { Verdict: 'undetermined' } },
      read: liveRead,
    })
    expect(model.kind).toBe(DOWNLOAD_CONCLUSION.UNDETERMINED)
    expect(model.conclusion).toMatch(/n'a pas permis de trancher/)
    expect(model.conclusion).not.toMatch(/légitime/)
  })

  it('reads the nested Qualification, not a flat Verdict', () => {
    const model = buildDownloadReportModel({
      socCase: { ...baseCase, Qualification: null, Verdict: 'true-positive' },
      read: liveRead,
    })
    expect(model.kind).toBe(DOWNLOAD_CONCLUSION.UNQUALIFIED)
  })
})

describe('buildDownloadReportModel: where the numbers come from', () => {
  it('prefers the live search while it still answers', () => {
    const model = buildDownloadReportModel({ socCase: baseCase, read: liveRead })
    expect(model.fromSnapshot).toBe(false)
    expect(model.summary.fileCount).toBe(1)
    expect(model.files).toHaveLength(1)
  })

  it('falls back to the captured summary when the search has expired, and says so', () => {
    const model = buildDownloadReportModel({ socCase: baseCase, read: undefined })
    expect(model.fromSnapshot).toBe(true)
    expect(model.summary.fileCount).toBe(370)
    // The dossier keeps the shape of the answer, never each record.
    expect(model.files).toHaveLength(0)
  })

  it('names the search, its window and the widenings it replaced', () => {
    const model = buildDownloadReportModel({ socCase: baseCase, read: liveRead })
    expect(model.window.searchId).toBe('search-1')
    expect(model.window.launchedBy).toBe('a@partner.test')
    expect(model.window.previousCount).toBe(1)
  })
})

describe('buildDownloadReportModel: French a non-technical reader can follow', () => {
  it('agrees every count instead of printing a parenthesised plural', () => {
    const model = buildDownloadReportModel({ socCase: baseCase, read: undefined })
    expect(model.counts.files).toBe('370 fichiers')
    expect(model.counts.sites).toBe('2 sites')
    expect(model.counts.addresses).toBe('1 adresse')
    expect(model.counts.span).toBe('en 30 minutes')
  })

  it('splits accessed from downloaded, and explains the difference', () => {
    const model = buildDownloadReportModel({ socCase: baseCase, read: undefined })
    expect(model.operationsLine).toBe('téléchargé (250), consulté (120)')
    expect(model.accessedCaveat).toMatch(/consultation n'emporte pas de copie/)
  })

  it('stays silent on the caveat when nothing was merely accessed', () => {
    const model = buildDownloadReportModel({ socCase: baseCase, read: liveRead })
    expect(model.accessedCaveat).toBeNull()
  })

  it('translates the sync client into a sentence about a machine, not a user agent', () => {
    const model = buildDownloadReportModel({ socCase: baseCase, read: liveRead })
    expect(model.clientSentence).toMatch(/logiciel de synchronisation/)
    expect(model.clientSentence).not.toMatch(/SkyDriveSync|agent/i)
  })
})
