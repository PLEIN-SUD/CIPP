import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material'
import { GppMaybe } from '@mui/icons-material'
import { ApiPostCall } from '../../../api/ApiCall'
import { CippApiResults } from '../../CippComponents/CippApiResults'

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
  const userId = socCase?.Entities?.userId
  const aadDeviceId = socCase?.Entities?.azureADDeviceId

  // Qualified, contained or closed dossiers have their response tab; the hatch is for the open
  // question. No target entity, no hatch.
  if (!socCase?.CaseId || socCase?.Qualification?.Verdict) return null
  if (['contained', 'closed'].includes(socCase?.Status)) return null
  if (!upn && !aadDeviceId) return null

  const isUser = Boolean(upn)

  const run = () => {
    setOpen(false)
    const payload = isUser
      ? {
          url: '/api/execBecRemediate',
          data: { tenantFilter: tenant, userId, username: upn },
        }
      : {
          url: '/api/PSITExecMdeIsolation',
          data: {
            tenantFilter: tenant,
            AzureADDeviceId: aadDeviceId,
            Comment: 'Confinement d’urgence avant verdict (dossier SOC)',
            CaseId: socCase.CaseId,
          },
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
              Action: isUser ? 'remediate-user' : 'mde-isolate',
              Detail: `Mesure conservatoire avant verdict : ${
                isUser
                  ? `remédiation CIPP exécutée pour ${upn} (connexion bloquée, mot de passe réinitialisé, sessions révoquées, méthodes MFA retirées, règles de boîte désactivées, partage OneDrive désactivé)`
                  : 'poste isolé du réseau (MDE)'
              }`,
            },
          },
        })
      },
    })
  }

  return (
    <>
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
            Confiner
          </Button>
        </DialogActions>
      </Dialog>
      <CippApiResults apiObject={action} />
      <CippApiResults apiObject={journal} errorsOnly />
    </>
  )
}
