import { render, screen } from '@testing-library/react'
import { PsitBrandLogo } from '../../../src/components/psit/PsitBrandLogo'

// Rendering MUI through jsdom on a cold cache runs past Vitest's 5 s default on a laptop, and a
// timeout reads exactly like a broken assertion. Set per file rather than in vitest.config.mjs,
// which is upstream: no divergence, and the value travels with the tests that need it.
vi.setConfig({ testTimeout: 60000 })


describe('PsitBrandLogo', () => {
  it('renders the Plein Sud wordmark from public/', () => {
    render(<PsitBrandLogo />)
    const img = screen.getByAltText('Plein Sud IT')
    expect(img).toHaveAttribute('src', '/psit-logo.webp')
  })

  it('honours the height passed by the top nav', () => {
    render(<PsitBrandLogo height={18} />)
    expect(screen.getByAltText('Plein Sud IT')).toHaveStyle({ height: '18px' })
  })
})
