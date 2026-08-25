import { useRouter } from 'next/router'
import Link from 'next/link'
import {
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Stack,
  SvgIcon,
  Typography,
} from '@mui/material'
import { ArrowBack, Launch } from '@mui/icons-material'
import { Layout as DashboardLayout } from '../../../layouts/index.js'
import { ApiGetCall } from '../../../api/ApiCall'
import { CippHead } from '../../../components/CippComponents/CippHead'
import { CippCopyToClipBoard } from '../../../components/CippComponents/CippCopyToClipboard'
import { PsitBecDecisionPanel } from '../../../components/psit/PsitBecDecisionPanel'
import { PsitBecCheckList } from '../../../components/psit/soc/PsitBecCheckList'
import { psitAsArray } from '../../../utils/psit-as-array'
import { usePsitBecCollection } from '../../../hooks/use-psit-bec-collection'

/**
 * The BEC investigation, inside the security centre.
 *
 * Everything an analyst decides on a compromised mailbox lives here: the collection status, the
 * qualification of the signals the data cannot settle alone, the incident record, and both
 * reports. It is the same PSIT experience as before - the same components, the same collection
 * through the same hook - moved next to the cases it belongs with, so an analyst has one security
 * centre rather than two places to know about.
 *
 * The upstream user page keeps working exactly as CyberDrain ships it; this page does not replace
 * it, it gathers the PSIT work in one place. A case in the queue links straight here with its
 * user, which is the path this page exists for.
 */
const Page = () => {
  const router = useRouter()
  const { userId, tenantFilter, caseId } = router.query

  const userRequest = ApiGetCall({
    url: `/api/ListUsers?UserId=${userId}&tenantFilter=${tenantFilter}`,
    queryKey: `ListUsers-${userId}`,
    waiting: Boolean(userId && tenantFilter),
  })
  const userData = userRequest.data?.[0]

  const { becData, isFetching, restartCollection } = usePsitBecCollection({
    userId,
    tenantFilter,
    userPrincipalName: userData?.userPrincipalName,
  })

  // The analyst determinations, fetched here so the panel and both reports read the same answers.
  // React Query dedupes on the key, so the panel fetching it too costs nothing.
  const triageRequest = ApiGetCall({
    url: `/api/PSITListBecTriage?tenantFilter=${tenantFilter}&userId=${userId}`,
    queryKey: `PSITBecTriage-${tenantFilter}-${userId}`,
    waiting: Boolean(userId && tenantFilter),
  })
  // The worker serialises a one-row list as a bare object, so never trust it to be an array.
  const triage = psitAsArray(triageRequest.data?.Determinations)

  return (
    <>
      <CippHead title={`Investigation BEC ${userData?.userPrincipalName ?? ''}`} />
      <Container maxWidth={false} sx={{ py: 2 }}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <Button
              component={Link}
              href={caseId ? `/security/soc/case?caseId=${caseId}&tenantFilter=${tenantFilter}` : '/security/soc'}
              startIcon={
                <SvgIcon fontSize="small">
                  <ArrowBack />
                </SvgIcon>
              }
            >
              {caseId ? 'Retour au cas' : 'File d’attente'}
            </Button>
            <Typography variant="h5">
              {userData?.displayName ?? 'Investigation BEC'}
            </Typography>
            {userData?.userPrincipalName && (
              <CippCopyToClipBoard text={userData.userPrincipalName} type="chip" />
            )}
            {tenantFilter && <Chip size="small" label={tenantFilter} />}
            {userId && tenantFilter && (
              <Button
                size="small"
                variant="text"
                component={Link}
                href={`/identity/administration/users/user/bec?userId=${userId}`}
                endIcon={
                  <SvgIcon fontSize="small">
                    <Launch />
                  </SvgIcon>
                }
              >
                Vue upstream
              </Button>
            )}
          </Stack>

          {!userId || !tenantFilter ? (
            <Card variant="outlined">
              <CardContent>
                <Typography variant="body2">
                  Aucun utilisateur ciblé : ouvrir cette page depuis un cas SOC, ou passer userId
                  et tenantFilter dans l’adresse.
                </Typography>
              </CardContent>
            </Card>
          ) : (
            <>
              <PsitBecDecisionPanel
                userData={userData}
                becData={becData}
                tenantFilter={tenantFilter}
                triage={triage}
                onRestart={restartCollection}
              />
              {/* The material the decision rests on, below the decision: the checks are the
                  evidence, and evidence comes after the reading of it. */}
              <PsitBecCheckList becData={becData} />
            </>
          )}

          {userId && tenantFilter && isFetching && !becData && (
            <Card variant="outlined">
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  Collecte en cours : les onze contrôles s’exécutent en tâche de fond, la page se
                  met à jour toute seule.
                </Typography>
              </CardContent>
            </Card>
          )}
        </Stack>
      </Container>
    </>
  )
}

Page.getLayout = (page) => <DashboardLayout>{page}</DashboardLayout>

export default Page
