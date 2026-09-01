import React from 'react'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import { PsitSocGuidePanel } from '../../../src/components/psit/soc/PsitSocGuidePanel'
import { ApiPostCall } from '../../../src/api/ApiCall'

// Rendering MUI through jsdom on a cold cache runs past Vitest's 5 s default on a laptop, and a
// timeout reads exactly like a broken assertion. Set per file rather than in vitest.config.mjs,
// which is upstream: no divergence, and the value travels with the tests that need it.
vi.setConfig({ testTimeout: 60000 })

vi.mock('../../../src/api/ApiCall', () => ({
  ApiGetCall: vi.fn(() => ({ data: undefined, isFetching: false, isSuccess: false, isError: false })),
  ApiPostCall: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false })),
  ApiGetCallWithPagination: vi.fn(() => ({ data: undefined, isFetching: false })),
}))

// Type 2 (impossible travel): five steps, the first already done by another analyst.
const socCase = {
  CaseId: 'PSIT-SOC-20260824-BBBB',
  Tenant: 'contoso.test',
  TypeId: 2,
  GuideProgress: {
    sessions: { State: 'done', By: 'a', Utc: '2026-08-24T14:00:00Z' },
  },
}

describe('PsitSocGuidePanel', () => {
  beforeEach(() => {
    ApiPostCall.mockImplementation(() => ({
      mutate: vi.fn(),
      isPending: false,
      isSuccess: false,
      isError: false,
    }))
  })

  it('renders the steps of the type with their recorded state: a takeover sees what was done', () => {
    renderWithProviders(<PsitSocGuidePanel socCase={socCase} queryKey="k" />)

    expect(screen.getByText(/Voyage impossible/)).toBeInTheDocument()
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(5)
    // The step another analyst completed shows checked, with who and when.
    expect(checkboxes[0]).toBeChecked()
    expect(screen.getByText(/faite, a \(2026-08-24T14:00:00Z\)/)).toBeInTheDocument()
    expect(checkboxes[1]).not.toBeChecked()
  })

  it('persists a ticked step under its stable id', async () => {
    const mutate = vi.fn()
    ApiPostCall.mockImplementation(() => ({
      mutate,
      isPending: false,
      isSuccess: false,
      isError: false,
    }))
    renderWithProviders(<PsitSocGuidePanel socCase={socCase} queryKey="k" />)

    // Second step of type 2: the AiTM check, still pending.
    await userEvent.click(screen.getAllByRole('checkbox')[1])

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    const payload = mutate.mock.calls[0][0]
    expect(payload.url).toBe('/api/PSITExecSocCase')
    expect(payload.data.GuideProgress).toEqual([{ StepId: 'aitm', State: 'done' }])
  })

  it('unticking a done step records it as pending again, never deletes the trace', async () => {
    const mutate = vi.fn()
    ApiPostCall.mockImplementation(() => ({
      mutate,
      isPending: false,
      isSuccess: false,
      isError: false,
    }))
    renderWithProviders(<PsitSocGuidePanel socCase={socCase} queryKey="k" />)

    await userEvent.click(screen.getAllByRole('checkbox')[0])

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    expect(mutate.mock.calls[0][0].data.GuideProgress).toEqual([
      { StepId: 'sessions', State: 'pending' },
    ])
  })

  it('carries the answer under the step, so checking is not an errand', () => {
    // Type 2's first step asks to group the sign-ins; the evidence answers it in place.
    renderWithProviders(
      <PsitSocGuidePanel
        socCase={socCase}
        queryKey="k"
        evidence={{
          user: {
            usageLocation: 'FR',
            signIns: [
              {
                ipAddress: '195.65.131.222',
                createdDateTime: '2026-08-24T09:00:00Z',
                status: { errorCode: 0 },
                location: { countryOrRegion: 'CH' },
              },
            ],
          },
        }}
      />
    )

    expect(screen.getByText(/195\.65\.131\.222/)).toBeInTheDocument()
    expect(screen.getByText(/succès hors zone/)).toBeInTheDocument()
  })

  it('renders the step alone when nothing answers it', () => {
    renderWithProviders(<PsitSocGuidePanel socCase={socCase} queryKey="k" />)

    // The step that only a phone call settles stays a plain question.
    expect(screen.getByText(/Contacter le titulaire/)).toBeInTheDocument()
  })

  it('attests only a settled step: an untouched or un-ticked one has nothing to sign', () => {
    renderWithProviders(
      <PsitSocGuidePanel
        socCase={{
          ...socCase,
          GuideProgress: {
            sessions: { State: 'done', By: 'a', Utc: '2026-08-24T14:00:00Z' },
            aitm: { State: 'pending', By: 'a', Utc: '2026-08-24T15:00:00Z' },
          },
        }}
        queryKey="k"
      />
    )

    expect(screen.getByText(/faite, a \(2026-08-24T14:00:00Z\)/)).toBeInTheDocument()
    // Un-ticking removes the claim rather than recording "pending, someone, at some time".
    expect(screen.queryByText(/pending, a/)).not.toBeInTheDocument()
  })

  it('does not repeat a successful tick as a green banner', () => {
    // The tick itself is the feedback. Before errorsOnly, every checked step stacked a
    // 'SOC case saved by' banner under the guide - the flood the analysts reported.
    ApiPostCall.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isSuccess: true,
      isError: false,
      data: { data: { Results: 'SOC case PSIT-SOC-20260824-BBBB saved by a@b.test.' } },
    })

    renderWithProviders(<PsitSocGuidePanel socCase={socCase} queryKey="k" />)

    expect(screen.queryByText(/saved by/)).not.toBeInTheDocument()
  })

  it('shows the FP and TP clues next to the steps', () => {
    renderWithProviders(<PsitSocGuidePanel socCase={socCase} queryKey="k" />)

    expect(screen.getByText(/Se lit comme une activité attendue/)).toBeInTheDocument()
    expect(screen.getByText(/Se lit comme une compromission/)).toBeInTheDocument()
    expect(screen.getByText(/Protocole deviceCode/)).toBeInTheDocument()
  })

  it('says so for an unknown type instead of rendering an empty guide', () => {
    renderWithProviders(
      <PsitSocGuidePanel socCase={{ ...socCase, TypeId: 999 }} queryKey="k" />
    )

    expect(screen.getByText(/Type d’alerte inconnu 999/)).toBeInTheDocument()
  })
})
