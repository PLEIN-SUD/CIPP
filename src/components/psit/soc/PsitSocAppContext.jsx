import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  Stack,
  Typography,
} from '@mui/material'
import { ApiGetCall, ApiPostCall } from '../../../api/ApiCall'
import { CippApiResults } from '../../CippComponents/CippApiResults'
import { PropertyList } from '../../property-list'
import { PropertyListItem } from '../../property-list-item'
import { readAppScopes } from '../../../utils/psit-soc-app-scopes'
import { readConsentAudit, readConsentGrants } from '../../../utils/psit-soc-consent'
import { PsitSocAppReportButton } from '../PsitSocAppReportFr'
import { PsitSocLoading } from './PsitSocLoading'

/**
 * The application side of a case: what an OAuth consent actually granted, and the gesture that
 * takes it back.
 *
 * Consent-based access is the persistence a password reset never touches, so this panel exists
 * to make the grant readable in one screen - who published the app, when it appeared, what it can
 * do - and to let the analyst cut it without leaving the case.
 *
 * The revocation disables the service principal and deletes its grants; it does not delete the
 * application, and the panel says so: the grant dates and scopes are evidence the investigation
 * still needs, and a disabled principal can be re-enabled if the call was wrong.
 */
export const PsitSocAppContext = ({ socCase, queryKey }) => {
  const tenant = socCase?.Tenant
  const appId = socCase?.Entities?.appId

  const principalRequest = ApiGetCall({
    url: `/api/ListGraphRequest?tenantFilter=${tenant}&Endpoint=servicePrincipals&$filter=appId eq '${appId}'&$select=id,appId,displayName,publisherName,verifiedPublisher,createdDateTime,accountEnabled`,
    queryKey: `PSITSocSp-${tenant}-${appId}`,
    waiting: Boolean(tenant && appId),
  })
  const principal = principalRequest.data?.Results?.[0] ?? principalRequest.data?.[0]

  // This application's grants, with who each one covers. The upstream OAuth list flattens
  // consentType and principalId away, which is how this panel used to count consents without
  // being able to name one.
  const grantsRequest = ApiGetCall({
    url: `/api/ListGraphRequest?tenantFilter=${tenant}&Endpoint=oauth2PermissionGrants&$filter=clientId eq '${principal?.id}'`,
    queryKey: `PSITSocGrants-${tenant}-${principal?.id}`,
    waiting: Boolean(tenant && principal?.id),
  })
  const grantRows = Array.isArray(grantsRequest.data?.Results) ? grantsRequest.data.Results : []

  // The people the user consents cover, resolved in one call. Capped at fifteen ids to keep the
  // filter within bounds; past that the rows keep their ids, which stay searchable.
  const principalIds = [...new Set(grantRows.map((row) => row?.principalId).filter(Boolean))].slice(0, 15)
  const usersRequest = ApiGetCall({
    url: `/api/ListGraphRequest?tenantFilter=${tenant}&Endpoint=users&$filter=id in (${principalIds.map((id) => `'${id}'`).join(',')})&$select=id,userPrincipalName,displayName`,
    queryKey: `PSITSocGrantUsers-${tenant}-${principalIds.join('|')}`,
    waiting: Boolean(tenant && principalIds.length > 0),
  })
  const consents = readConsentGrants(
    grantRows,
    Array.isArray(usersRequest.data?.Results) ? usersRequest.data.Results : []
  )

  // The audit trail that proves the consent: who, from where, when. Entra keeps roughly thirty
  // days of it, and the section says so rather than letting an empty list read as "nobody did".
  const auditRequest = ApiGetCall({
    url: `/api/ListGraphRequest?tenantFilter=${tenant}&Endpoint=auditLogs/directoryAudits&$filter=activityDisplayName eq 'Consent to application'&$top=100`,
    queryKey: `PSITSocConsentAudit-${tenant}`,
    waiting: Boolean(tenant && appId),
  })
  const auditEvents = readConsentAudit(
    Array.isArray(auditRequest.data?.Results) ? auditRequest.data.Results : [],
    { servicePrincipalId: principal?.id, appDisplayName: principal?.displayName }
  )

  // Every grant read together: an application is as dangerous as the union of what its consents
  // allow, not as the last one an analyst happened to look at.
  const scopes = readAppScopes(grantRows.map((row) => row?.scope).join(' '))

  const loading = [principalRequest, grantsRequest].some((request) => request.isFetching && !request.isFetched)

  // No case, no journal to receive a gesture: the panel then shows and never acts.
  const caseless = !socCase?.CaseId

  const action = ApiPostCall({ relatedQueryKeys: queryKey ? [queryKey] : [] })
  const revoke = () => {
    action.mutate(
      {
        url: '/api/PSITExecRevokeAppConsent',
        data: {
          tenantFilter: tenant,
          AppId: appId,
          ServicePrincipalId: principal?.id,
          // Named so the server can file the grants it is about to delete onto this dossier: they
          // are the evidence that justified the revocation, and nothing else keeps them.
          CaseId: socCase?.CaseId,
        },
      },
      {
        onSuccess: () => {
          action.mutate({
            url: '/api/PSITExecSocCase',
            data: {
              tenantFilter: tenant,
              CaseId: socCase.CaseId,
              LogAction: {
                Action: 'revoke-app-consent',
                Detail: `Consentement révoqué pour ${principal?.displayName ?? appId}`,
              },
            },
          })
        },
      }
    )
  }

  if (!appId) {
    return (
      <Card variant="outlined">
        <CardHeader title="Contexte application" />
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            Ce dossier ne cible pas d’application : renseigner appId sur le dossier pour afficher les
            consentements.
          </Typography>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card variant="outlined">
      <CardHeader
        title="Contexte application"
        subheader={principal?.displayName ?? appId}
        action={
          principal?.id ? (
            <Button
              size="small"
              component="a"
              target="_blank"
              rel="noreferrer"
              href={`https://entra.microsoft.com/${tenant}/#view/Microsoft_AAD_IAM/ManagedAppMenuBlade/~/Overview/objectId/${principal.id}/appId/${appId}`}
            >
              Ouvrir dans Entra
            </Button>
          ) : null
        }
      />
      <CardContent>
        {/* "Aucun consentement" is the answer this panel gives when it has finished looking. It
            used to give it while it was still looking, which reads as an application with no
            access - the opposite of what the analyst is about to be shown. */}
        {loading && <PsitSocLoading label="Lecture de l’application et de ses consentements" />}
        <Stack spacing={2} sx={loading ? { display: 'none' } : undefined}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {principal?.verifiedPublisher?.displayName ? (
              <Chip size="small" color="success" label={`éditeur vérifié : ${principal.verifiedPublisher.displayName}`} />
            ) : (
              <Chip size="small" color="error" label="éditeur non vérifié" />
            )}
            {scopes.hasPersistence && (
              <Chip size="small" color="error" label="jeton de rafraîchissement" />
            )}
            {scopes.readOnly && <Chip size="small" color="success" label="lecture seule" />}
            {principal?.accountEnabled === false && (
              <Chip size="small" label="application désactivée" />
            )}
          </Stack>

          <PropertyList>
            <PropertyListItem label="Identifiant d’application" value={appId} />
            <PropertyListItem
              label="Apparue dans le tenant"
              value={principal?.createdDateTime ?? 'inconnue'}
            />
          </PropertyList>

          <div>
            <Typography variant="subtitle2" gutterBottom>
              Consentements ({consents.length})
            </Typography>
            {consents.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {grantsRequest.isFetched
                  ? 'Aucun consentement délégué enregistré. Des droits d’application (app-only) restent possibles : vérifier dans Entra.'
                  : 'Consentements en cours de lecture.'}
              </Typography>
            ) : (
              <Stack spacing={1} divider={<Divider flexItem />}>
                {consents.map((consent, index) => (
                  <Stack key={index} spacing={0.5}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {consent.who}
                      </Typography>
                      {consent.kind === 'admin' && (
                        <Chip size="small" color="warning" label="admin" />
                      )}
                    </Stack>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {consent.scopes.map((scope) => {
                        const risky = consent.risky.find((entry) => entry.scope === scope)
                        return (
                          <Chip
                            key={scope}
                            size="small"
                            variant="outlined"
                            color={risky ? 'error' : 'default'}
                            label={scope}
                            title={risky?.why}
                          />
                        )
                      })}
                    </Stack>
                  </Stack>
                ))}
              </Stack>
            )}
          </div>

          <div>
            <Typography variant="subtitle2" gutterBottom>
              Trace du consentement dans l’audit
            </Typography>
            {!auditRequest.isFetched ? (
              <Typography variant="body2" color="text.secondary">
                Lecture du journal d’audit en cours.
              </Typography>
            ) : auditEvents.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Aucun événement de consentement visant cette application dans le journal. Entra ne
                conserve que trente jours d’audit : un consentement plus ancien n’y est plus, ce
                qui n’est pas la preuve qu’il n’a pas eu lieu.
              </Typography>
            ) : (
              <Stack spacing={0.75}>
                {auditEvents.map((event, index) => (
                  <Stack key={index} direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography variant="body2">
                      {event.who} · {event.whenUtc}
                      {event.ip ? ` · depuis ${event.ip}` : ''}
                    </Typography>
                    {event.offHours === true && <Chip size="small" color="error" label="HNO" />}
                    {event.result && event.result !== 'success' && (
                      <Chip size="small" color="warning" label={event.result} />
                    )}
                  </Stack>
                ))}
              </Stack>
            )}
          </div>

          <div>
            <Typography variant="subtitle2" gutterBottom>
              Permissions uniques ({scopes.granted.length})
            </Typography>
            {scopes.granted.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Aucune permission lue : cela ne veut pas dire que l’application n’a aucun droit,
                seulement que le consentement n’a pas pu être récupéré.
              </Typography>
            ) : (
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {scopes.granted.map((scope) => {
                  const risky = scopes.risky.find((entry) => entry.scope === scope)
                  return (
                    <Chip
                      key={scope}
                      size="small"
                      color={risky ? 'error' : 'default'}
                      label={risky ? `${scope} — ${risky.why}` : scope}
                    />
                  )
                })}
              </Stack>
            )}
          </div>

          <Divider />

          <div>
            <Typography variant="subtitle2" gutterBottom>
              Action et rapport
            </Typography>
            {caseless && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Consultation hors dossier : les actions s’exécutent depuis un dossier, pour que chaque
                geste laisse sa trace au journal.
              </Typography>
            )}
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button
                size="small"
                variant="outlined"
                color="error"
                disabled={caseless || action.isPending}
                onClick={revoke}
              >
                Révoquer le consentement
              </Button>
              {/* The report reads the evidence this panel already gathered, so generating it
                  costs no extra call. It waits for a qualification: a client document that
                  concludes nothing is a document nobody should send. */}
              <PsitSocAppReportButton
                socCase={socCase}
                principal={principal}
                consents={consents}
                auditEvents={auditEvents}
                scopes={scopes}
              />
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Désactive l’application et supprime ses consentements. L’application n’est pas
              supprimée : les dates et permissions restent disponibles pour l’investigation, et la
              désactivation se revient.
            </Typography>
            {!principal && principalRequest.isFetched && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                Application introuvable dans le tenant : elle a pu être supprimée depuis l’alerte.
              </Alert>
            )}
            <CippApiResults apiObject={action} />
          </div>
        </Stack>
      </CardContent>
    </Card>
  )
}
