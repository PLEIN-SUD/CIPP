import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  Stack,
  Typography,
  Tooltip,
} from '@mui/material'
import { CheckCircle, RadioButtonUnchecked } from '@mui/icons-material'
import { ApiPostCall } from '../../../api/ApiCall'
import { CippApiResults } from '../../CippComponents/CippApiResults'
import { psitSocRestoreItems } from '../../../utils/psit-soc-restore'

/**
 * What remains to give back after a remediation on a dossier that turned out benign.
 *
 * The list is derived from the journal (each remediation action contributes its restore items)
 * and marking an item done writes the restoration to the same journal - so the fiche BEC, the
 * time entry and the reports read one trail. It renders nothing on a true positive: there is
 * nothing to give back to an attacker.
 */
export const PsitSocRestoreChecklist = ({ socCase, queryKey }) => {
  const items = psitSocRestoreItems(socCase)
  const journal = ApiPostCall({ relatedQueryKeys: queryKey ? [queryKey] : [] })

  if (items.length === 0) return null

  const remaining = items.filter((item) => !item.done)

  const markRestored = (item) => {
    journal.mutate({
      url: '/api/PSITExecSocCase',
      data: {
        tenantFilter: socCase.Tenant,
        CaseId: socCase.CaseId,
        LogAction: { Action: 'restored', Detail: item.sentence },
      },
    })
  }

  return (
    <Card variant="outlined">
      <CardHeader
        title="Restauration"
        subheader="Ce que la remédiation a coupé sur un compte finalement légitime"
      />
      <CardContent>
        <Stack spacing={1}>
          {remaining.length === 0 ? (
            <Alert severity="success">Tout a été rendu au titulaire, et c’est au journal.</Alert>
          ) : (
            <Alert severity="warning">
              {`${remaining.length} restauration${remaining.length > 1 ? 's' : ''} à faire : le titulaire est encore privé d’une partie de ses accès.`}
            </Alert>
          )}
          {items.map((item) => (
            <Stack key={item.key} direction="row" spacing={1} alignItems="center">
              {item.done ? (
                <CheckCircle color="success" fontSize="small" />
              ) : (
                <RadioButtonUnchecked color="disabled" fontSize="small" />
              )}
              <Typography
                variant="body2"
                sx={{ flexGrow: 1 }}
                color={item.done ? 'text.secondary' : 'text.primary'}
              >
                {item.sentence}
              </Typography>
              {!item.done && (
                <Tooltip describeChild title="Consigner la restauration : inscrit au journal que cet accès a été rendu — le geste lui-même se fait dans l'écran concerné (fiche du compte, panneau machine)">
                  <span>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={journal.isPending}
                      onClick={() => markRestored(item)}
                    >
                      Consigner la restauration
                    </Button>
                  </span>
                </Tooltip>
              )}
            </Stack>
          ))}
          {/* The gesture itself happens where it belongs (vue upstream de l'utilisateur, panneau
              machine...) ; this journals it so the dossier can attest who gave what back, when. */}
          <CippApiResults apiObject={journal} errorsOnly />
        </Stack>
      </CardContent>
    </Card>
  )
}
