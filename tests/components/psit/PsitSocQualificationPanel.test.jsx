import React from 'react'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import { PsitSocQualificationPanel } from '../../../src/components/psit/soc/PsitSocQualificationPanel'
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

const xdrCase = {
  CaseId: 'PSIT-SOC-20260824-AAAA',
  Tenant: 'contoso.test',
  Source: 'xdr',
  // Type 12 since the Lighthouse family was merged into the endpoint one.
  TypeId: 12,
  Status: 'investigating',
  ExternalRef: 'INC-12345',
}

// One shared mutate: the first call is the case write, the second the Defender write-back. The
// mock resolves onSuccess synchronously so the chain runs inside the test.
const armMutate = () => {
  const mutate = vi.fn((payload, options) => options?.onSuccess?.())
  ApiPostCall.mockImplementation(() => ({
    mutate,
    isPending: false,
    isSuccess: false,
    isError: false,
  }))
  return mutate
}

describe('PsitSocQualificationPanel', () => {
  it('saves the verdict on the case, then writes it back into the Defender incident', async () => {
    const mutate = armMutate()
    renderWithProviders(<PsitSocQualificationPanel socCase={xdrCase} queryKey="k" />)

    await userEvent.click(screen.getByRole('button', { name: /^Faux positif/ }))
    await userEvent.type(
      screen.getByRole('textbox', { name: /Justification/ }),
      'Scanner des techniciens'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la qualification' }))

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2))

    const caseWrite = mutate.mock.calls[0][0]
    expect(caseWrite.url).toBe('/api/PSITExecSocCase')
    expect(caseWrite.data.Verdict).toBe('false-positive')
    expect(caseWrite.data.Justification).toBe('Scanner des techniciens')
    expect(caseWrite.data.CaseId).toBe('PSIT-SOC-20260824-AAAA')

    // The write-back mirrors the verdict into Defender: resolved false positive, not malicious.
    const writeBack = mutate.mock.calls[1][0]
    expect(writeBack.url).toBe('/api/ExecSetSecurityIncident')
    expect(writeBack.data.GUID).toBe('INC-12345')
    expect(writeBack.data.Status).toBe('resolved')
    expect(writeBack.data.Classification).toBe('falsePositive')
    expect(writeBack.data.Determination).toBe('notMalicious')
  })

  it('pushes a benign true positive as informational into Defender, never as FP', async () => {
    // Defender's own word for it: forcing falsePositive here would tune the detection out.
    const mutate = vi.fn((payload, options) => options?.onSuccess?.())
    ApiPostCall.mockImplementation(() => ({ mutate, isPending: false, isSuccess: false, isError: false }))

    renderWithProviders(<PsitSocQualificationPanel socCase={xdrCase} queryKey="k" />)
    await userEvent.click(screen.getByRole('button', { name: /^Vrai positif bénin/ }))
    await userEvent.type(screen.getByLabelText(/Justification/), 'VPN du titulaire, traité')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la qualification' }))

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2))
    const writeBack = mutate.mock.calls[1][0]
    expect(writeBack.url).toBe('/api/ExecSetSecurityIncident')
    expect(writeBack.data.Classification).toBe('informationalExpectedActivity')
    expect(writeBack.data.Classification).not.toBe('falsePositive')
  })

  it('routes the write-back to the MDO endpoint when the case came from an MDO alert', async () => {
    const mutate = armMutate()
    renderWithProviders(
      <PsitSocQualificationPanel socCase={{ ...xdrCase, Source: 'mdo' }} queryKey="k" />
    )

    await userEvent.click(screen.getByRole('button', { name: /^Vrai positif(?! bénin)/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la qualification' }))

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2))
    const writeBack = mutate.mock.calls[1][0]
    expect(writeBack.url).toBe('/api/ExecSetMdoAlert')
    expect(writeBack.data.Classification).toBe('truePositive')
    // A true positive does not resolve the alert: the incident is still being worked.
    expect(writeBack.data.Status).toBeUndefined()
  })

  it('writes nothing back for an undetermined verdict: Defender has no honest equivalent', async () => {
    const mutate = armMutate()
    renderWithProviders(<PsitSocQualificationPanel socCase={xdrCase} queryKey="k" />)

    await userEvent.click(screen.getByRole('button', { name: /^Indéterminé/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la qualification' }))

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    expect(mutate.mock.calls[0][0].data.Verdict).toBe('undetermined')
  })

  it('writes nothing back for a case typed in from a notification: there is no Defender object', async () => {
    const mutate = armMutate()
    renderWithProviders(
      <PsitSocQualificationPanel
        socCase={{ ...xdrCase, Source: 'extsoc', ExternalRef: 'EXT-1' }}
        queryKey="k"
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /^Faux positif/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la qualification' }))

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
  })

  it('shows the standing qualification and its history: a changed mind stays visible', () => {
    armMutate()
    renderWithProviders(
      <PsitSocQualificationPanel
        socCase={{
          ...xdrCase,
          Qualification: {
            Verdict: 'true-positive',
            Justification: 'le client dément le VPN',
            Analyst: 'b',
            DecidedUtc: '2026-08-24T15:00:00Z',
            PreviousVerdicts: [
              {
                Verdict: 'false-positive',
                Justification: 'VPN',
                Analyst: 'a',
                DecidedUtc: '2026-08-24T14:00:00Z',
              },
            ],
          },
        }}
        queryKey="k"
      />
    )

    expect(screen.getByText(/Vrai positif, b/)).toBeInTheDocument()
    expect(screen.getByText('Verdicts précédents')).toBeInTheDocument()
    expect(screen.getByText(/false-positive, a/)).toBeInTheDocument()
  })

  it('keeps the save disabled until a verdict is picked', () => {
    armMutate()
    renderWithProviders(<PsitSocQualificationPanel socCase={xdrCase} queryKey="k" />)

    expect(screen.getByRole('button', { name: 'Enregistrer la qualification' })).toBeDisabled()
  })
})
