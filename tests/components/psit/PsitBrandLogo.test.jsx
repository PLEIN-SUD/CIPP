import { render, screen } from '@testing-library/react'
import { PsitBrandLogo } from '../../../src/components/psit/PsitBrandLogo'

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
