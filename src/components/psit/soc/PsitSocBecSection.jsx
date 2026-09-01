import { useEffect, useMemo } from 'react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  Typography,
  Tooltip,
} from '@mui/material'
import { ApiGetCall } from '../../../api/ApiCall'
import { usePsitBecCollection } from '../../../hooks/use-psit-bec-collection'
import { PsitBecCollectionProgress } from './PsitBecCollectionProgress'
import { PsitBecTriagePanel } from '../PsitBecTriagePanel'
import { PsitBecCheckList } from './PsitBecCheckList'
import { PsitBecDecisionPanel } from '../PsitBecDecisionPanel'

/**
 * The BEC investigation, folded into the dossier's tabs (it used to be its own page).
 *
 * The collection is an orchestrated job that reads a mailbox in depth, so it never starts by
 * itself on every dossier that names a user: the collect tab offers the button, and mounting is
 * the gesture. Two exceptions auto-start it, because the investigation is already engaged there:
 * a fiche BEC exists, or triage determinations exist. The started flag lives on the page, not
 * here, so switching tabs does not forget it.
 *
 * part="collect" renders the collection and the triage (the evidence); part="decision" renders
 * the fiche BEC and its reports (the outcome). Same components as the old page, same collection
 * hook: one behaviour, not a drifting copy.
 */
export const PsitSocBecSection = ({ socCase, queryKey, part, started, onStart }) => {
  const tenantFilter = socCase?.Tenant
  const userId = socCase?.Entities?.userId
  const upn = socCase?.Entities?.upn

  // The same lookup the evidence hook makes (same queryKey): resolves the full user object the
  // BEC panels need, one request for the whole page.
  const userLookup = ApiGetCall({
    url: `/api/ListUsers?tenantFilter=${tenantFilter}&graphFilter=userPrincipalName eq '${upn}'`,
    queryKey: `PSITSocUser-${tenantFilter}-${upn}`,
    waiting: Boolean(tenantFilter && upn),
  })
  const userData = useMemo(() => {
    const row = Array.isArray(userLookup.data) ? userLookup.data[0] : userLookup.data
    return row ?? (userId && upn ? { id: userId, userPrincipalName: upn } : null)
  }, [userLookup.data, userId, upn])

  const effectiveUserId = userId || userData?.id

  const triageRequest = ApiGetCall({
    url: `/api/PSITListBecTriage?tenantFilter=${tenantFilter}&userId=${effectiveUserId}`,
    queryKey: `PSITBecTriage-${tenantFilter}-${effectiveUserId}`,
    waiting: Boolean(tenantFilter && effectiveUserId),
  })
  const triage = useMemo(
    () => (Array.isArray(triageRequest.data) ? triageRequest.data : []),
    [triageRequest.data]
  )

  const incidentRequest = ApiGetCall({
    url: `/api/PSITListBecIncident?tenantFilter=${tenantFilter}&userId=${effectiveUserId}&userPrincipalName=${upn}`,
    queryKey: `PSITBecIncident-${tenantFilter}-${effectiveUserId}`,
    waiting: Boolean(tenantFilter && effectiveUserId),
  })

  // An engaged investigation resumes by itself: a fiche or triage rows mean someone already
  // collected once, and a button asking to start over would read as lost work.
  const engaged =
    incidentRequest.data?.Incident?.Exists === true || triage.length > 0
  useEffect(() => {
    if (!started && engaged) onStart()
  }, [started, engaged, onStart])

  // The hook queues the collection the moment it has its identifiers: gating them on `started`
  // is what keeps every dossier from silently paying a mailbox read.
  const { becData, isFetching, restartCollection } = usePsitBecCollection({
    userId: started ? effectiveUserId : undefined,
    tenantFilter: started ? tenantFilter : undefined,
    userPrincipalName: started ? upn : undefined,
  })

  if (!upn || !tenantFilter) return null

  if (part === 'collect') {
    if (!started) {
      return (
        <Card variant="outlined">
          <CardHeader
            title="Collecte BEC"
            subheader="Lecture en profondeur de la boîte : connexions, règles, signaux d’exfiltration"
          />
          <CardContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Traitement de une à deux minutes ; la progression s’affiche ici.
            </Typography>
            <Tooltip describeChild title="Lancer la collecte BEC : traitement orchestré d'une à deux minutes ; la progression s'affiche ici et la fiche BEC s'ouvre ensuite dans l'onglet Décision">
              <Button size="small" variant="contained" onClick={onStart}>
                Lancer la collecte BEC
              </Button>
            </Tooltip>
          </CardContent>
        </Card>
      )
    }
    if (isFetching || !becData || becData.Waiting) {
      return <PsitBecCollectionProgress userPrincipalName={upn} />
    }
    return (
      <>
        <PsitBecTriagePanel userData={userData} becData={becData} tenantFilter={tenantFilter} />
        <PsitBecCheckList becData={becData} />
      </>
    )
  }

  // part === 'decision'
  if (!started) {
    return (
      <Alert severity="info">
        La fiche BEC s’ouvre après la collecte : lancer « Lancer la collecte BEC » dans l’onglet « 3. Preuves ».
      </Alert>
    )
  }
  if (isFetching || !becData || becData.Waiting) {
    return <PsitBecCollectionProgress userPrincipalName={upn} />
  }
  return (
    <PsitBecDecisionPanel
      userData={userData}
      becData={becData}
      tenantFilter={tenantFilter}
      triage={triage}
      onRestart={restartCollection}
      showTriage={false}
      suggestedTicket={socCase?.TicketRef || socCase?.ExternalRef || ''}
    />
  )
}
