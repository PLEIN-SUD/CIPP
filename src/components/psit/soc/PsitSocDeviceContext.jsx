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
import { psitSocAge } from '../../../utils/psit-soc-queue'
import { CippApiResults } from '../../CippComponents/CippApiResults'
import { PropertyList } from '../../property-list'
import { PropertyListItem } from '../../property-list-item'

/**
 * The machine-side context of a case: what Intune knows about the device and what Defender
 * reports about its protection state, plus the graduated machine actions.
 *
 * CIPP is not the forensic console and does not pretend to be: the process timeline stays in the
 * Defender portal, reachable from the case's external reference. What this panel gives is the
 * tenant context an analyst needs to judge the alert - is the device managed, compliant, up to
 * date, who uses it - and the ability to act without leaving the tool.
 */
export const PsitSocDeviceContext = ({ socCase, queryKey }) => {
  const tenant = socCase?.Tenant
  const deviceId = socCase?.Entities?.deviceId
  const deviceName = socCase?.Entities?.deviceName

  const deviceRequest = ApiGetCall({
    url: deviceId
      ? `/api/ListDeviceDetails?tenantFilter=${tenant}&DeviceID=${deviceId}`
      : `/api/ListDeviceDetails?tenantFilter=${tenant}&DeviceName=${deviceName}`,
    queryKey: `PSITSocDevice-${tenant}-${deviceId || deviceName}`,
    waiting: Boolean(tenant && (deviceId || deviceName)),
  })
  const device = Array.isArray(deviceRequest.data) ? deviceRequest.data[0] : deviceRequest.data

  const defenderRequest = ApiGetCall({
    url: `/api/ListDefenderState?tenantFilter=${tenant}&DeviceID=${device?.id}`,
    queryKey: `PSITSocDefender-${tenant}-${device?.id}`,
    waiting: Boolean(tenant && device?.id),
  })
  const defenderState = Array.isArray(defenderRequest.data)
    ? defenderRequest.data[0]?.windowsProtectionState
    : defenderRequest.data?.windowsProtectionState

  // A raw timestamp does not answer the first question asked of a machine under suspicion: is it
  // still reporting. Twelve days of silence is a finding, and "2026-08-13T04:12:00Z" is not.
  const syncAge = psitSocAge(device?.lastSyncDateTime)
  const syncStale = Boolean(syncAge && syncAge.minutes > 7 * 24 * 60)

  const action = ApiPostCall({ relatedQueryKeys: queryKey ? [queryKey] : [] })
  const runAction = (payload, logAction) => {
    action.mutate(
      { url: payload.url, data: { tenantFilter: tenant, ...payload.data } },
      {
        onSuccess: () => {
          action.mutate({
            url: '/api/PSITExecSocCase',
            data: { tenantFilter: tenant, CaseId: socCase.CaseId, LogAction: logAction },
          })
        },
      }
    )
  }

  if (!deviceId && !deviceName) {
    return (
      <Card variant="outlined">
        <CardHeader title="Contexte machine" />
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            Ce cas ne cible pas de machine : renseigner l’identifiant ou le nom de la machine sur
            le cas pour afficher le contexte.
          </Typography>
        </CardContent>
      </Card>
    )
  }

  const compliant = device?.complianceState === 'compliant'
  const protectionStale =
    defenderState?.signatureUpdateOverdue === true || defenderState?.malwareProtectionEnabled === false

  return (
    <Card variant="outlined">
      <CardHeader title="Contexte machine" subheader={device?.deviceName || deviceName || deviceId} />
      <CardContent>
        <Stack spacing={2}>
          {!device && deviceRequest.isFetched && (
            <Alert severity="warning">
              Machine introuvable dans Intune : elle peut être non inscrite, ou connue seulement de
              Defender. Le portail Defender reste la source pour la chronologie.
            </Alert>
          )}

          {device && (
            <>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip
                  size="small"
                  color={compliant ? 'success' : 'error'}
                  label={compliant ? 'conforme' : `conformité : ${device.complianceState || 'inconnue'}`}
                />
                {defenderState && (
                  <Chip
                    size="small"
                    color={protectionStale ? 'error' : 'success'}
                    label={protectionStale ? 'protection en défaut' : 'protection à jour'}
                  />
                )}
                <Chip
                  size="small"
                  color={syncStale ? 'warning' : 'default'}
                  label={
                    syncAge
                      ? `vue il y a ${syncAge.label}`
                      : 'dernière remontée inconnue'
                  }
                />
              </Stack>

              <PropertyList>
                <PropertyListItem
                  label="Utilisateur principal"
                  value={device.userPrincipalName || 'non renseigné'}
                />
                <PropertyListItem
                  label="Système"
                  value={`${device.operatingSystem || ''} ${device.osVersion || ''}`.trim() || 'inconnu'}
                />
                <PropertyListItem
                  label="Dernière synchronisation"
                  value={device.lastSyncDateTime || 'inconnue'}
                />
                <PropertyListItem
                  label="Chiffrement"
                  value={
                    device.isEncrypted === true
                      ? 'activé'
                      : device.isEncrypted === false
                        ? 'désactivé'
                        : 'non renseigné'
                  }
                />
                <PropertyListItem
                  label="Propriété"
                  value={device.managedDeviceOwnerType || 'non renseignée'}
                />
                <PropertyListItem
                  label="Identifiant Entra"
                  value={device.azureADDeviceId || 'non renseigné'}
                />
                {defenderState && (
                  <PropertyListItem
                    label="Signatures antivirus"
                    value={defenderState.signatureVersion || 'inconnues'}
                  />
                )}
              </PropertyList>
            </>
          )}

          <Divider />

          <div>
            <Typography variant="subtitle2" gutterBottom>
              Actions graduées
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button
                size="small"
                variant="outlined"
                disabled={!device?.id || action.isPending}
                onClick={() =>
                  runAction(
                    { url: '/api/ExecDeviceAction', data: { GUID: device.id, Action: 'windowsDefenderScan', quickScan: false } },
                    { Action: 'defender-scan', Detail: `Analyse complète lancée sur ${device?.deviceName}` }
                  )
                }
              >
                Lancer une analyse complète
              </Button>
              <Button
                size="small"
                variant="outlined"
                disabled={!device?.id || action.isPending}
                onClick={() =>
                  runAction(
                    { url: '/api/ExecDeviceAction', data: { GUID: device.id, Action: 'rebootNow' } },
                    { Action: 'device-reboot', Detail: `Redémarrage demandé sur ${device?.deviceName}` }
                  )
                }
              >
                Redémarrer
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="error"
                disabled={!device?.azureADDeviceId || action.isPending}
                onClick={() =>
                  runAction(
                    { url: '/api/PSITExecMdeIsolation', data: { AzureADDeviceId: device.azureADDeviceId, Comment: `Cas ${socCase.CaseId}` } },
                    { Action: 'mde-isolate', Detail: `Isolation réseau demandée sur ${device?.deviceName}` }
                  )
                }
              >
                Isoler du réseau
              </Button>
              <Button
                size="small"
                variant="text"
                disabled={!device?.azureADDeviceId || action.isPending}
                onClick={() =>
                  runAction(
                    { url: '/api/PSITExecMdeIsolation', data: { AzureADDeviceId: device.azureADDeviceId, Release: true, Comment: `Cas ${socCase.CaseId}` } },
                    { Action: 'mde-unisolate', Detail: `Levée d’isolation demandée sur ${device?.deviceName}` }
                  )
                }
              >
                Lever l’isolation
              </Button>
            </Stack>
            {!device?.azureADDeviceId && device && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Sans identifiant Entra, la machine ne peut pas être rapprochée de son enregistrement
                Defender : isoler depuis le portail et consigner l’action sur le cas.
              </Typography>
            )}
            <CippApiResults apiObject={action} />
          </div>
        </Stack>
      </CardContent>
    </Card>
  )
}
