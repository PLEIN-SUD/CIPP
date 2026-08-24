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
          LogAction: { Action: action.trim(), Detail: detail.trim() },
        },
      },
      {
        onSuccess: () => {
          setAction('')
          setDetail('')
        },
      }
    )
  }

  return (
    <Card variant="outlined">
      <CardHeader title="Action log" subheader="System entries and actions declared by analysts" />
      <CardContent>
        <Stack spacing={1} sx={{ mb: 2 }}>
          <TextField
            size="small"
            label="Action taken outside CIPP"
            value={action}
            onChange={(event) => setAction(event.target.value)}
          />
          <TextField
            size="small"
            label="Detail (where, on what)"
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
          />
          <Button
            variant="outlined"
            disabled={!action.trim() || logWrite.isPending}
            onClick={handleRecord}
          >
            {logWrite.isPending ? 'Recording...' : 'Record action'}
          </Button>
          <CippApiResults apiObject={logWrite} />
        </Stack>

        <Divider sx={{ mb: 1 }} />
        <Stack spacing={1}>
          {entries.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Nothing recorded yet.
            </Typography>
          )}
          {entries.map((entry, index) => (
            <Stack key={index}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {entry.Action}
                {entry.Detail ? `: ${entry.Detail}` : ''}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {entry.Utc} • {entry.Analyst}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </CardContent>
    </Card>
  )
}
