import React from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import { PsitThemePicker } from '../../../src/components/psit/PsitThemePicker'
import { useSettings } from '../../../src/hooks/use-settings'

vi.setConfig({ testTimeout: 60000 })

vi.mock('../../../src/hooks/use-settings', () => ({ useSettings: vi.fn() }))

// What is pinned here: the picker lists the five themes with Ugly Orange as the resting
// default, applies a choice immediately through the browser-side settings channel, and a
// stale stored preset falls back to Ugly Orange instead of rendering an empty select.

describe('PsitThemePicker', () => {
  it('applies the picked theme on change, no save button involved', async () => {
    const handleUpdate = vi.fn()
    useSettings.mockReturnValue({ colorPreset: undefined, handleUpdate })
    renderWithProviders(<PsitThemePicker />)

    await userEvent.click(screen.getByRole('combobox'))
    // The closed select already shows the resting default, so the open menu is asserted
    // through the option role, never by bare text.
    expect(await screen.findByRole('option', { name: 'Ugly Orange' })).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(5)
    await userEvent.click(screen.getByRole('option', { name: 'Plein Sud' }))

    expect(handleUpdate).toHaveBeenCalledWith({ colorPreset: 'psit-plein-sud' })
  })

  it('falls back to Ugly Orange when the stored preset no longer exists', () => {
    useSettings.mockReturnValue({ colorPreset: 'deleted-theme', handleUpdate: vi.fn() })
    renderWithProviders(<PsitThemePicker />)

    expect(screen.getByText('Ugly Orange')).toBeInTheDocument()
  })
})
