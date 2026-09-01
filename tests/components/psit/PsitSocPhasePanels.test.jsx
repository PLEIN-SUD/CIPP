import React from 'react'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import { PsitSocValidateShortcut } from '../../../src/components/psit/soc/PsitSocValidateShortcut'
import { PsitSocAnalysisPanel } from '../../../src/components/psit/soc/PsitSocAnalysisPanel'
import { PsitSocEmergencyContainment } from '../../../src/components/psit/soc/PsitSocEmergencyContainment'
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

const socCase = {
  CaseId: 'PSIT-SOC-1',
  Tenant: 'client.test',
  TypeId: 2,
  Status: 'investigating',
  CreatedUtc: '2026-09-02T08:00:00Z',
  Entities: { upn: 'c@client.test', userId: 'u1' },
  GuideProgress: {},
  Qualification: null,
  ActionLog: [],
}

describe('PsitSocValidateShortcut', () => {
  it('offers FP and benign only: a compromise never skips the walk', () => {
    renderWithProviders(<PsitSocValidateShortcut socCase={socCase} queryKey="k" />)

    expect(screen.getByRole('button', { name: 'Faux positif évident' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'VP bénin évident' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Vrai positif$/ })).not.toBeInTheDocument()
  })

  it('refuses to qualify without the justification that replaces the skipped tabs', async () => {
    const mutate = vi.fn()
    ApiPostCall.mockReturnValue({ mutate, isPending: false, isSuccess: false, isError: false })

    renderWithProviders(<PsitSocValidateShortcut socCase={socCase} queryKey="k" />)
    await userEvent.click(screen.getByRole('button', { name: 'Faux positif évident' }))

    expect(screen.getByRole('button', { name: 'Qualifier maintenant' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/Justification/), 'même appareil, VPN confirmé')
    await userEvent.click(screen.getByRole('button', { name: 'Qualifier maintenant' }))

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ Verdict: 'false-positive' }),
      })
    )
  })

  it('disappears once the dossier is qualified', () => {
    const { container } = renderWithProviders(
      <PsitSocValidateShortcut
        socCase={{ ...socCase, Qualification: { Verdict: 'false-positive' } }}
        queryKey="k"
      />
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('PsitSocAnalysisPanel', () => {
  it('pre-fills the techniques from the type catalogue and says they are defaults', () => {
    renderWithProviders(<PsitSocAnalysisPanel socCase={socCase} queryKey="k" />)

    // Type 2 defaults: valid accounts + AiTM.
    expect(screen.getByText('T1078')).toBeInTheDocument()
    expect(screen.getByText('T1557')).toBeInTheDocument()
    expect(screen.getByText(/défauts de la catégorie/)).toBeInTheDocument()
  })

  it('saves techniques and root cause on the qualification', async () => {
    const mutate = vi.fn()
    ApiPostCall.mockReturnValue({ mutate, isPending: false, isSuccess: false, isError: false })

    renderWithProviders(<PsitSocAnalysisPanel socCase={socCase} queryKey="k" />)
    await userEvent.click(screen.getByLabelText('Cause racine'))
    await userEvent.click(screen.getByRole('option', { name: /Shadow IT/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer l’analyse' }))

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/PSITExecSocCase',
        data: expect.objectContaining({
          AttackTechniques: ['T1078', 'T1557'],
          RootCause: 'shadow-it',
        }),
      })
    )
  })
})

describe('PsitSocEmergencyContainment', () => {
  it('runs the CIPP remediation and journals it as a conservatory measure, dossier contained', async () => {
    const mutate = vi.fn((payload, options) => options?.onSuccess?.())
    ApiPostCall.mockImplementation(() => ({ mutate, isPending: false, isSuccess: false, isError: false }))

    renderWithProviders(<PsitSocEmergencyContainment socCase={socCase} queryKey="k" />)
    await userEvent.click(screen.getByRole('button', { name: /Confinement d’urgence/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Confiner le compte' }))

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2))
    expect(mutate.mock.calls[0][0].url).toBe('/api/execBecRemediate')
    const journal = mutate.mock.calls[1][0]
    expect(journal.data.Status).toBe('contained')
    expect(journal.data.LogAction.Detail).toMatch(/Mesure conservatoire avant verdict/)
  })

  it('disappears once a verdict exists: the response tab owns the gestures then', () => {
    const { container } = renderWithProviders(
      <PsitSocEmergencyContainment
        socCase={{ ...socCase, Qualification: { Verdict: 'true-positive' } }}
        queryKey="k"
      />
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe("PsitSocGuidePanel, scoped to a phase with 'sans objet'", () => {
  it('shows only the steps of the asked phase', () => {
    renderWithProviders(
      <PsitSocGuidePanel socCase={socCase} queryKey="k" evidence={{}} phase="collect" showClues={false} />
    )

    // Type 2 collect steps: aitm, devicecode, bec - and not the validate step.
    expect(screen.getByText(/signature AiTM/)).toBeInTheDocument()
    expect(screen.queryByText(/mesurer l’écart de temps/)).not.toBeInTheDocument()
  })

  it("writes 'skipped' for a sans-objet step: stating a step does not apply IS the work", async () => {
    const mutate = vi.fn()
    ApiPostCall.mockReturnValue({ mutate, isPending: false, isSuccess: false, isError: false })

    renderWithProviders(
      <PsitSocGuidePanel socCase={socCase} queryKey="k" evidence={{}} phase="collect" showClues={false} />
    )
    await userEvent.click(screen.getAllByRole('button', { name: /Sans objet/ })[0])

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          GuideProgress: [{ StepId: 'aitm', State: 'skipped' }],
        }),
      })
    )
  })

  it('renders nothing for a phase the type has no steps for', () => {
    const { container } = renderWithProviders(
      <PsitSocGuidePanel socCase={socCase} queryKey="k" evidence={{}} phase="scope" showClues={false} />
    )
    expect(container).toBeEmptyDOMElement()
  })
})
