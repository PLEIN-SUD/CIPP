import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
  Tooltip,
} from '@mui/material'
import { GppMaybe } from '@mui/icons-material'
import { ApiPostCall } from '../../../api/ApiCall'
import { CippApiResults } from '../../CippComponents/CippApiResults'
import { psitSocRemediationPlan } from '../../../utils/psit-soc-remediation'

/**
 * The escape hatch of the gated frame: an active compromise cannot wait five tabs.
 *
 * Always visible in the dossier header while the dossier is open and unqualified; runs the same
 * gestures as the Réponse tab (CIPP's Remediate User for an account, MDE isolation for a
 * machine) but journals them as a conservatory measure taken BEFORE any verdict - which is
 * exactly what they are, and what the restore checklist and the reports will read back if the
 * dossier turns out benign.
 */
export const PsitSocEmergencyContainment = ({ socCase, queryKey }) => {
  const [open, setOpen] = useState(false)
  const action = ApiPostCall({ relatedQueryKeys: queryKey ? [queryKey] : [] })
  const journal = ApiPostCall({ relatedQueryKeys: queryKey ? [queryKey] : [] })

  const tenant = socCase?.Tenant
  const upn = socCase?.Entities?.upn

  // One shared definition of 'remediate this dossier' with the confirmed-TP shortcut: the
  // payload, the journal action and the detail line can never drift between the two paths.
  const plan = psitSocRemediationPlan(socCase)

  // Qualified, contained or closed dossiers have their response tab; the hatch is for the open
  // question. No target entity, no hatch.
  if (!socCase?.CaseId || socCase?.Qualification?.Verdict) return null
  if (['contained', 'closed'].includes(socCase?.Status)) return null
  if (!plan.available) return null

  const isUser = plan.kind === 'user'

  const run = () => {
    setOpen(false)
    const payload = isUser
      ? plan.payload
      : {
          ...plan.payload,
          data: { ...plan.payload.data, Comment: 'Confinement d’urgence avant verdict (dossier SOC)' },
        }
    action.mutate(payload, {
      onSuccess: () => {
        journal.mutate({
          url: '/api/PSITExecSocCase',
          data: {
            tenantFilter: tenant,
            CaseId: socCase.CaseId,
            Status: 'contained',
            LogAction: {
              Action: plan.journalAction,
              Detail: plan.journalDetail('Mesure conservatoire avant verdict'),
            },
          },
        })
      },
    })
  }

  return (
    <>
      <Tooltip
        describeChild
        title={
          isUser
            ? 'Confinement d’urgence : exécute la remédiation CIPP complète du compte (mot de passe, blocage, sessions, MFA, règles, partage) sans attendre le verdict — une confirmation détaille tout avant'
            : 'Confinement d’urgence : isole le poste du réseau via MDE sans attendre le verdict — une confirmation détaille tout avant'
        }
      >
        <span>
          <Button
            size="small"
            variant="contained"
            color="error"
            startIcon={<GppMaybe />}
            disabled={action.isPending}
            onClick={() => setOpen(true)}
          >
            Confinement d’urgence
          </Button>
        </span>
      </Tooltip>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{isUser ? `Confiner ${upn} maintenant ?` : 'Isoler le poste maintenant ?'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {isUser
              ? 'Exécute la remédiation CIPP complète (mot de passe, blocage, sessions, MFA, règles de boîte, partage OneDrive) sans attendre le verdict.'
              : 'Isole le poste du réseau via MDE sans attendre le verdict.'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Le geste est journalisé comme mesure conservatoire, le dossier passe « Confiné », et
            l’investigation continue. Si le dossier finit bénin, la liste de restauration dira ce
            qui est à rendre.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Annuler</Button>
          <Button variant="contained" color="error" onClick={run}>
            {isUser ? 'Confiner le compte' : 'Isoler le poste'}
          </Button>
        </DialogActions>
      </Dialog>
      <CippApiResults apiObject={action} />
      <CippApiResults apiObject={journal} errorsOnly />
    </>
  )
}
