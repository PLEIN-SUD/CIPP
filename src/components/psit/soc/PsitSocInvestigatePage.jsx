import { useMemo } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { Alert, Button, Card, CardContent, Container, Stack, SvgIcon, Typography } from '@mui/material'
import { ArrowBack, PlaylistAdd } from '@mui/icons-material'
import { useForm, useWatch } from 'react-hook-form'
import { ApiPostCall } from '../../../api/ApiCall'
import { CippHead } from '../../CippComponents/CippHead'
import { CippFormTenantSelector } from '../../CippComponents/CippFormTenantSelector'
import { useSettings } from '../../../hooks/use-settings'
import { PsitSocWipBanner } from './PsitSocWipBanner'
import { PsitSocInvestigateNav } from './PsitSocInvestigateNav'

/**
 * The scaffold the three entity investigations share: pick a tenant and an entity, read the
 * evidence, and open a case if what you read warrants one.
 *
 * These screens are directed consultation, and deliberately less than the BEC: no verdict engine
 * stands behind an application or a machine, so nothing here pretends to conclude. Looking asks
 * for no case - a client calling about a strange consent is an investigation before it is an
 * incident - but acting does: the context panels show their evidence and keep their containment
 * actions for the case view, where each gesture lands in a journal. The one exit is the button
 * below, and it is manual precisely because no computed verdict exists to condition it on.
 */
export const PsitSocInvestigatePage = ({
  title,
  intro,
  pickerFields,
  hasTarget,
  buildQuery,
  renderPanel,
  buildCase,
}) => {
  const router = useRouter()
  const currentTenant = useSettings().currentTenant
  const formControl = useForm({ mode: 'onChange' })
  const picked = useWatch({ control: formControl.control })
  const query = router.query
  // Opened from a dossier's panel, the link carries its id so the way back exists. Without
  // reading it, the three entity screens offered to open a SECOND dossier on an entity that
  // already had one, and the promised return was a link to the queue.
  const caseId = query.caseId

  const target = hasTarget(query)
  const pseudoCase = useMemo(
    () => (target ? { Tenant: query.tenantFilter, Entities: buildQuery(query).entities } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [target, query]
  )

  const creation = ApiPostCall({ relatedQueryKeys: [`PSITSocCases-${query.tenantFilter}`] })
  const openCase = () => {
    const definition = buildCase(query)
    creation.mutate(
      { url: '/api/PSITExecSocCase', data: { tenantFilter: query.tenantFilter, ...definition } },
      {
        onSuccess: (response) => {
          const created = response?.data?.Case?.CaseId
          if (created) {
            // Acting happens on the case, where the same panel carries its actions and a journal.
            router.push(`/security/soc/case?caseId=${created}&tenantFilter=${query.tenantFilter}`)
          }
        },
      }
    )
  }

  return (
    <>
      <CippHead title={title} />
      <Container maxWidth={false} sx={{ py: 2 }}>
        <Stack spacing={2}>
          <PsitSocWipBanner />
          <PsitSocInvestigateNav />
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <Button
              component={Link}
              href={
                caseId
                  ? `/security/soc/case?caseId=${caseId}&tenantFilter=${query.tenantFilter}`
                  : '/security/soc/queue'
              }
              startIcon={
                <SvgIcon fontSize="small">
                  <ArrowBack />
                </SvgIcon>
              }
            >
              {caseId ? 'Retour au dossier' : 'File d’attente'}
            </Button>
            <Typography variant="h5">{title}</Typography>
          </Stack>

          {!target ? (
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={2}>
                  <Typography variant="body2" color="text.secondary">
                    {intro}
                  </Typography>
                  <CippFormTenantSelector
                    formControl={formControl}
                    name="tenantFilter"
                    label="Client"
                    allTenants={false}
                    type="single"
                    multiple={false}
                    preselectedEnabled={Boolean(currentTenant && currentTenant !== 'AllTenants')}
                  />
                  {pickerFields(formControl, picked)}
                  <Button
                    variant="contained"
                    disabled={!buildQuery(pickedToQuery(picked))}
                    onClick={() => {
                      const built = buildQuery(pickedToQuery(picked))
                      router.push(`${router.pathname}?${new URLSearchParams(built.params)}`)
                    }}
                  >
                    Consulter
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          ) : (
            <>
              <Alert severity="info">
                {caseId
                  ? 'Vue plein écran, ouverte depuis un dossier : les preuves s’affichent ici, les actions restent sur le dossier, où chaque geste laisse sa trace au journal.'
                  : 'Consultation hors dossier : les preuves s’affichent, les actions attendent un dossier. Ouvrir le dossier transporte l’entité et rend les gestes traçables.'}
              </Alert>
              {renderPanel(pseudoCase)}
              {/* Opened from a dossier, this entity already has one: offering to open a second
                  would split one investigation across two records. */}
              {!caseId && (
                <div>
                  <Button
                    variant="contained"
                    startIcon={<PlaylistAdd />}
                    disabled={creation.isPending}
                    onClick={openCase}
                  >
                    Ouvrir un dossier depuis cette investigation
                  </Button>
                  {creation.isError && (
                    <Typography variant="body2" color="error.main" sx={{ mt: 1 }}>
                      {creation.error?.response?.data?.Results ??
                        creation.error?.message ??
                        'Échec.'}
                    </Typography>
                  )}
                </div>
              )}
            </>
          )}
        </Stack>
      </Container>
    </>
  )
}

/** Form values arrive as autocomplete objects; the query wants their plain values. */
const pickedToQuery = (picked = {}) => {
  const out = {}
  for (const [key, value] of Object.entries(picked)) {
    out[key] = value?.value ?? value
    if (value?.addedFields) {
      for (const [added, addedValue] of Object.entries(value.addedFields)) out[added] = addedValue
    }
  }
  return out
}
