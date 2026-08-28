import { useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { ApiPostCall } from '../../../api/ApiCall'
import { CippApiResults } from '../../CippComponents/CippApiResults'
import CippInfoTooltip from '../../CippComponents/CippInfoTooltip'

/**
 * The case's action log: everything that happened, newest first - system entries (created,
 * qualified, status changes) and analyst-declared entries for actions taken outside CIPP (an
 * isolation clicked in the Defender portal, a client called). The declared entries are what
 * makes the case tell the whole story: an incident is never handled entirely inside one tool,
 * and an unrecorded action is an action nobody can attest later.
 */
export const PsitSocActionLog = ({ socCase, queryKey }) => {
  const [action, setAction] = useState('')
  const [detail, setDetail] = useState('')
  // When the gesture actually happened, when that differs from now: a mail sent this morning and
  // logged after lunch are two facts, and the journal keeps both.
  const [occurredUtc, setOccurredUtc] = useState('')

  const logWrite = ApiPostCall({ relatedQueryKeys: queryKey ? [queryKey] : [] })

  const entries = [...(socCase?.ActionLog ?? [])].sort((a, b) =>
    String(b?.Utc ?? '').localeCompare(String(a?.Utc ?? ''))
  )

  const handleRecord = () => {
    if (!action.trim()) return
    logWrite.mutate(
      {
        url: '/api/PSITExecSocCase',
        data: {
          tenantFilter: socCase.Tenant,
          CaseId: socCase.CaseId,
          LogAction: {
            Action: action.trim(),
            Detail: detail.trim(),
            ...(occurredUtc.trim() ? { OccurredUtc: occurredUtc.trim() } : {}),
          },
        },
      },
      {
        onSuccess: () => {
          setAction('')
          setDetail('')
          setOccurredUtc('')
        },
      }
    )
  }

  return (
    <Card variant="outlined">
      <CardHeader
        title={
          <Stack direction="row" spacing={1} alignItems="center">
            <span>Journal des actions</span>
            <CippInfoTooltip title="La trace du signalement : chaque geste (prise en charge, qualification, changement de statut, correction) s'inscrit ici automatiquement, avec l'auteur et l'heure. Les gestes faits hors de CIPP - un appel au client, une action dans une autre console - se consignent avec le formulaire ci-dessous, en précisant quand ils ont réellement eu lieu. C'est ce qui permet d'attester plus tard qui a fait quoi, et quand." />
          </Stack>
        }
        subheader="Entrées système et actions déclarées par les analystes"
      />
      <CardContent>
        <Stack spacing={1} sx={{ mb: 2 }}>
          <TextField
            size="small"
            label="Action menée hors de CIPP"
            value={action}
            onChange={(event) => setAction(event.target.value)}
          />
          <TextField
            size="small"
            label="Détail (où, sur quoi)"
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
          />
          <TextField
            size="small"
            fullWidth
            label="Quand (optionnel, ex. 2026-08-27T09:12)"
            helperText="L’heure réelle du geste, si elle diffère du moment où il est consigné. Refusée si illisible ou dans le futur."
            value={occurredUtc}
            onChange={(event) => setOccurredUtc(event.target.value)}
          />
          <Button
            variant="outlined"
            disabled={!action.trim() || logWrite.isPending}
            onClick={handleRecord}
          >
            {logWrite.isPending ? 'Enregistrement...' : 'Consigner l’action'}
          </Button>
          <CippApiResults apiObject={logWrite} />
        </Stack>

        <Divider sx={{ mb: 1 }} />
        <Stack spacing={1}>
          {entries.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Rien de consigné pour l’instant.
            </Typography>
          )}
          {entries.map((entry, index) => (
            <Stack key={index}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {entry.Action}
                {entry.Detail ? `: ${entry.Detail}` : ''}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {entry.OccurredUtc
                  ? `fait le ${entry.OccurredUtc} • consigné le ${entry.Utc} • ${entry.Analyst}`
                  : `${entry.Utc} • ${entry.Analyst}`}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </CardContent>
    </Card>
  )
}
