import React from 'react'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import { PsitSocCaseDrawer } from '../../../src/components/psit/soc/PsitSocCaseDrawer'
import { ApiGetCall, ApiPostCall } from '../../../src/api/ApiCall'

// Rendering MUI through jsdom on a cold cache runs past Vitest's 5 s default on a laptop, and a
// timeout reads exactly like a broken assertion. Set per file rather than in vitest.config.mjs,
// which is upstream: no divergence, and the value travels with the tests that need it.
vi.setConfig({ testTimeout: 60000 })

vi.mock('../../../src/api/ApiCall', () => ({
  ApiGetCall: vi.fn(() => ({
    data: undefined,
    isFetching: false,
    isSuccess: false,
    isError: false,
  })),
  ApiPostCall: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
  })),
  ApiGetCallWithPagination: vi.fn(() => ({ data: undefined, isFetching: false })),
}))

// The tenant selector fetches the tenant list: serve it one lab tenant so the form can be filled.
const tenantList = [
  {
    customerId: 'tenant-guid',
    defaultDomainName: 'contoso.test',
    displayName: 'Contoso (lab)',
  },
]

describe('PsitSocCaseDrawer', () => {
  beforeEach(() => {
    ApiGetCall.mockImplementation(() => ({
      data: tenantList,
      isFetching: false,
      isSuccess: true,
      isError: false,
    }))
  })

  it('stays closed until the analyst asks for it', () => {
    renderWithProviders(<PsitSocCaseDrawer />)

    expect(screen.getByRole('button', { name: /Nouveau dossier/ })).toBeInTheDocument()
    expect(screen.queryByText('Nouveau dossier SOC')).not.toBeInTheDocument()
  })

  it('opens the drawer with the required fields and a disabled submit', async () => {
    renderWithProviders(<PsitSocCaseDrawer />)

    await userEvent.click(screen.getByRole('button', { name: /Nouveau dossier/ }))

    expect(screen.getByText('Nouveau dossier SOC')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /Type d’alerte/ })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Titre/ })).toBeInTheDocument()
    // Nothing filled in: creating an empty case must not be possible.
    expect(screen.getByRole('button', { name: 'Créer le dossier' })).toBeDisabled()
  })

  it('asks for an application, not an identifier, on a consent case', async () => {
    renderWithProviders(<PsitSocCaseDrawer />)
    await userEvent.click(screen.getByRole('button', { name: /Nouveau dossier/ }))

    await userEvent.click(screen.getByRole('combobox', { name: /Type d’alerte/ }))
    await userEvent.click(await screen.findByText(/Consentement d’application/))

    // The picker exists so nobody has to go and find an appId first.
    expect(screen.getByRole('combobox', { name: /Application concernée/ })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /Utilisateur concerné/ })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /Machine concernée/ })).not.toBeInTheDocument()
  })

  it('asks for a machine on an endpoint case, and for a message id on a mail case', async () => {
    renderWithProviders(<PsitSocCaseDrawer />)
    await userEvent.click(screen.getByRole('button', { name: /Nouveau dossier/ }))

    await userEvent.click(screen.getByRole('combobox', { name: /Type d’alerte/ }))
    await userEvent.click(await screen.findByText(/Infostealer/))
    expect(screen.getByRole('combobox', { name: /Machine concernée/ })).toBeInTheDocument()
    // An infostealer is a machine case and an identity case at once.
    expect(screen.getByRole('combobox', { name: /Utilisateur concerné/ })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('combobox', { name: /Type d’alerte/ }))
    await userEvent.click(await screen.findByText(/ZAP/))
    expect(screen.getByRole('textbox', { name: /Identifiant de message/ })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /Machine concernée/ })).not.toBeInTheDocument()
  })

  it('asks for no entity at all before a type is chosen', async () => {
    renderWithProviders(<PsitSocCaseDrawer />)
    await userEvent.click(screen.getByRole('button', { name: /Nouveau dossier/ }))

    expect(screen.queryByRole('combobox', { name: /Application concernée/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /Utilisateur concerné/ })).not.toBeInTheDocument()
  })

  it('proposes the nineteen retained types, never Google Workspace', async () => {
    renderWithProviders(<PsitSocCaseDrawer />)
    await userEvent.click(screen.getByRole('button', { name: /Nouveau dossier/ }))

    await userEvent.click(screen.getByRole('combobox', { name: /Type d’alerte/ }))
    const options = await screen.findAllByRole('option')

    expect(options.length).toBe(19)
    expect(options.some((option) => option.textContent.startsWith('8 - '))).toBe(false)
    expect(options.some((option) => option.textContent.includes('Voyage impossible'))).toBe(true)
  })

  it('submits the case with the source and default severity taken from the catalogue', async () => {
    const mutate = vi.fn()
    ApiPostCall.mockImplementation(() => ({
      mutate,
      isPending: false,
      isSuccess: false,
      isError: false,
    }))

    renderWithProviders(<PsitSocCaseDrawer />)
    await userEvent.click(screen.getByRole('button', { name: /Nouveau dossier/ }))

    // Tenant
    await userEvent.click(screen.getByRole('combobox', { name: /Tenant/ }))
    await userEvent.click(await screen.findByText(/contoso\.test/))
    // Type 2: voyage impossible, source extsoc, default P2
    await userEvent.click(screen.getByRole('combobox', { name: /Type d’alerte/ }))
    await userEvent.click(await screen.findByText(/Voyage impossible/))
    // Title + external reference
    await userEvent.type(screen.getByRole('textbox', { name: /Titre/ }), 'Voyage impossible p.martin')
    await userEvent.type(screen.getByRole('textbox', { name: /Référence externe/ }), 'EXT-4242')

    const submit = screen.getByRole('button', { name: 'Créer le dossier' })
    await waitFor(() => expect(submit).toBeEnabled())
    await userEvent.click(submit)

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    const payload = mutate.mock.calls[0][0]

    expect(payload.url).toBe('/api/PSITExecSocCase')
    expect(payload.data.tenantFilter).toBe('contoso.test')
    expect(payload.data.TypeId).toBe(2)
    expect(payload.data.Source).toBe('extsoc')
    // No severity typed: the catalogue default applies, and the case says which one it carries.
    expect(payload.data.Severity).toBe('P2')
    expect(payload.data.Title).toBe('Voyage impossible p.martin')
    expect(payload.data.ExternalRef).toBe('EXT-4242')
    // No user picked in this run: the case carries no entity rather than an empty one.
    expect(payload.data.Entities).toBeUndefined()
  })
})
