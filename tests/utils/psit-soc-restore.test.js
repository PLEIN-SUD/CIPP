import { describe, expect, it } from 'vitest'
import { psitSocRestoreItems } from '../../src/utils/psit-soc-restore'

// The journal as Get-PSITSocCase returns it: author under Analyst, free-text Action values that
// the remediation panels actually write.
const remediatedCase = (verdict, extraLog = []) => ({
  CaseId: 'PSIT-SOC-1',
  Tenant: 'client.test',
  Qualification: verdict ? { Verdict: verdict } : null,
  ActionLog: [
    {
      Action: 'remediate-user',
      Detail: 'Remédiation CIPP exécutée pour c@client.test : …',
      Analyst: 'a@partner.test',
      Utc: '2026-08-31T10:28:00Z',
    },
    ...extraLog,
  ],
})

describe('psitSocRestoreItems', () => {
  it('derives the give-back list from the remediation the journal records', () => {
    const items = psitSocRestoreItems(remediatedCase('benign-true-positive'))

    const keys = items.map((item) => item.key)
    expect(keys).toEqual(['signin', 'password', 'mfa', 'onedrive', 'rules'])
    expect(items.every((item) => item.done === false)).toBe(true)
  })

  it('marks an item done from its journaled restoration, nothing else', () => {
    const items = psitSocRestoreItems(
      remediatedCase('false-positive', [
        {
          Action: 'restored',
          Detail: 'Connexion réactivée (compte débloqué)',
          Analyst: 'a@partner.test',
          Utc: '2026-08-31T11:00:00Z',
        },
      ])
    )

    expect(items.find((item) => item.key === 'signin').done).toBe(true)
    expect(items.find((item) => item.key === 'mfa').done).toBe(false)
  })

  it('reads a journaled mde-unisolate as the isolation restore', () => {
    const items = psitSocRestoreItems({
      CaseId: 'PSIT-SOC-2',
      Qualification: { Verdict: 'benign-true-positive' },
      ActionLog: [
        { Action: 'mde-isolate', Detail: 'Poste isolé', Utc: '2026-08-31T10:00:00Z' },
        { Action: 'mde-unisolate', Detail: 'Isolation levée', Utc: '2026-08-31T12:00:00Z' },
      ],
    })

    expect(items).toHaveLength(1)
    expect(items[0].key).toBe('isolation')
    expect(items[0].done).toBe(true)
  })

  it('lists nothing on a retained compromise: nothing is given back to an attacker', () => {
    expect(psitSocRestoreItems(remediatedCase('true-positive'))).toEqual([])
    expect(psitSocRestoreItems(remediatedCase('undetermined'))).toEqual([])
    expect(psitSocRestoreItems(remediatedCase(null))).toEqual([])
  })

  it('lists nothing when no remediation was journaled', () => {
    expect(
      psitSocRestoreItems({
        CaseId: 'PSIT-SOC-3',
        Qualification: { Verdict: 'false-positive' },
        ActionLog: [{ Action: 'ingested', Detail: '' }],
      })
    ).toEqual([])
  })

  it('does not duplicate an item contributed by two remediation entries', () => {
    const items = psitSocRestoreItems(
      remediatedCase('benign-true-positive', [
        { Action: 'block-signin', Detail: 'Connexion bloquée', Utc: '2026-08-31T10:29:00Z' },
      ])
    )

    expect(items.filter((item) => item.key === 'signin')).toHaveLength(1)
  })
})
