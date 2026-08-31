import { describe, expect, it } from 'vitest'
import {
  PSIT_DOWNLOAD_TYPE_ID,
  psitDownloadBySite,
  psitDownloadClientLabel,
  psitDownloadHeadline,
  psitDownloadOriginLine,
  psitDownloadSpanMinutes,
  psitDownloadWindowLabel,
  psitReadDownloadAudit,
  psitSocIsDownloadCase,
} from '../../src/utils/psit-soc-download'

// The payloads below are the endpoint's own shape: PascalCase, Summary and Window as the API
// builds them in Get-PSITDownloadAudit and Invoke-PSITExecDownloadAudit. A fixture written in the
// shape this module would prefer would keep nothing.
const runningPayload = {
  SearchId: 'search-1',
  Status: 'running',
  Running: true,
  Records: [],
  Summary: null,
  Warnings: [],
  Started: true,
  Window: {
    User: 'y.exemple@client.test',
    StartUtc: '2026-08-28T03:27:00.0000000Z',
    EndUtc: '2026-08-28T19:27:00.0000000Z',
    LaunchedUtc: '2026-08-29T08:00:00.0000000Z',
    LaunchedBy: 'analyste@partner.test',
  },
}

const finishedPayload = {
  SearchId: 'search-1',
  Status: 'succeeded',
  Running: false,
  Started: true,
  Warnings: [],
  Window: runningPayload.Window,
  Records: [
    {
      Path: 'https://client.sharepoint.com/sites/Compta/Documents partages/Budget 2026.xlsx',
      Name: 'Budget 2026.xlsx',
      Site: 'https://client.sharepoint.com/sites/Compta/',
      Operation: 'FileDownloaded',
      WhenUtc: '2026-08-28T15:20:00Z',
      Ip: '203.0.113.9',
      Agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    },
    {
      Path: 'https://client.sharepoint.com/sites/Compta/Documents partages/Contrat.pdf',
      Name: 'Contrat.pdf',
      Site: 'https://client.sharepoint.com/sites/Compta/',
      Operation: 'FileDownloaded',
      WhenUtc: '2026-08-28T15:24:00Z',
      Ip: '203.0.113.9',
      Agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    },
    {
      Path: 'https://client.sharepoint.com/sites/RH/Documents partages/Paie.xlsx',
      Name: 'Paie.xlsx',
      Site: 'https://client.sharepoint.com/sites/RH/',
      Operation: 'FileDownloaded',
      WhenUtc: '2026-08-28T15:50:00Z',
      Ip: '198.51.100.4',
      Agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    },
  ],
  Summary: {
    FileCount: 3,
    SiteCount: 2,
    Sites: ['https://client.sharepoint.com/sites/Compta/', 'https://client.sharepoint.com/sites/RH/'],
    Extensions: [
      { Extension: 'xlsx', Count: 2 },
      { Extension: 'pdf', Count: 1 },
    ],
    FirstUtc: '2026-08-28T15:20:00Z',
    LastUtc: '2026-08-28T15:50:00Z',
    Addresses: ['198.51.100.4', '203.0.113.9'],
    AddressCount: 2,
    Agents: ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)'],
  },
}

describe('psitSocIsDownloadCase', () => {
  it('claims the mass-download type', () => {
    expect(psitSocIsDownloadCase({ TypeId: PSIT_DOWNLOAD_TYPE_ID })).toBe(true)
  })

  it('keeps the panel on a dossier retyped after its search ran', () => {
    // Retyping a dossier must not hide the evidence gathered under the old type.
    expect(
      psitSocIsDownloadCase({ TypeId: 99, Evidence: { download: { searchId: 'search-1' } } })
    ).toBe(true)
  })

  it('stays out of dossiers it has nothing to say about', () => {
    expect(psitSocIsDownloadCase({ TypeId: 1 })).toBe(false)
    expect(psitSocIsDownloadCase(null)).toBe(false)
  })
})

describe('psitReadDownloadAudit', () => {
  it('separates "never launched" from "launched and found nothing"', () => {
    // The panel says something different for each, so they must not collapse here.
    const never = psitReadDownloadAudit({ Started: false, Running: false, Records: [], Summary: null })
    expect(never.started).toBe(false)
    expect(never.summary).toBeNull()

    const empty = psitReadDownloadAudit({
      ...finishedPayload,
      Records: [],
      Summary: { ...finishedPayload.Summary, FileCount: 0 },
    })
    expect(empty.started).toBe(true)
    expect(empty.summary.fileCount).toBe(0)
  })

  it('reads the endpoint payload as it is actually sent', () => {
    const read = psitReadDownloadAudit(finishedPayload)
    expect(read.summary.fileCount).toBe(3)
    expect(read.summary.extensions[0]).toEqual({ extension: 'xlsx', count: 2 })
    expect(read.window.startUtc).toBe('2026-08-28T03:27:00.0000000Z')
    expect(read.files).toHaveLength(3)
  })

  it('survives an answer with nothing in it', () => {
    const read = psitReadDownloadAudit(undefined)
    expect(read.started).toBe(false)
    expect(read.files).toEqual([])
    expect(read.warnings).toEqual([])
  })
})

describe('psitDownloadHeadline', () => {
  it('says a running search is running, never a count of zero', () => {
    const headline = psitDownloadHeadline(psitReadDownloadAudit(runningPayload))
    expect(headline.tone).toBe('unknown')
    expect(headline.text).toMatch(/en cours/)
  })

  it('says a search was never launched rather than reporting nothing found', () => {
    const headline = psitDownloadHeadline(psitReadDownloadAudit({ Started: false }))
    expect(headline.tone).toBe('unknown')
    expect(headline.text).toMatch(/non lancée/)
  })

  it('counts, dates and names the client, without concluding', () => {
    const headline = psitDownloadHeadline(psitReadDownloadAudit(finishedPayload))
    expect(headline.text).toMatch(/3 fichier\(s\) depuis 2 site\(s\)/)
    expect(headline.text).toMatch(/sur 30 min/)
    expect(headline.text).toMatch(/navigateur/)
    // Reports, never concludes: no verdict word.
    expect(headline.text).not.toMatch(/exfiltration|compromis|malveillant/i)
  })

  it('treats an empty result as a window to widen, not as an all-clear', () => {
    const headline = psitDownloadHeadline(
      psitReadDownloadAudit({ ...finishedPayload, Records: [], Summary: { ...finishedPayload.Summary, FileCount: 0 } })
    )
    expect(headline.tone).toBe('unknown')
    expect(headline.text).toMatch(/rétention|élargir/)
  })
})

describe('psitDownloadOriginLine', () => {
  it('reads one address as unremarkable and several as worth a look', () => {
    expect(
      psitDownloadOriginLine(
        psitReadDownloadAudit({
          ...finishedPayload,
          Summary: { ...finishedPayload.Summary, Addresses: ['203.0.113.9'], AddressCount: 1 },
        })
      ).tone
    ).toBe('good')
    expect(psitDownloadOriginLine(psitReadDownloadAudit(finishedPayload)).tone).toBe('bad')
  })

  it('does not answer at all while the search runs', () => {
    expect(psitDownloadOriginLine(psitReadDownloadAudit(runningPayload)).tone).toBe('unknown')
  })
})

describe('psitDownloadClientLabel', () => {
  it('tells a sync client from a browser', () => {
    const sync = psitReadDownloadAudit({
      ...finishedPayload,
      Summary: { ...finishedPayload.Summary, Agents: ['Microsoft SkyDriveSync 24.201.1006.0004'] },
    })
    expect(psitDownloadClientLabel(sync)).toBe('client de synchronisation')
    expect(psitDownloadClientLabel(psitReadDownloadAudit(finishedPayload))).toBe('navigateur')
  })

  it('says both when the log shows both', () => {
    const mixed = psitReadDownloadAudit({
      ...finishedPayload,
      Summary: {
        ...finishedPayload.Summary,
        Agents: ['Microsoft SkyDriveSync 24.201.1006.0004', 'Mozilla/5.0'],
      },
    })
    expect(psitDownloadClientLabel(mixed)).toBe('navigateur et client de synchronisation')
  })
})

describe('psitDownloadSpanMinutes and psitDownloadWindowLabel', () => {
  it('measures the burst, not the search window', () => {
    expect(psitDownloadSpanMinutes(psitReadDownloadAudit(finishedPayload))).toBe(30)
  })

  it('has no span to give while the search runs', () => {
    expect(psitDownloadSpanMinutes(psitReadDownloadAudit(runningPayload))).toBeNull()
  })

  it('states the searched window, because a count without one means nothing', () => {
    const label = psitDownloadWindowLabel(psitReadDownloadAudit(finishedPayload))
    expect(label).toMatch(/^du 28\/08\/2026/)
    expect(label).toMatch(/au 28\/08\/2026/)
  })
})

describe('psitDownloadBySite', () => {
  it('puts the site that lost the most files first', () => {
    const grouped = psitDownloadBySite(psitReadDownloadAudit(finishedPayload))
    expect(grouped[0].site).toBe('https://client.sharepoint.com/sites/Compta/')
    expect(grouped[0].count).toBe(2)
    expect(grouped[0].names).toContain('Budget 2026.xlsx')
    expect(grouped).toHaveLength(2)
  })

  it('does not drop a record whose site the log left empty', () => {
    const grouped = psitDownloadBySite({ files: [{ Name: 'x.txt' }] })
    expect(grouped[0].site).toBe('site non renseigné')
  })
})
