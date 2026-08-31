import { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import Link from 'next/link'
import { ApiGetCall, ApiPostCall } from '../../../api/ApiCall'
import { CippApiResults } from '../../CippComponents/CippApiResults'
import { groupSignInsByIp } from '../../../utils/psit-bec-signals'
import { adaptGraphSignIns, readSignInGroup } from '../../../utils/psit-soc-signin-adapter'
import { PsitSocLoading } from './PsitSocLoading'
import { PsitAdminBadge } from './PsitAdminBadge'

/**
 * The identity-side context of a case that names a user: how the account signed in (grouped by
 * address, coloured for the analyst), the MFA methods on it, and the inbox rules. Plus the
 * graduated identity actions, from the least to the most disruptive, each on confirmation.
 *
 * The sign-in reading reuses the BEC grouping (groupSignInsByIp) through an adapter, so the
 * "impossible travel / spray that succeeded / legacy client" judgement is the exact one the BEC
 * dossier makes, not a second implementation that could drift from it.
 */
export const PsitSocUserContext = ({ socCase, queryKey, hideActions = false }) => {
  const tenant = socCase?.Tenant
  const upn = socCase?.Entities?.upn
  const userId = socCase?.Entities?.userId

  // The sign-in log is keyed by object id. When the case only carries a UPN (the quick-entry
  // path), resolve the id first; when it carries the id (adopted incidents often do), skip the
  // lookup.
  const userLookup = ApiGetCall({
    url: `/api/ListUsers?tenantFilter=${tenant}&graphFilter=userPrincipalName eq '${upn}'`,
    queryKey: `PSITSocUser-${tenant}-${upn}`,
    waiting: Boolean(tenant && upn && !userId),
  })
  const resolvedUser = Array.isArray(userLookup.data) ? userLookup.data[0] : userLookup.data
  const effectiveUserId = userId || resolvedUser?.id
  const usageLocation = resolvedUser?.usageLocation || null

  const signInsRequest = ApiGetCall({
    url: `/api/ListUserSigninLogs?tenantFilter=${tenant}&UserID=${effectiveUserId}&top=100`,
    queryKey: `PSITSocSignins-${tenant}-${effectiveUserId}`,
    waiting: Boolean(tenant && effectiveUserId),
  })
  const mfaRequest = ApiGetCall({
    url: `/api/ListPerUserMFA?tenantFilter=${tenant}&userId=${effectiveUserId}`,
    queryKey: `PSITSocMFA-${tenant}-${effectiveUserId}`,
    waiting: Boolean(tenant && effectiveUserId),
  })
  const rulesRequest = ApiGetCall({
    url: `/api/ListUserMailboxRules?tenantFilter=${tenant}&UserID=${effectiveUserId}&userEmail=${upn}`,
    queryKey: `PSITSocRules-${tenant}-${effectiveUserId}`,
    waiting: Boolean(tenant && effectiveUserId),
  })

  const groups = useMemo(
    () => groupSignInsByIp(adaptGraphSignIns(signInsRequest.data, usageLocation)),
    [signInsRequest.data, usageLocation]
  )

  const loading = [userLookup, signInsRequest].some((request) => request.isFetching && !request.isFetched)

  // No case, no journal to receive a gesture: the panel then shows and never acts.
  const caseless = !socCase?.CaseId

  const action = ApiPostCall({ relatedQueryKeys: queryKey ? [queryKey] : [] })
  // The journal write is bookkeeping: posted on the same mutation it overwrote the
  // remediation's own answer with 'SOC case saved by', which is noise where feedback was.
  const journal = ApiPostCall({ relatedQueryKeys: queryKey ? [queryKey] : [] })
  const [confirmOpen, setConfirmOpen] = useState(false)

  // One remediation, CIPP's own. This panel used to carry three separate buttons (revoke
  // sessions, reset password, block sign-in): three chances to do half a containment, and a
  // trail split across three endpoints. The upstream Remediate User flow does the six gestures
  // in order and logs each one under its own name, which is exactly what the fiche BEC's
  // attestation reads back. The URL keeps upstream's casing (execBecRemediate): the attestation
  // matches the API field as spelled by the caller.
  const runRemediation = () => {
    setConfirmOpen(false)
    action.mutate(
      {
        url: '/api/execBecRemediate',
        data: { tenantFilter: tenant, userId: effectiveUserId, username: upn },
      },
      {
        onSuccess: () => {
          // Every tenant-touching action is written to the case log, so the case tells the whole
          // remediation story without the analyst having to retype it.
          journal.mutate({
            url: '/api/PSITExecSocCase',
            data: {
              tenantFilter: tenant,
              CaseId: socCase.CaseId,
              LogAction: {
                Action: 'remediate-user',
                Detail: `Remédiation CIPP exécutée pour ${upn} : connexion bloquée, mot de passe réinitialisé, sessions révoquées, méthodes MFA retirées, règles de boîte désactivées, partage OneDrive désactivé`,
              },
            },
          })
        },
      }
    )
  }

  if (!upn && !userId) {
    return (
      <Card variant="outlined">
        <CardHeader title="Contexte utilisateur" />
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            Ce dossier ne cible pas d’utilisateur : renseigner l’UPN sur le dossier pour afficher le
            contexte identité.
          </Typography>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card variant="outlined">
      <CardHeader
        title="Contexte utilisateur"
        subheader={upn || effectiveUserId}
        action={
          effectiveUserId ? (
            <PsitAdminBadge
              tenant={tenant}
              userId={effectiveUserId}
              caseId={socCase?.CaseId}
            />
          ) : null
        }
      />
      <CardContent>
        {/* Before this, the panel printed "Aucune connexion récupérée" from its first render: for
            a second or three it told the analyst the account was clean, which is the one thing a
            panel must never say while it is still reading. */}
        {loading && <PsitSocLoading label="Lecture des connexions et des règles de boîte" />}
        <Stack spacing={2} sx={loading ? { display: 'none' } : undefined}>
          {!effectiveUserId && userLookup.isFetched && (
            <Alert severity="warning">
              Utilisateur introuvable sur ce tenant : le contexte ne peut pas être chargé.
            </Alert>
          )}

          <div>
            <Typography variant="subtitle2" gutterBottom>
              Connexions par adresse (100 dernières)
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Adresse</TableCell>
                  <TableCell>Pays</TableCell>
                  <TableCell align="right">Réussies</TableCell>
                  <TableCell align="right">Échecs</TableCell>
                  <TableCell>Applications</TableCell>
                  <TableCell>Lecture</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {groups.map((group) => {
                  const clue = readSignInGroup(group)
                  const colour = clue.foreignSuccess
                    ? 'error.main'
                    : clue.onlySuccessfulLocal
                      ? 'success.main'
                      : 'text.primary'
                  const flags = [
                    clue.foreignSuccess ? 'succès hors zone' : null,
                    clue.successAfterFailures ? 'succès après rafale' : null,
                    clue.usesLegacyClient ? 'client hérité' : null,
                    clue.onlySuccessfulLocal ? 'local' : null,
                  ].filter(Boolean)
                  return (
                    <TableRow key={group.ip}>
                      <TableCell sx={{ color: colour }}>{group.ip}</TableCell>
                      <TableCell sx={{ color: colour }}>{group.country || 'N/D'}</TableCell>
                      <TableCell align="right">{group.successes}</TableCell>
                      <TableCell align="right">{group.failures}</TableCell>
                      <TableCell>{group.apps.slice(0, 3).join(', ')}</TableCell>
                      <TableCell>
                        {flags.map((flag) => (
                          <Chip
                            key={flag}
                            size="small"
                            sx={{ mr: 0.5 }}
                            color={flag === 'local' ? 'success' : 'error'}
                            label={flag}
                          />
                        ))}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {groups.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Typography variant="body2" color="text.secondary">
                        Aucune connexion récupérée.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div>
            <Typography variant="subtitle2" gutterBottom>
              Règles de boîte
            </Typography>
            {Array.isArray(rulesRequest.data) && rulesRequest.data.length > 0 ? (
              <Stack spacing={0.5}>
                {rulesRequest.data.map((rule, index) => (
                  <Typography key={index} variant="body2">
                    {rule?.Name || 'Règle sans nom'}
                    {rule?.ForwardTo || rule?.RedirectTo ? ' — transfère vers l’extérieur' : ''}
                    {rule?.DeleteMessage ? ' — supprime les messages' : ''}
                    {rule?.MoveToFolder ? ` — déplace vers ${rule.MoveToFolder}` : ''}
                  </Typography>
                ))}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Aucune règle sur la boîte.
              </Typography>
            )}
          </div>

          {/* Hidden on the collect tab: evidence there, gestures on the response tab. */}
          {!hideActions && (
            <>
          <Divider />

          <div>
            <Typography variant="subtitle2" gutterBottom>
              Remédiation
            </Typography>
            {caseless && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Consultation hors dossier : la remédiation s’exécute depuis un dossier, pour que le
                geste laisse sa trace au journal.
              </Typography>
            )}
            <Button
              size="small"
              variant="contained"
              color="error"
              disabled={caseless || !effectiveUserId || !upn || action.isPending}
              onClick={() => setConfirmOpen(true)}
            >
              Remédier le compte (CIPP)
            </Button>
            <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="sm" fullWidth>
              <DialogTitle>{`Remédier ${upn} ?`}</DialogTitle>
              <DialogContent>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  La remédiation CIPP exécute les six gestes suivants, dans cet ordre :
                </Typography>
                <Typography variant="body2" component="div">
                  <ol style={{ margin: 0, paddingLeft: 20 }}>
                    <li>Réinitialiser le mot de passe</li>
                    <li>Bloquer la connexion</li>
                    <li>Révoquer les sessions et les jetons</li>
                    <li>Retirer toutes les méthodes MFA</li>
                    <li>Désactiver les règles de boîte</li>
                    <li>Désactiver le partage OneDrive</li>
                  </ol>
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Chaque geste est tracé au journal CIPP et attesté sur la fiche BEC. Le titulaire
                  perd l’accès immédiatement.
                </Typography>
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setConfirmOpen(false)}>Annuler</Button>
                <Button variant="contained" color="error" onClick={runRemediation}>
                  Remédier
                </Button>
              </DialogActions>
            </Dialog>
            <CippApiResults apiObject={action} />
            <CippApiResults apiObject={journal} errorsOnly />

            {/* The heavy enrichment: the BEC collection is an orchestrated job, so it lives on
                its own page rather than blocking this panel. The case id travels with the link so
                the analyst comes back here. */}
            <Button
              size="small"
              variant="text"
              sx={{ mt: 1 }}
              disabled={caseless || !effectiveUserId}
              component={Link}
              href={`/security/soc/bec?userId=${effectiveUserId}&tenantFilter=${tenant}&caseId=${socCase?.CaseId}`}
            >
              Ouvrir le dossier BEC
            </Button>
          </div>
            </>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}
