import React from 'react'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test-utils'
import Page from '../../src/pages/security/soc/bec'

// Rendering MUI through jsdom on a cold cache runs past Vitest's 5 s default on a laptop, and a
// timeout reads exactly like a broken assertion. Set per file rather than in vitest.config.mjs,
// which is upstream: no divergence, and the value travels with the tests that need it.
vi.setConfig({ testTimeout: 60000 })

const routerQuery = vi.hoisted(() => ({ current: {} }))
const routerReplace = vi.hoisted(() => vi.fn())
vi.mock('next/router', () => ({
  useRouter: () => ({ isReady: true, query: routerQuery.current, push: vi.fn(), back: vi.fn(), replace: routerReplace }),
}))

// The page is a tombstone kept for the links in the wild: escalation mails, bookmarks, old
// ticket notes. What these tests pin is where each kind of link lands.
describe('SOC BEC page, now a redirect', () => {
  beforeEach(() => routerReplace.mockClear())

  it('sends a dossier-carrying link to its dossier', () => {
    routerQuery.current = { userId: 'u', tenantFilter: 'contoso.test', caseId: 'PSIT-SOC-1' }
    renderWithProviders(<Page />)

    expect(routerReplace).toHaveBeenCalledWith(
      '/security/soc/case?caseId=PSIT-SOC-1&tenantFilter=contoso.test'
    )
  })

  it('sends anything else to the queue, where a dossier can be opened', () => {
    routerQuery.current = { userId: 'u', tenantFilter: 'contoso.test' }
    renderWithProviders(<Page />)

    expect(routerReplace).toHaveBeenCalledWith('/security/soc/queue')
  })

  it('says where the investigation lives now', () => {
    routerQuery.current = {}
    renderWithProviders(<Page />)

    expect(screen.getByText(/vit désormais dans les onglets du dossier/)).toBeInTheDocument()
  })
})
