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

  const grantsRequest = ApiGetCall({
    url: `/api/ListOAuthApps?tenantFilter=${tenant}`,
    queryKey: `PSITSocOAuth-${tenant}`,
    waiting: Boolean(tenant && appId),
  })
  const grants = Array.isArray(grantsRequest.data) ? grantsRequest.data : []
  const appGrants = grants.filter(
    (grant) => String(grant?.ApplicationID ?? '').toLowerCase() === String(appId ?? '').toLowerCase()
  )

  const principalRequest = ApiGetCall({
    url: `/api/ListGraphRequest?tenantFilter=${tenant}&Endpoint=servicePrincipals&$filter=appId eq '${appId}'&$select=id,appId,displayName,publisherName,verifiedPublisher,createdDateTime,accountEnabled`,
    queryKey: `PSITSocSp-${tenant}-${appId}`,
    waiting: Boolean(tenant && appId),
  })
  const principal = principalRequest.data?.Results?.[0] ?? principalRequest.data?.[0]

  // Every grant of this application, read together: an application is as dangerous as the union
  // of what its consents allow, not as the last one an analyst happened to look at.
  const scopes = readAppScopes(appGrants.map((grant) => grant?.Scope).join(' '))

  const action = ApiPostCall({ relatedQueryKeys: queryKey ? [queryKey] : [] })
  const revoke = () => {
    action.mutate(
      {
        url: '/api/PSITExecRevokeAppConsent',
        data: {
          tenantFilter: tenant,
          AppId: appId,
          ServicePrincipalId: principal?.id ?? appGrants[0]?.ObjectID,
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
            Ce cas ne cible pas d’application : renseigner appId sur le cas pour afficher les
            consentements.
          </Typography>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card variant="outlined">
      <CardHeader title="Contexte application" subheader={principal?.displayName ?? appId} />
      <CardContent>
        <Stack spacing={2}>
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
            <PropertyListItem
              label="Consentements"
              value={`${appGrants.length} enregistré(s)`}
            />
          </PropertyList>

          <div>
            <Typography variant="subtitle2" gutterBottom>
              Permissions accordées
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
              Action
            </Typography>
            <Button
              size="small"
              variant="outlined"
              color="error"
              disabled={action.isPending}
              onClick={revoke}
            >
              Révoquer le consentement
            </Button>
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
