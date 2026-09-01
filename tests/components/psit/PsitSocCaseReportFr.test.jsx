import React from 'react'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import {
  PsitSocCaseReportButton,
  PsitSocInterimReportButton,
} from '../../../src/components/psit/PsitSocCaseReportFr'
import { ApiGetCall, ApiPostCall } from '../../../src/api/ApiCall'

// What is pinned here is the two documents' availability contract: the final report obeys the
// shared verdict lock like every other client document, while the point de situation - which
// says it does not conclude - is available on any open dossier, and gone once the dossier
// closes (the final report exists then).

vi.setConfig({ testTimeout: 60000 })

vi.mock('../../../src/api/ApiCall', () => ({
  ApiGetCall: vi.fn(() => ({ data: undefined, isFetching: false, isFetched: false, isSuccess: false, isError: false })),
  ApiPostCall: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false })),
  ApiGetCallWithPagination: vi.fn(() => ({ data: undefined, isFetching: false })),
}))

const baseCase = {
  CaseId: 'PSIT-SOC-1',
  Tenant: 'contoso.test',
  TypeId: 2,
  Title: 'Connexion et activité dans deux pays',
  Status: 'investigating',
  CreatedUtc: '2026-09-02T08:00:00Z',
  Entities: { upn: 'p.martin@contoso.test' },
  Qualification: null,
  GuideProgress: {},
  ActionLog: [],
}

describe('PsitSocCaseReportButton', () => {
  it('stays locked without a verdict, and says why on hover', () => {
    renderWithProviders(<PsitSocCaseReportButton socCase={baseCase} />)

    expect(screen.getByRole('button', { name: "Rapport d'investigation" })).toBeDisabled()
  })

  it('stays locked on an uncontained true positive', () => {
    renderWithProviders(
      <PsitSocCaseReportButton
        socCase={{
          ...baseCase,
          Status: 'qualified-tp',
          Qualification: { Verdict: 'true-positive', Justification: 'x' },
        }}
      />
    )

    expect(screen.getByRole('button', { name: "Rapport d'investigation" })).toBeDisabled()
  })

  it('unlocks once the dossier concludes', () => {
    renderWithProviders(
      <PsitSocCaseReportButton
        socCase={{
          ...baseCase,
          Status: 'closed',
          Qualification: { Verdict: 'false-positive', Justification: 'VPN confirmé' },
        }}
      />
    )

    expect(screen.getByRole('button', { name: "Rapport d'investigation" })).toBeEnabled()
  })
})

describe('PsitSocInterimReportButton', () => {
  it('is available on an open dossier even without a verdict: it does not conclude', () => {
    renderWithProviders(<PsitSocInterimReportButton socCase={baseCase} />)

    expect(screen.getByRole('button', { name: 'Point de situation' })).toBeEnabled()
  })

  it('disappears once the dossier is closed: the final report exists then', () => {
    const { container } = renderWithProviders(
      <PsitSocInterimReportButton socCase={{ ...baseCase, Status: 'closed' }} />
    )

    expect(container).toBeEmptyDOMElement()
  })
})
