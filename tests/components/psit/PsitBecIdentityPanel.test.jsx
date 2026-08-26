import React from 'react'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import { PsitBecIdentityPanel } from '../../../src/components/psit/soc/PsitBecIdentityPanel'

// The second-factors card sits under a title that promises factors. What is pinned here is that
// the promise is honest: no method at all is said loudly, and a method that cannot satisfy an MFA
// prompt - the recovery address resets a password, nothing more - is not allowed to make a
// password-only account read as protected.

vi.setConfig({ testTimeout: 60000 })

const userData = { userPrincipalName: 'p@contoso.test', usageLocation: 'FR' }

const panel = (MFADevices) =>
  renderWithProviders(
    <PsitBecIdentityPanel userData={userData} becData={{ MFADevices, SuspectUserSignIns: [] }} />
  )

describe('second factors, honestly', () => {
  it('says loudly when no method is registered at all', () => {
    panel([])
    expect(screen.getByText(/ne tient que par son\s+mot de passe/)).toBeInTheDocument()
  })

  it('does not let a recovery address pass for a second factor', () => {
    panel([{ '@odata.type': '#microsoft.graph.emailAuthenticationMethod', emailAddress: 'x@gmail.test' }])

    expect(screen.getByText(/Adresse de secours/)).toBeInTheDocument()
    expect(screen.getByText('réinitialisation seulement')).toBeInTheDocument()
    // The account holds only that: the panel says the account rests on its password alone.
    expect(screen.getByText(/n’est utilisable comme second facteur/)).toBeInTheDocument()
  })

  it('stays quiet when a real factor is registered', () => {
    panel([
      { '@odata.type': '#microsoft.graph.emailAuthenticationMethod', emailAddress: 'x@gmail.test' },
      { '@odata.type': '#microsoft.graph.microsoftAuthenticatorAuthenticationMethod', displayName: 'iPhone' },
    ])

    expect(screen.getByText(/Microsoft Authenticator · iPhone/)).toBeInTheDocument()
    expect(screen.queryByText(/ne tient que par son/)).not.toBeInTheDocument()
  })

  it('counts an unknown method type as a factor rather than declaring it absent', () => {
    // Claiming a factor is missing because we do not recognise it is the worse mistake.
    panel([{ '@odata.type': '#microsoft.graph.someFutureMethod' }])
    expect(screen.queryByText(/ne tient que par son/)).not.toBeInTheDocument()
  })
})
