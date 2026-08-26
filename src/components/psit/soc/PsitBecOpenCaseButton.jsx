import { Alert, Button, Stack, Typography } from '@mui/material'
import { useRouter } from 'next/router'
import { PlaylistAdd } from '@mui/icons-material'
import { ApiPostCall } from '../../../api/ApiCall'
import {
  buildSignals,
  buildVerdict,
  partitionDeterminations,
  VERDICT_STATUS,
} from '../../../utils/psit-bec-signals'
import { psitAsArray } from '../../../utils/psit-as-array'

/**
 * The way out of an investigation that concluded outside any case.
 *
 * Opening the BEC screen without a case is legitimate: a client calling about a strange mailbox
 * is an investigation before it is an incident. But a compromise retained on that path used to
 * end nowhere: the verdict lived in the BEC record and the work queue never heard of it, which is
 * exactly the invisible work the registry exists to prevent.
 *
 * So: no case demanded at the door, no retained compromise without a case at the exit. The button
 * appears only in that gap - investigation opened caseless, verdict compromised - and creates the
 * case with the mailbox as its entity. ExternalRef carries a key derived from the investigation,
 * which is what makes a double click land on the same case instead of two.
 */
export const PsitBecOpenCaseButton = ({ userData, becData, tenantFilter, triage, caseId }) => {
  const router = useRouter()
  const creation = ApiPostCall({ relatedQueryKeys: [`PSITSocCases-${tenantFilter}`] })

  if (caseId || !userData || !becData || becData.Waiting) return null

  const signals = buildSignals(becData, userData)
  const { current } = partitionDeterminations(psitAsArray(triage), becData)
  const verdict = buildVerdict(signals, current)
  if (verdict.status !== VERDICT_STATUS.COMPROMISED) return null

  const openCase = () => {
    creation.mutate(
      {
        url: '/api/PSITExecSocCase',
        data: {
          tenantFilter,
          Source: 'manual',
          // Type 2 is the catalogue's confirmed-compromise entry (impossible travel family),
          // which is what a retained BEC verdict is. The analyst corrects it on the case if the
          // compromise came in another way.
          TypeId: 2,
          Title: `Compromission BEC : ${userData.userPrincipalName}`,
          Entities: { userId: userData.id, upn: userData.userPrincipalName },
          ExternalRef: `BEC:${tenantFilter}:${userData.id}`,
          LogAction: {
            Action: 'bec-import',
            Detail: `Cas ouvert depuis l'investigation BEC de ${userData.userPrincipalName} : ${verdict.label}.`,
          },
        },
      },
      {
        onSuccess: (response) => {
          const created = response?.data?.Case?.CaseId
          if (created) {
            // The page re-opens attached to its case: the back-to-case button appears, and the
            // case's own view links back here.
            router.replace(
              `/security/soc/bec?userId=${userData.id}&tenantFilter=${tenantFilter}&caseId=${created}`
            )
          }
        },
      }
    )
  }

  return (
    <Alert severity="warning">
      <Stack spacing={1} alignItems="flex-start">
        <Typography variant="body2">
          Compromission retenue, et cette investigation a été ouverte sans cas : le verdict
          n’existe encore dans aucune file de travail.
        </Typography>
        <Button
          size="small"
          variant="contained"
          startIcon={<PlaylistAdd />}
          disabled={creation.isPending}
          onClick={openCase}
        >
          Ouvrir un cas depuis cette investigation
        </Button>
        {creation.isError && (
          <Typography variant="body2" color="error.main">
            {creation.error?.response?.data?.Results ?? creation.error?.message ?? 'Échec.'}
          </Typography>
        )}
      </Stack>
    </Alert>
  )
}
