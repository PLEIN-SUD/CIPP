import { describe, expect, it } from 'vitest'
import {
  psitAuditHeadline,
  psitAuditOperations,
  psitAuditWindowLabel,
  psitReadCaseAudit,
  psitSocIsAuditCase,
} from '../../src/utils/psit-soc-case-audit'

// The endpoint's own shape, PascalCase, as Invoke-PSITExecCaseAuditSearch builds it.
const finishedAnswer = {
  SearchId: 'search-1',
  Status: 'succeeded',
  Running: false,
  Started: true,
  Warnings: [],
  Window: {
    Kind: 'mailbox-rules',
    User: 'y.exemple@contoso.test',
    StartUtc: '2026-08-26T15:27:00.0000000Z',
    EndUtc: '2026-08-28T19:27:00.0000000Z',
    LaunchedUtc: '2026-08-29T08:00:00.0000000Z',
    LaunchedBy: 'analyste@partner.test',
  },
  Records: [
    {
      WhenUtc: '2026-08-28T15:20:00Z',
      Operation: 'New-InboxRule',
      Actor: 'y.exemple@contoso.test',
      Target: 'y.exemple@contoso.test',
      Ip: '203.0.113.9',
      Detail: '[{"Name":"DeleteMessage","Value":"True"}]',
    },
    {
      WhenUtc: '2026-08-28T15:24:00Z',
      Operation: 'Set-Mailbox',
      Actor: 'y.exemple@contoso.test',
      Target: 'y.exemple@contoso.test',
      Ip: '203.0.113.9',
      Detail: '[{"Name":"ForwardingSmtpAddress","Value":"smtp:pivot@exemple.net"}]',
    },
  ],
  Summary: {
    EventCount: 2,
    Operations: [
      { Operation: 'New-InboxRule', Count: 1 },
      { Operation: 'Set-Mailbox', Count: 1 },
    ],
    Actors: [{ Actor: 'y.exemple@contoso.test', Count: 2 }],
    Addresses: ['203.0.113.9'],
    AddressCount: 1,
    FirstUtc: '2026-08-28T15:20:00Z',
    LastUtc: '2026-08-28T15:24:00Z',
  },
}

describe('psitSocIsAuditCase', () => {
  it('covers the three types whose evidence lives in the unified audit log', () => {
    for (const typeId of [4, 5, 7]) {
      expect(psitSocIsAuditCase({ TypeId: typeId })).toBe(true)
    }
    expect(psitSocIsAuditCase({ TypeId: 2 })).toBe(false)
    expect(psitSocIsAuditCase({ TypeId: 20 })).toBe(false)
  })

  it('keeps the panel on a retyped dossier that already carries a search', () => {
    expect(
      psitSocIsAuditCase({ TypeId: 2, Evidence: { audit: { searchId: 'search-1' } } })
    ).toBe(true)
  })
})

describe('psitReadCaseAudit', () => {
  it('keeps "never launched" distinct from "ran and found nothing"', () => {
    const never = psitReadCaseAudit({ Started: false, Running: false, Records: [], Summary: null })
    expect(never.started).toBe(false)

    const empty = psitReadCaseAudit({
      ...finishedAnswer,
      Records: [],
      Summary: { ...finishedAnswer.Summary, EventCount: 0, Operations: [], Actors: [] },
    })
    expect(empty.started).toBe(true)
    expect(empty.summary.eventCount).toBe(0)
  })

  it('normalises the endpoint answer, window and kind included', () => {
    const read = psitReadCaseAudit(finishedAnswer)
    expect(read.window.kind).toBe('mailbox-rules')
    expect(read.summary.eventCount).toBe(2)
    expect(read.summary.actors[0].actor).toBe('y.exemple@contoso.test')
    expect(psitAuditWindowLabel(read)).toMatch(/^du .* au .*$/)
  })
})

describe('psitAuditOperations', () => {
  it('counts the operations present, biggest first, for the filter chips', () => {
    const operations = psitAuditOperations([
      { Operation: 'Set-Mailbox' },
      { Operation: 'New-InboxRule' },
      { Operation: 'Set-Mailbox' },
    ])
    expect(operations[0]).toEqual({ operation: 'Set-Mailbox', count: 2 })
    expect(operations[1]).toEqual({ operation: 'New-InboxRule', count: 1 })
  })
})

describe('psitAuditHeadline', () => {
  it('says not launched, and says running, rather than implying an empty answer', () => {
    expect(psitAuditHeadline(psitReadCaseAudit(undefined)).text).toBe('recherche non lancée')
    expect(
      psitAuditHeadline(psitReadCaseAudit({ Started: true, Running: true, Records: [] })).text
    ).toMatch(/en cours/)
  })

  it('counts, names the top operation and the actor, and concludes nothing', () => {
    const headline = psitAuditHeadline(psitReadCaseAudit(finishedAnswer))
    expect(headline.tone).toBe('bad')
    expect(headline.text).toMatch(/2 événement\(s\)/)
    expect(headline.text).toMatch(/New-InboxRule/)
    expect(headline.text).toMatch(/par y.exemple@contoso.test/)
  })

  it('treats zero events as a window question, never as an all-clear', () => {
    const headline = psitAuditHeadline(
      psitReadCaseAudit({
        ...finishedAnswer,
        Records: [],
        Summary: { ...finishedAnswer.Summary, EventCount: 0, Operations: [], Actors: [] },
      })
    )
    expect(headline.tone).toBe('unknown')
    expect(headline.text).toMatch(/fenêtre à élargir/)
  })
})
