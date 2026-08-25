import { useEffect } from 'react'
import { useRouter } from 'next/router'

/**
 * The section root redirects to the queue.
 *
 * The queue used to live here, and that was the cause of a breadcrumb that named every SOC screen
 * a child of "File d'attente": the trail is resolved by prefix, so a menu entry on /security/soc
 * swallowed every /security/soc/* page under it. No menu path is a prefix of another one now.
 */
const Page = () => {
  const router = useRouter()

  useEffect(() => {
    router.replace('/security/soc/queue')
  }, [router])

  return null
}

export default Page
