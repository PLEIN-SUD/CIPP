import React from 'react'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import { PsitSocDeviceContext } from '../../../src/components/psit/soc/PsitSocDeviceContext'
import { ApiGetCall, ApiPostCall } from '../../../src/api/ApiCall'

// Rendering MUI through jsdom on a cold cache runs past Vitest's 5 s default on a laptop, and a
// timeout reads exactly like a broken assertion. Set per file rather than in vitest.config.mjs,
// which is upstream: no divergence, and the value travels with the tests that need it.
vi.setConfig({ testTimeout: 60000 })

vi.mock('../../../src/api/ApiCall', () => ({
  ApiGetCall: vi.fn(() => ({ data: undefined, isFetching: false, isFetched: false, isSuccess: false, isError: false })),
  ApiPostCall: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false })),
  ApiGetCallWithPagination: vi.fn(() => ({ data: undefined, isFetching: false })),
}))

const socCase = {
  CaseId: 'PSIT-SOC-20260824-DDDD',
  Tenant: 'contoso.test',
  Entities: { deviceId: 'intune-device-id', deviceName: 'PC-042' },
}

const device = {
  id: 'intune-device-id',
  deviceName: 'PC-042',
  complianceState: 'compliant',
  userPrincipalName: 'a.tkachenko@contoso.test',
  operatingSystem: 'Windows',
  osVersion: '10.0.26100',
  azureADDeviceId: 'aad-device-guid',
  lastSyncDateTime: '2026-08-24T08:00:00Z',
}

const wireApi = ({ deviceData = [device], defender = null } = {}) => {
  ApiGetCall.mockImplementation((opts) => {
    const url = opts?.url ?? ''
    if (url.includes('ListDeviceDetails')) {
      return { data: deviceData, isFetching: false, isFetched: true, isSuccess: true, isError: false }
    }
    if (url.includes('ListDefenderState')) {
      return { data: defender, isFetching: false, isFetched: true, isSuccess: true, isError: false }
    }
    return { data: undefined, isFetching: false, isFetched: false, isSuccess: false, isError: false }
  })
}

describe('PsitSocDeviceContext', () => {
  it('asks for a device when the case targets none', () => {
    wireApi()
    renderWithProviders(<PsitSocDeviceContext socCase={{ ...socCase, Entities: {} }} queryKey="k" />)
    expect(screen.getByText(/ne cible pas de machine/)).toBeInTheDocument()
  })

  it('shows the Intune facts an analyst judges the alert on', () => {
    wireApi()
    renderWithProviders(<PsitSocDeviceContext socCase={socCase} queryKey="k" />)

    expect(screen.getByText('conforme')).toBeInTheDocument()
    expect(screen.getByText('a.tkachenko@contoso.test')).toBeInTheDocument()
    expect(screen.getByText(/Windows 10.0.26100/)).toBeInTheDocument()
  })

  it('flags an antivirus that is behind rather than showing a reassuring blank', () => {
    wireApi({
      defender: [{ windowsProtectionState: { signatureUpdateOverdue: true, signatureVersion: '1.400.1' } }],
    })
    renderWithProviders(<PsitSocDeviceContext socCase={socCase} queryKey="k" />)

    expect(screen.getByText('protection en défaut')).toBeInTheDocument()
  })

  it('isolates through the Entra device id, then logs it on the case', async () => {
    wireApi()
    const mutate = vi.fn((payload, options) => options?.onSuccess?.())
    ApiPostCall.mockImplementation(() => ({ mutate, isPending: false, isSuccess: false, isError: false }))

    renderWithProviders(<PsitSocDeviceContext socCase={socCase} queryKey="k" />)
    await userEvent.click(screen.getByRole('button', { name: 'Isoler du réseau' }))

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2))
    expect(mutate.mock.calls[0][0].url).toBe('/api/PSITExecMdeIsolation')
    expect(mutate.mock.calls[0][0].data.AzureADDeviceId).toBe('aad-device-guid')
    expect(mutate.mock.calls[1][0].data.LogAction.Action).toBe('mde-isolate')
  })

  it('says why isolation is unavailable when the device has no Entra id', () => {
    wireApi({ deviceData: [{ ...device, azureADDeviceId: null }] })
    renderWithProviders(<PsitSocDeviceContext socCase={socCase} queryKey="k" />)

    expect(screen.getByRole('button', { name: 'Isoler du réseau' })).toBeDisabled()
    expect(screen.getByText(/Sans identifiant Entra/)).toBeInTheDocument()
  })

  it('says the machine is unknown to Intune instead of rendering an empty card', () => {
    wireApi({ deviceData: [] })
    renderWithProviders(<PsitSocDeviceContext socCase={socCase} queryKey="k" />)

    expect(screen.getByText(/Machine introuvable dans Intune/)).toBeInTheDocument()
  })
})
