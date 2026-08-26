import { useRouter } from 'next/router'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import Link from 'next/link'
import {
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Stack,
  Tab,
  Tabs,
  SvgIcon,
  Typography,
} from '@mui/material'
import { ArrowBack, Launch } from '@mui/icons-material'
import { Layout as DashboardLayout } from '../../../layouts/index.js'
import { ApiGetCall } from '../../../api/ApiCall'
import { CippHead } from '../../../components/CippComponents/CippHead'
import { CippCopyToClipBoard } from '../../../components/CippComponents/CippCopyToClipboard'
import { CippFormTenantSelector } from '../../../components/CippComponents/CippFormTenantSelector'
import { CippFormUserSelector } from '../../../components/CippComponents/CippFormUserSelector'
import { PsitBecDecisionPanel } from '../../../components/psit/PsitBecDecisionPanel'
import { PsitBecCheckList } from '../../../components/psit/soc/PsitBecCheckList'
import { PsitBecIdentityPanel } from '../../../components/psit/soc/PsitBecIdentityPanel'
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
/**
 * Opened from a case, the page investigates that case's user. Opened from the menu, it has no
 * user, and used to say so and stop there: a menu entry that cannot work when clicked. It now
 * asks which mailbox to look at, which is the only thing it was missing.
 */
const PsitBecTargetPicker = () => {
  const router = useRouter()
  const formControl = useForm({ mode: 'onChange' })
  const tenant = useWatch({ control: formControl.control, name: 'tenantFilter' })
  const user = useWatch({ control: formControl.control, name: 'user' })

  const chosenTenant = tenant?.value ?? tenant
  const chosenUser = user?.value ?? user

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Choisir la boîte à investiguer. Ouverte depuis un cas SOC, cette page cible
            directement l’utilisateur du cas.
          </Typography>
          <CippFormTenantSelector
            formControl={formControl}
            name="tenantFilter"
            label="Client"
            allTenants={false}
            multiple={false}
          />
          <CippFormUserSelector
            formControl={formControl}
            name="user"
            label="Utilisateur"
            multiple={false}
            select="id,userPrincipalName,displayName"
            disabled={!chosenTenant}
          />
          <Button
            variant="contained"
            disabled={!chosenTenant || !chosenUser}
            onClick={() =>
              router.push(
                `/security/soc/bec?userId=${chosenUser}&tenantFilter=${chosenTenant}`
              )
            }
          >
            Lancer l’investigation
          </Button>
        </Stack>
      </CardContent>
    </Card>
  )
}

const Page = () => {
  const router = useRouter()
  const { userId, tenantFilter, caseId } = router.query
  // Three tabs rather than one column: the decision, the person, the evidence. Stacked, the
  // analyst scrolled past the reading to reach what it was based on, and back up to act on it.
  const [tab, setTab] = useState('decision')

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
              href={caseId ? `/security/soc/case?caseId=${caseId}&tenantFilter=${tenantFilter}` : '/security/soc/queue'}
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
            <PsitBecTargetPicker />
          ) : (
            <>
              <Tabs
                value={tab}
                onChange={(event, value) => setTab(value)}
                variant="scrollable"
                allowScrollButtonsMobile
              >
                <Tab value="decision" label="Décision" />
                <Tab value="identity" label="Titulaire" />
                <Tab value="checks" label="Contrôles" />
              </Tabs>

              {tab === 'decision' && (
                <PsitBecDecisionPanel
                  userData={userData}
                  becData={becData}
                  tenantFilter={tenantFilter}
                  triage={triage}
                  onRestart={restartCollection}
                />
              )}
              {tab === 'identity' && (
                <PsitBecIdentityPanel userData={userData} becData={becData} />
              )}
              {tab === 'checks' && <PsitBecCheckList becData={becData} />}
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
