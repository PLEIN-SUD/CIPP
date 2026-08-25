import React from 'react'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test-utils'
import Page from '../../src/pages/security/soc/fleet'
import { ApiGetCall } from '../../src/api/ApiCall'

// The fleet page exists to answer one question no portal answers: which machines, across every
// client, have their protection off or something running on them. What is pinned here is that its
// counters never overstate what they measure - a failed read must not look like a healthy fleet,
// and a machine that stopped reporting must not read as a green row.

vi.setConfig({ testTimeout: 60000 })

vi.mock('next/router', () => ({
  useRouter: () => ({ query: {}, pathname: '/security/soc/fleet', push: vi.fn(), back: vi.fn() }),
}))

vi.mock('../../src/api/ApiCall', () => ({
  ApiGetCall: vi.fn(() => ({ data: undefined, isFetching: false, isSuccess: false, refetch: vi.fn() })),
  ApiPostCall: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false })),
  ApiGetCallWithPagination: vi.fn(() => ({ data: undefined, isFetching: false })),
}))

const fleet = {
  Results: [
    {
      Tenant: 'contoso.test',
      DeviceName: 'PC-042',
      ProtectionInDefault: true,
      ActiveThreatCount: 0,
      ActiveThreats: [],
      NeedsAttention: true,
      ManagedDeviceHealthState: 'active',
    },
    {
      Tenant: 'fabrikam.test',
      DeviceName: 'PC-101',
      ProtectionInDefault: false,
      ActiveThreatCount: 2,
      ActiveThreats: ['Wacatac'],
      NeedsAttention: true,
      ManagedDeviceHealthState: 'active',
    },
    {
      Tenant: 'fabrikam.test',
      DeviceName: 'PC-102',
      ProtectionInDefault: false,
      ActiveThreatCount: 0,
      ActiveThreats: [],
      NeedsAttention: false,
      ManagedDeviceHealthState: 'active',
    },
  ],
  Tenants: [
    { Tenant: 'contoso.test', DevicesReported: 1, NeedsAttention: 1 },
    { Tenant: 'fabrikam.test', DevicesReported: 2, NeedsAttention: 1 },
  ],
  Metadata: { TotalDevices: 3, NeedsAttention: 2, ActiveThreats: 1 },
}

// Url-aware: the table makes its own calls internally, and feeding them the fleet payload would
// test the mock rather than the page.
const wire = (data, history = undefined) =>
  ApiGetCall.mockImplementation((opts) => {
    const url = String(opts?.url ?? '')
    if (url.includes('PSITListFleetHistory')) {
      return { data: history, isFetching: false, isSuccess: true, refetch: vi.fn() }
    }
    if (url.includes('PSITListFleetHealth')) {
      return { data, isFetching: false, isSuccess: true, refetch: vi.fn() }
    }
    return { data: undefined, isFetching: false, isSuccess: false, refetch: vi.fn() }
  })

describe('fleet health page', () => {
  it('counts what it measures: devices in default, devices carrying a threat, clients touched', () => {
    wire(fleet)
    renderWithProviders(<Page />)

    expect(screen.getByText('Protection en défaut')).toBeInTheDocument()
    expect(screen.getByText('Menaces actives')).toBeInTheDocument()
    // Two clients have at least one machine to look at.
    expect(screen.getByText('Tenants concernés')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('shows reported counts per client, so a fleet that went silent is visible', () => {
    wire(fleet)
    renderWithProviders(<Page />)

    // "1 to look at out of 2 reported" - the denominator is what makes a drop visible.
    expect(screen.getByText('fabrikam.test — 1/2')).toBeInTheDocument()
    expect(screen.getByText(/c’est une absence, pas une bonne/)).toBeInTheDocument()
  })

  it('says the read failed instead of rendering a healthy-looking dashboard', () => {
    // The failure mode that matters: an error must never look like a fleet in perfect health.
    wire({ Results: 'Could not read fleet health: Forbidden' })
    renderWithProviders(<Page />)

    expect(screen.getByText(/Could not read fleet health/)).toBeInTheDocument()
    // No summary card at all: counters computed from a failed read would be a lie.
    expect(screen.queryByText('Machines rapportées')).not.toBeInTheDocument()
  })

  it('separates a read that returned nothing from a fleet in good health', () => {
    // Reported from production: a tenant the aggregate knows nothing about rendered as four
    // green zeros, which is the same picture as a fleet where every machine is protected.
    wire({ Results: [], Tenants: [], Metadata: { TotalDevices: 0, NeedsAttention: 0, ActiveThreats: 0 } })
    renderWithProviders(<Page />)

    expect(screen.getByText(/n’a rapporté aucune machine/)).toBeInTheDocument()
    // The counters stay on screen, because zero reported machines is itself a reading, but none
    // of them is coloured as good news.
    expect(screen.getByText('Machines rapportées')).toBeInTheDocument()
  })

  it('names its source and points at the portal for a single machine', () => {
    wire(fleet)
    renderWithProviders(<Page />)

    expect(screen.getByText(/agrégat Lighthouse/)).toBeInTheDocument()
    expect(screen.getByText(/passer par le portail Defender/)).toBeInTheDocument()
  })

  it('shows the recorded trend, and says missing days are missing readings', () => {
    wire(fleet, {
      Daily: [
        { Date: '2026-08-23', DevicesReported: 42, NeedsAttention: 0 },
        { Date: '2026-08-24', DevicesReported: 42, NeedsAttention: 2 },
      ],
    })
    renderWithProviders(<Page />)

    expect(screen.getByText('08-24 — 2/42')).toBeInTheDocument()
    // A day with no reading must not read as a day with no problem.
    expect(screen.getByText(/pas des jours sans problème/)).toBeInTheDocument()
  })

  it('says the trend is empty rather than drawing an empty one', () => {
    wire(fleet, { Daily: [] })
    renderWithProviders(<Page />)

    expect(screen.getByText(/après le premier passage de la tâche quotidienne/)).toBeInTheDocument()
  })

  it('shows a call that never landed as a failure, not as an empty fleet', () => {
    // A 404 on an endpoint the running API does not have yet used to render as "0 machines,
    // 0 threats" - the exact reading this page must never produce.
    ApiGetCall.mockImplementation((opts) => {
      if (String(opts?.url ?? '').includes('PSITListFleetHealth')) {
        return {
          data: undefined,
          isFetching: false,
          isSuccess: false,
          isError: true,
          error: { response: { status: 404 }, message: 'Request failed with status code 404' },
          refetch: vi.fn(),
        }
      }
      return { data: undefined, isFetching: false, isSuccess: false, refetch: vi.fn() }
    })
    renderWithProviders(<Page />)

    expect(screen.getByText(/404/)).toBeInTheDocument()
    expect(screen.queryByText('Machines rapportées')).not.toBeInTheDocument()
  })
})
