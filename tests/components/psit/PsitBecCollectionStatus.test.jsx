import React from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import { PsitBecCollectionStatus } from '../../../src/components/psit/PsitBecCollectionStatus'

// Rendering MUI through jsdom on a cold cache runs past Vitest's 5 s default on a laptop, and a
// timeout reads exactly like a broken assertion. Set per file rather than in vitest.config.mjs,
// which is upstream: no divergence, and the value travels with the tests that need it.
vi.setConfig({ testTimeout: 60000 })


describe('PsitBecCollectionStatus', () => {
  it('stays out of the way when the collection is usable', () => {
    const { container } = renderWithProviders(
      <PsitBecCollectionStatus becData={{ ExtractedAt: new Date().toISOString() }} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('names a cached failure and says that reloading will not clear it', () => {
    renderWithProviders(
      <PsitBecCollectionStatus becData={{ Results: 'AADSTS500011: tenant not found' }} />
    )

    expect(screen.getByText('La collecte a échoué')).toBeInTheDocument()
    expect(screen.getByText(/AADSTS500011/)).toBeInTheDocument()
    expect(screen.getByText(/Un échec reste en cache/)).toBeInTheDocument()
    // The analyst has to know a re-run does not destroy the determinations already signed.
    expect(screen.getByText(/ne sont pas effacées par une relance/)).toBeInTheDocument()
  })

  it('offers the re-run and calls it', async () => {
    const onRestart = vi.fn()
    renderWithProviders(
      <PsitBecCollectionStatus becData={{ Results: 'erreur' }} onRestart={onRestart} />
    )

    await userEvent.click(screen.getByRole('button', { name: /Relancer la collecte/ }))
    expect(onRestart).toHaveBeenCalledTimes(1)
  })

  it('warns about an old collection without calling it a failure', () => {
    renderWithProviders(
      <PsitBecCollectionStatus becData={{ ExtractedAt: '2020-01-01T00:00:00Z' }} />
    )

    expect(screen.getByText('Collecte ancienne')).toBeInTheDocument()
    expect(screen.queryByText('La collecte a échoué')).not.toBeInTheDocument()
  })
})
