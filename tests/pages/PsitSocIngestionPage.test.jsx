import React from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test-utils'
import Page from '../../src/pages/security/soc/ingestion'
import { ApiGetCall, ApiPostCall } from '../../src/api/ApiCall'

// This page is the only way to turn the ingestion endpoint on. What is pinned here is that it
// never presents a closed door as an open one, that the shared secret is not on screen until
// someone asks for it, and that it states what the endpoint answers for a client it does not
// know: that answer is the branch the calling automation has to take, and it should not have to
// read our source to find it.

vi.setConfig({ testTimeout: 60000 })

vi.mock('next/router', () => ({
  useRouter: () => ({ query: {}, pathname: '/security/soc/ingestion', push: vi.fn() }),
}))

vi.mock('../../src/api/ApiCall', () => ({
  ApiGetCall: vi.fn(() => ({ data: undefined, isFetching: false, isSuccess: false })),
  ApiPostCall: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false })),
  ApiGetCallWithPagination: vi.fn(() => ({ data: undefined, isFetching: false })),
}))

const wire = (data) =>
  ApiGetCall.mockImplementation(() => ({ data, isFetching: false, isSuccess: true }))

describe('SOC ingestion configuration', () => {
  beforeEach(() => {
    ApiPostCall.mockImplementation(() => ({
      mutate: vi.fn(),
      isPending: false,
      isSuccess: false,
      isError: false,
    }))
  })

  it('says the endpoint refuses everything while no secret exists', () => {
    wire({ Configured: false })
    renderWithProviders(<Page />)

    expect(screen.getByText(/refuse tous les appels/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Générer le secret/ })).toBeInTheDocument()
    // No address to copy when there is nothing to authorise with.
    expect(screen.queryByText(/Adresse à appeler/)).not.toBeInTheDocument()
  })

  it('keeps the secret off screen until someone asks for it', async () => {
    wire({ Configured: true, Secret: 'a'.repeat(64), RotatedUtc: '2026-08-25T09:00:00Z' })
    renderWithProviders(<Page />)

    expect(screen.queryByText(new RegExp('a'.repeat(64)))).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Afficher' }))
    expect(screen.getByText(new RegExp('a'.repeat(64)))).toBeInTheDocument()
  })

  it('warns that regenerating breaks the automation before it is clicked', () => {
    wire({ Configured: true, Secret: 'b'.repeat(64), RotatedUtc: '2026-08-25T09:00:00Z' })
    renderWithProviders(<Page />)

    expect(screen.getByRole('button', { name: /Régénérer le secret/ })).toBeInTheDocument()
    expect(screen.getByText(/invalide l’ancien secret immédiatement/)).toBeInTheDocument()
  })

  it('rotates through the endpoint that owns the secret', async () => {
    const mutate = vi.fn()
    ApiPostCall.mockImplementation(() => ({ mutate, isPending: false, isSuccess: false, isError: false }))
    wire({ Configured: false })
    renderWithProviders(<Page />)

    await userEvent.click(screen.getByRole('button', { name: /Générer le secret/ }))

    expect(mutate).toHaveBeenCalledWith({
      url: '/api/PSITExecSocWebhookSecret',
      data: { rotate: true },
    })
  })

  it('states what the endpoint answers for a client it does not manage', () => {
    // The reason this is on the page: the calling automation branches on it, and a client hosted
    // elsewhere raising alerts every week would otherwise fill the queue with rows no screen here
    // can investigate.
    wire({ Configured: true, Secret: 'c'.repeat(64) })
    renderWithProviders(<Page />)

    expect(screen.getByText(/aucun dossier n’est ouvert/)).toBeInTheDocument()
    // And the case that must not be dropped, told apart from it.
    expect(screen.getByText(/le dossier est bien\s+créé/)).toBeInTheDocument()
  })
})
