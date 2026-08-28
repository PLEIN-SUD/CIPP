import { useMemo } from 'react'
import { Alert, Chip, Container, Stack, Typography } from '@mui/material'
import { Layout as DashboardLayout } from '../../../layouts/index.js'
import { PsitSocWipBanner } from '../../../components/psit/soc/PsitSocWipBanner'
import { CippHead } from '../../../components/CippComponents/CippHead'
import { CippDataTable } from '../../../components/CippTable/CippDataTable.js'
import { ApiGetCall } from '../../../api/ApiCall'
import { useSettings } from '../../../hooks/use-settings'
import {
  psitSocAge,
  psitSocDisplaySeverity,
  psitSocGuideProgress,
  psitSocQueueOrder,
  psitSocQueueSummary,
  psitSocStatusLabel,
  psitSocTypeLabel,
} from '../../../utils/psit-soc-queue'
import { PSIT_SOC_TYPE_OPTIONS } from '../../../utils/psit-soc-types'
import {
  PlayArrow,
  Delete,
  Done,
  Block,
  Edit,
  GppGood,
  LockOpen,
  PersonRemove,
  SwapHoriz,
} from '@mui/icons-material'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { PsitSocCaseDrawer } from '../../../components/psit/soc/PsitSocCaseDrawer'
import { PsitSocImportDrawer } from '../../../components/psit/soc/PsitSocImportDrawer'

/**
 * The SOC triage queue: one row per case, whatever the source (external SOC notification typed
 * in, Defender XDR or MDO incident adopted). The queue is where the analyst picks work; the
 * investigation itself happens on the case view.
 *
 * Every action here writes the case record only. The actions that touch the customer tenant
 * (revoke sessions, remove a rule) live on the case view next to the evidence that justifies
 * them, never on a list where the wrong row is one click away.
 *
 * It is also the screen an analyst opens first and returns to between cases, so it answers "what
 * do I do now" before he reads a row: the counts, and the untouched case that has waited longest,
 * named rather than counted. The rows are then ordered the way they are worth working, open cases
 * first, most severe first, oldest first. Finished cases sink rather than disappear, because
 * yesterday's closure has to stay findable and a list that quietly drops rows is not trusted.
 */
const Page = () => {
  const tenant = useSettings().currentTenant
  const queryKey = `PSITSocCases-${tenant}`

  const casesRequest = ApiGetCall({
    url: `/api/PSITListSocCases?tenantFilter=${tenant}`,
    queryKey,
    waiting: Boolean(tenant),
  })
  // The reassignment picker and the name beside each avatar: the portal's own users, fetched
  // once for all rows. When Graph is out the endpoint degrades to email-only entries and says
  // so in Warnings; the queue keeps working either way.
  const analystsRequest = ApiGetCall({
    url: '/api/PSITListSocAnalysts',
    queryKey: 'PSITSocAnalysts',
    staleTime: 5 * 60 * 1000,
  })
  const analysts = useMemo(
    () => (Array.isArray(analystsRequest.data?.Analysts) ? analystsRequest.data.Analysts : []),
    [analystsRequest.data]
  )
  const analystNames = useMemo(() => {
    const names = {}
    for (const analyst of analysts) {
      if (analyst?.userPrincipalName) {
        names[analyst.userPrincipalName.toLowerCase()] = analyst.displayName || ''
      }
    }
    return names
  }, [analysts])
  const analystOptions = useMemo(
    () =>
      analysts.map((analyst) => ({
        // Name and email both in the label: typing either finds the person.
        label: analyst.displayName
          ? analyst.displayName + ' (' + analyst.userPrincipalName + ')'
          : analyst.userPrincipalName,
        value: analyst.userPrincipalName,
      })),
    [analysts]
  )

  // The endpoint answers with a bare array on success and { Results: '<message>' } on failure.
  // The first version of this read data.Results for both, which emptied the queue while the
  // cases sat untouched in the store: zero counts, no columns, no error - the worst kind of wrong.
  const failed = typeof casesRequest.data?.Results === 'string' || casesRequest.isError
  const cases = useMemo(
    () => (Array.isArray(casesRequest.data) ? casesRequest.data : []),
    [casesRequest.data]
  )
  // The derived readings are baked onto the rows rather than computed in a column accessor. It
  // is the pattern the rest of the portal uses, and it costs nothing to gain search, sort and
  // export on them: an analyst can look for "Voyage impossible" instead of remembering it is 2.
  const rows = useMemo(
    () =>
      psitSocQueueOrder(cases).map((row) => ({
        ...row,
        // The visible columns bake under French keys, so the headers read in the analysts'
        // language without touching the global translation table upstream pages share. The raw
        // fields stay on the row: the actions, the drawer and the API contract keep them.
        Client: row?.Tenant,
        // The emitter's own severity words when the case carries them, our P level otherwise.
        // Ordering already ran on our P level above.
        'Sévérité': psitSocDisplaySeverity(row),
        // An object when the address travelled with the case, a plain string otherwise: the
        // formatter shows the number either way, plus the launch icon when there is a door.
        'Ticket Autotask': row?.TicketUrl
          ? { label: row?.ExternalRef, href: row.TicketUrl }
          : row?.ExternalRef,
        Statut: psitSocStatusLabel(row?.Status),
        'Âge': psitSocAge(row?.CreatedUtc)?.label ?? '',
        // Photo and name rather than a bare address; the email is what the record stores, the
        // name is resolved from the portal's user list above.
        'Assigné à': row?.AssignedTo
          ? { upn: row.AssignedTo, name: analystNames[row.AssignedTo.toLowerCase()] || '' }
          : '',
        Titre: row?.Title,
        'Catégorie': psitSocTypeLabel(row?.TypeId),
        Guide: psitSocGuideProgress(row)?.label ?? '',
      })),
    [cases, analystNames]
  )
  const summary = useMemo(() => psitSocQueueSummary(cases), [cases])

  // Grouped the way the gestures are reached for: look first, then who holds the case, then
  // the case's own lifecycle in the order it travels it, then fixing the record, and destruction
  // last where it cannot be picked by reflex.
  const actions = [
    // -- Consult --
    {
      label: 'Ouvrir le cas',
      type: 'GET',
      icon: <MagnifyingGlassIcon />,
      link: '/security/soc/case?caseId=[CaseId]&tenantFilter=[Tenant]',
      multiPost: false,
    },
    // -- Assignment: who holds the case --
    {
      label: 'Prendre en charge',
      type: 'POST',
      icon: <PlayArrow />,
      url: '/api/PSITExecSocCase',
      data: {
        CaseId: 'CaseId',
        tenantFilter: 'Tenant',
        Status: '!investigating',
        // The server assigns the case to the caller. A name sent from here could be anyone's.
        TakeOwnership: '!true',
      },
      confirmText: 'Prendre ce cas et le passer en investigation ?',
      relatedQueryKeys: [queryKey],
    },
    {
      label: 'Réattribuer',
      type: 'POST',
      icon: <SwapHoriz />,
      url: '/api/PSITExecSocCase',
      data: { CaseId: 'CaseId', tenantFilter: 'Tenant' },
      fields: [
        {
          type: 'autoComplete',
          name: 'AssignedTo',
          label: 'Analyste (tapez un nom ou un e-mail)',
          multiple: false,
          // The portal's own users; typing filters on name and email alike. creatable keeps a
          // door open for an address the list does not know (Graph out, someone new).
          creatable: true,
          options: analystOptions,
          validators: { required: 'Choisissez un analyste — « Libérer » rend le cas à la file' },
        },
      ],
      confirmText: 'Réattribuer ce cas ?',
      relatedQueryKeys: [queryKey],
    },
    {
      label: 'Libérer (rendre à la file)',
      type: 'POST',
      icon: <PersonRemove />,
      url: '/api/PSITExecSocCase',
      // '!' marks a literal: an empty AssignedTo is the release gesture server-side, where an
      // absent one means "leave it".
      data: { CaseId: 'CaseId', tenantFilter: 'Tenant', AssignedTo: '!' },
      confirmText: 'Rendre ce cas à la file ? Il redevient à prendre ; son avancement reste.',
      relatedQueryKeys: [queryKey],
    },
    // -- Lifecycle, in the order a case travels it --
    {
      label: 'Qualifier faux positif',
      type: 'POST',
      icon: <GppGood />,
      url: '/api/PSITExecSocCase',
      data: {
        CaseId: 'CaseId',
        tenantFilter: 'Tenant',
        Verdict: '!false-positive',
      },
      fields: [
        {
          type: 'textField',
          name: 'Justification',
          label: 'Justification (qui a confirmé, comment)',
          multiline: true,
          rows: 3,
          validators: { required: 'Un faux positif sans justification est une supposition' },
        },
      ],
      confirmText: 'Qualifier ce cas en faux positif ?',
      relatedQueryKeys: [queryKey],
    },
    {
      label: 'Qualifier vrai positif',
      type: 'POST',
      icon: <Block />,
      url: '/api/PSITExecSocCase',
      data: {
        CaseId: 'CaseId',
        tenantFilter: 'Tenant',
        Verdict: '!true-positive',
      },
      fields: [
        {
          type: 'textField',
          name: 'Justification',
          label: 'Justification (éléments retenus)',
          multiline: true,
          rows: 3,
        },
      ],
      confirmText: 'Qualifier ce cas en vrai positif ?',
      relatedQueryKeys: [queryKey],
    },
    {
      label: 'Marquer confiné',
      type: 'POST',
      icon: <Done />,
      url: '/api/PSITExecSocCase',
      data: {
        CaseId: 'CaseId',
        tenantFilter: 'Tenant',
        Status: '!contained',
      },
      confirmText: 'Marquer ce cas comme confiné ?',
      relatedQueryKeys: [queryKey],
    },
    {
      label: 'Clore le cas',
      type: 'POST',
      icon: <Done />,
      url: '/api/PSITExecSocCase',
      data: {
        CaseId: 'CaseId',
        tenantFilter: 'Tenant',
        Status: '!closed',
      },
      confirmText: 'Clore ce cas ? La clôture est horodatée à votre nom.',
      relatedQueryKeys: [queryKey],
    },
    {
      label: 'Rouvrir le cas',
      type: 'POST',
      icon: <LockOpen />,
      url: '/api/PSITExecSocCase',
      data: {
        CaseId: 'CaseId',
        tenantFilter: 'Tenant',
        Status: '!investigating',
      },
      confirmText:
        'Rouvrir ce cas ? Les horodatages de clôture sont effacés et la réouverture est journalisée.',
      relatedQueryKeys: [queryKey],
    },
    // -- Fixing the record: the case stays, its file changes --
    {
      // The catch-all guide tells the analyst to correct the type; this is the control that
      // does it. Correcting swaps the investigation guide, it erases nothing: progress and
      // journal stay on the case.
      label: 'Corriger le type',
      type: 'POST',
      icon: <Edit />,
      url: '/api/PSITExecSocCase',
      data: { CaseId: 'CaseId', tenantFilter: 'Tenant' },
      fields: [
        {
          type: 'autoComplete',
          name: 'TypeId',
          label: 'Type d’alerte',
          multiple: false,
          creatable: false,
          options: PSIT_SOC_TYPE_OPTIONS,
          validators: { required: 'Le type d’alerte est requis' },
        },
      ],
      confirmText:
        'Corriger le type de ce cas ? Le guide d’investigation correspondant remplace l’actuel ; le journal et l’avancement restent.',
      relatedQueryKeys: [queryKey],
    },
    {
      // The other half of the same control: the P level orders the queue, so a case the
      // emitter left unranked can be ranked by the analyst who read it. The displayed word
      // stays whatever tag the case carries; an empty field keeps the existing value.
      label: 'Corriger la sévérité',
      type: 'POST',
      icon: <Edit />,
      url: '/api/PSITExecSocCase',
      data: { CaseId: 'CaseId', tenantFilter: 'Tenant' },
      fields: [
        {
          type: 'autoComplete',
          name: 'Severity',
          label: 'Niveau (P1 = le plus urgent)',
          multiple: false,
          creatable: false,
          options: [
            { label: 'P1', value: 'P1' },
            { label: 'P2', value: 'P2' },
            { label: 'P3', value: 'P3' },
            { label: 'P4', value: 'P4' },
          ],
          validators: { required: 'Le niveau est requis' },
        },
        {
          type: 'textField',
          name: 'SeverityTag',
          label: 'Mot affiché (facultatif, ex. High Priority — vide : inchangé)',
        },
      ],
      confirmText:
        'Corriger la sévérité de ce cas ? Le niveau P ordonne la file ; le mot affiché ne change que si vous en saisissez un.',
      relatedQueryKeys: [queryKey],
    },
    // -- Destructive, last --
    {
      // Server-side the endpoint is SuperAdmin.ReadWrite: anyone else gets a refusal, not a
      // deletion. Closing keeps the journal; this removes it, and is for tests and mistakes.
      label: 'Supprimer le cas (super admin)',
      type: 'POST',
      icon: <Delete />,
      url: '/api/PSITExecSocCaseRemove',
      data: { CaseId: 'CaseId', tenantFilter: 'Tenant' },
      confirmText:
        'Supprimer définitivement ce cas ? Son journal disparaît avec lui. Un cas terminé se clôt, il ne se supprime pas : la suppression est pour les enregistrements de test et les erreurs.',
      relatedQueryKeys: [queryKey],
    },
  ]


  const offCanvas = {
    extendedInfoFields: [
      'CaseId',
      'Tenant',
      'Source',
      'TypeId',
      'Severity',
      'Status',
      'AssignedTo',
      'Title',
      'ExternalRef',
      'TicketRef',
      'TicketUrl',
      'SeverityTag',
      'CreatedUtc',
      'CreatedBy',
      'UpdatedUtc',
      'UpdatedBy',
      'ClosedUtc',
      'ClosedBy',
    ],
    actions: actions,
  }

  const simpleColumns = [
    'Client',
    'Sévérité',
    'Ticket Autotask',
    'Statut',
    'Âge',
    'Assigné à',
    'Titre',
    'Catégorie',
    'Guide',
  ]

  // The presets filter on the displayed column, so their values are the displayed words.
  const filterList = [
    { filterName: 'Nouveaux', value: [{ id: 'Statut', value: 'Nouveau' }], type: 'column' },
    { filterName: 'En cours', value: [{ id: 'Statut', value: 'En cours' }], type: 'column' },
    {
      filterName: 'Qualifiés vrais positifs',
      value: [{ id: 'Statut', value: 'Vrai positif' }],
      type: 'column',
    },
    {
      filterName: 'Qualifiés faux positifs',
      value: [{ id: 'Statut', value: 'Faux positif' }],
      type: 'column',
    },
    { filterName: 'Confinés', value: [{ id: 'Statut', value: 'Confiné' }], type: 'column' },
    { filterName: 'Clos', value: [{ id: 'Statut', value: 'Clos' }], type: 'column' },
  ]

  return (
    <>
      <CippHead title="Triage SOC" />
      <Container maxWidth={false} sx={{ py: 2 }}>
        <Stack spacing={2}>
          <PsitSocWipBanner />
          {failed && (
            <Alert severity="error">
              La file n’a pas pu être lue. Rien n’est affiché plutôt qu’une liste vide, qui se
              lirait comme « aucun cas en attente ».
            </Alert>
          )}

          {!failed && (
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Chip
                color={summary.counts.new > 0 ? 'error' : 'default'}
                label={`${summary.counts.new ?? 0} à prendre`}
              />
              <Chip
                color={summary.counts.investigating > 0 ? 'warning' : 'default'}
                label={`${summary.counts.investigating ?? 0} en cours`}
              />
              <Chip label={`${summary.counts.contained ?? 0} confinés`} />
              <Typography variant="body2" color="text.secondary">
                {summary.oldestUntaken
                  ? `Le plus ancien non pris : ${summary.oldestUntaken.row.CaseId}, il y a ${summary.oldestUntaken.age.label}.`
                  : 'Aucun cas en attente de prise en charge.'}
              </Typography>
            </Stack>
          )}

          <CippDataTable
            title="Triage SOC"
            data={failed ? [] : rows}
            isFetching={casesRequest.isFetching && !failed}
            cardButton={
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <PsitSocCaseDrawer relatedQueryKeys={[queryKey]} />
                <PsitSocImportDrawer source="xdr" relatedQueryKeys={[queryKey]} />
                <PsitSocImportDrawer source="mdo" relatedQueryKeys={[queryKey]} />
              </Stack>
            }
            actions={actions}
            // The rework feeds the table its rows as a prop, which left the toolbar refresh icon
            // spinning a query that does not exist. Cases now arrive from outside the page - the
            // webhook, a colleague - and the cache holds five minutes, so the icon has to work.
            refreshFunction={() => casesRequest.refetch()}
            offCanvas={offCanvas}
            simpleColumns={simpleColumns}
            filters={filterList}
            simple={false}
          />
        </Stack>
      </Container>
    </>
  )
}

Page.getLayout = (page) => <DashboardLayout>{page}</DashboardLayout>

export default Page
