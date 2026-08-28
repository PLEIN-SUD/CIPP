import { useRouter } from 'next/router'
import Link from 'next/link'
import { Tab, Tabs } from '@mui/material'

const SCREENS = [
  { value: '/security/soc/bec', label: 'BEC (utilisateur)' },
  { value: '/security/soc/investigate/app', label: 'Application' },
  { value: '/security/soc/investigate/machine', label: 'Machine' },
  { value: '/security/soc/investigate/message', label: 'Message' },
]

/**
 * The free-investigation screens are one menu entry; these tabs are the choice inside it.
 * Plain links, so switching keeps the browser's back button honest; the current screen's tab
 * is read off the route rather than held in state, so a deep link lands highlighted.
 */
export const PsitSocInvestigateNav = () => {
  const router = useRouter()
  const current = SCREENS.find((screen) => router.pathname === screen.value)?.value ?? false
  return (
    <Tabs value={current} variant="scrollable" allowScrollButtonsMobile>
      {SCREENS.map((screen) => (
        <Tab
          key={screen.value}
          value={screen.value}
          label={screen.label}
          component={Link}
          href={screen.value}
        />
      ))}
    </Tabs>
  )
}
