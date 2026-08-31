import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { Container, Stack, Typography } from '@mui/material'
import { Layout as DashboardLayout } from '../../../layouts/index.js'
import { CippHead } from '../../../components/CippComponents/CippHead'

/**
 * A redirect, kept alive for the links in the wild.
 *
 * The BEC investigation lives inside the dossier's tabs now (collection under Preuves, fiche
 * under Décision & Réponse), and free consultation is retired: everything goes through a
 * dossier, so every look leaves a trace. But escalation mails, browser bookmarks and old ticket
 * notes still point here - a dossier-carrying link lands on its dossier, anything else lands on
 * the queue where a dossier can be opened.
 */
const Page = () => {
  const router = useRouter()
  const { tenantFilter, caseId } = router.query

  useEffect(() => {
    if (!router.isReady) return
    if (caseId && tenantFilter) {
      router.replace(`/security/soc/case?caseId=${caseId}&tenantFilter=${tenantFilter}`)
    } else {
      router.replace('/security/soc/queue')
    }
    // router identity churns; the query values are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, caseId, tenantFilter])

  return (
    <>
      <CippHead title="Investigation BEC" />
      <Container maxWidth={false} sx={{ py: 2 }}>
        <Stack spacing={1}>
          <Typography variant="body2" color="text.secondary">
            L’investigation BEC vit désormais dans les onglets du dossier. Redirection…
          </Typography>
        </Stack>
      </Container>
    </>
  )
}

Page.getLayout = (page) => <DashboardLayout>{page}</DashboardLayout>

export default Page
