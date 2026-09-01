import { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material'
import { ApiGetCall, ApiPostCall } from '../../../api/ApiCall'
import { CippApiResults } from '../../CippComponents/CippApiResults'
import { PsitSocLoading } from './PsitSocLoading'

/**
 * The Périmètre tab's per-type scope readings: who and what else is touched, pre-answered
 * instead of hunted through consoles. One block per question, each block owning its read, each
 * absence said (a read that has not landed is never rendered as 'nothing found'):
 *
 * - any account dossier: the account's registered Entra devices, a registration close to the
 *   alert flagged - a device enrolled during the window is the classic persistence move;
 * - application dossiers (6, 19): every account that consented to the same application - one
 *   stray consent and a campaign are different incidents;
 * - mailbox dossiers (5, 7): who holds permissions on the target mailbox, and which mailboxes
 *   the target account can reach (the reverse read comes from the permissions report when the
 *   nightly batch has built it);
 * - role dossiers (4): the current members of the roles the beneficiary now holds, and the
 *   actors the audit search recorded;
 * - machine dossiers (9-12): the accounts recently logged on the device;
 * - phishing dossiers (18): the same sender's other messages on the tenant, on demand - a
 *   message trace costs Exchange time, so it is a button, not a mount effect.
 *
 * Everything rides existing endpoints (ListGraphRequest, ListmailboxPermissions,
 * ListMessageTrace); the shared queryKeys mean a panel elsewhere already paying for a read
 * makes it free here.
 */

const frUtc = (value) => {
  if (!value) return 'date inconnue'
  try {
    return new Date(value).toLocaleString('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'UTC',
    })
  } catch {
    return String(value)
  }
}

/** Devices of the account, the recently registered one flagged. */
const DevicesBlock = ({ tenant, userId, createdUtc }) => {
  const devices = ApiGetCall({
    url: `/api/ListGraphRequest?tenantFilter=${tenant}&Endpoint=users/${userId}/registeredDevices&$select=id,displayName,operatingSystem,trustType,registrationDateTime,accountEnabled`,
    queryKey: `PSITScopeDevices-${tenant}-${userId}`,
    waiting: Boolean(tenant && userId),
  })
  const rows = Array.isArray(devices.data?.Results) ? devices.data.Results : []
  // A device enrolled shortly before or after the alert: the persistence question, pre-asked.
  const windowStart = createdUtc ? new Date(createdUtc).getTime() - 7 * 24 * 3600 * 1000 : null
  const isRecent = (device) =>
    windowStart && device?.registrationDateTime
      ? new Date(device.registrationDateTime).getTime() >= windowStart
      : false

  return (
    <Card variant="outlined">
      <CardHeader
        title="Appareils Entra du compte"
        subheader="Un appareil enregistré autour de l'alerte est un signal de persistance"
      />
      <CardContent>
        {devices.isFetching && !devices.isFetched ? (
          <PsitSocLoading label="Lecture des appareils" />
        ) : rows.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {devices.isSuccess
              ? 'Aucun appareil enregistré pour ce compte.'
              : 'Appareils non lus (lecture Graph en échec ou compte non résolu).'}
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Appareil</TableCell>
                <TableCell>Système</TableCell>
                <TableCell>Jonction</TableCell>
                <TableCell>Enregistré le (UTC)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((device) => (
                <TableRow key={device.id}>
                  <TableCell>
                    {device.displayName}
                    {isRecent(device) && (
                      <Tooltip
                        describeChild
                        title="Appareil enregistré dans les sept jours autour de l'alerte : vérifier qu'il est légitime avant de conclure"
                      >
                        <Chip size="small" color="error" label="récent" sx={{ ml: 1 }} />
                      </Tooltip>
                    )}
                    {device.accountEnabled === false && (
                      <Chip size="small" variant="outlined" label="désactivé" sx={{ ml: 1 }} />
                    )}
                  </TableCell>
                  <TableCell>{device.operatingSystem || ''}</TableCell>
                  <TableCell>{device.trustType || ''}</TableCell>
                  <TableCell>{frUtc(device.registrationDateTime)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

/** Everyone who consented to the same application: the consent's real reach. */
const AppConsentsBlock = ({ tenant, principalId }) => {
  const grants = ApiGetCall({
    url: `/api/ListGraphRequest?tenantFilter=${tenant}&Endpoint=oauth2PermissionGrants&$filter=clientId eq '${principalId}'`,
    // Same key as the evidence hook and the app panel: one request serves all three.
    queryKey: `PSITSocGrants-${tenant}-${principalId}`,
    waiting: Boolean(tenant && principalId),
  })
  const rows = Array.isArray(grants.data?.Results) ? grants.data.Results : []
  const adminConsent = rows.some((grant) => grant?.consentType === 'AllPrincipals')
  const principalIds = [
    ...new Set(rows.map((grant) => grant?.principalId).filter(Boolean)),
  ].slice(0, 10)

  const users = ApiGetCall({
    url: `/api/ListGraphRequest?tenantFilter=${tenant}&Endpoint=users&$select=id,displayName,userPrincipalName&$filter=id in (${principalIds
      .map((id) => `'${id}'`)
      .join(',')})`,
    queryKey: `PSITScopeConsentUsers-${tenant}-${principalIds.join('|')}`,
    waiting: Boolean(tenant && principalIds.length > 0),
  })
  const userRows = Array.isArray(users.data?.Results) ? users.data.Results : []

  return (
    <Card variant="outlined">
      <CardHeader
        title="Comptes ayant consenti à la même application"
        subheader="Un consentement isolé et une campagne ne se traitent pas pareil"
      />
      <CardContent>
        {grants.isFetching && !grants.isFetched ? (
          <PsitSocLoading label="Lecture des consentements" />
        ) : (
          <Stack spacing={1}>
            {adminConsent && (
              <Alert severity="warning">
                Un consentement administrateur couvre tout le tenant : chaque compte peut être
                concerné, pas seulement ceux listés.
              </Alert>
            )}
            {principalIds.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {grants.isSuccess
                  ? 'Aucun consentement individuel enregistré sur cette application.'
                  : 'Consentements non lus.'}
              </Typography>
            ) : (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {(userRows.length > 0 ? userRows : principalIds.map((id) => ({ id }))).map(
                  (user) => (
                    <Chip
                      key={user.id}
                      size="small"
                      variant="outlined"
                      label={user.userPrincipalName || user.displayName || user.id}
                    />
                  )
                )}
              </Stack>
            )}
          </Stack>
        )}
      </CardContent>
    </Card>
  )
}

/** Permissions on the target mailbox, and the reverse read from the permissions report. */
const MailboxBlock = ({ tenant, upn }) => {
  const direct = ApiGetCall({
    url: `/api/ListmailboxPermissions?tenantFilter=${tenant}&userId=${upn}`,
    queryKey: `PSITScopeMbxPerms-${tenant}-${upn}`,
    waiting: Boolean(tenant && upn),
  })
  const reverse = ApiGetCall({
    url: `/api/ListmailboxPermissions?tenantFilter=${tenant}&UseReportDB=true&ByUser=true&User=${upn}`,
    queryKey: `PSITScopeMbxReverse-${tenant}-${upn}`,
    waiting: Boolean(tenant && upn),
  })
  const directRows = Array.isArray(direct.data) ? direct.data : (direct.data?.Results ?? [])
  const reverseRows = Array.isArray(reverse.data) ? reverse.data : (reverse.data?.Results ?? [])

  return (
    <Card variant="outlined">
      <CardHeader
        title="Délégations de boîte"
        subheader="Le rayon d'action réel d'une boîte compromise"
      />
      <CardContent>
        {direct.isFetching && !direct.isFetched ? (
          <PsitSocLoading label="Lecture des délégations" />
        ) : (
          <Stack spacing={2}>
            <div>
              <Typography variant="subtitle2" gutterBottom>
                Qui a accès à cette boîte
              </Typography>
              {directRows.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {direct.isSuccess ? 'Aucune délégation posée sur cette boîte.' : 'Non lu.'}
                </Typography>
              ) : (
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {directRows.slice(0, 12).map((row, index) => (
                    <Chip
                      key={index}
                      size="small"
                      variant="outlined"
                      label={`${row.User ?? row.user ?? ''} (${row.AccessRights ?? row.Permissions ?? ''})`}
                    />
                  ))}
                </Stack>
              )}
            </div>
            <div>
              <Typography variant="subtitle2" gutterBottom>
                Boîtes accessibles par ce compte
              </Typography>
              {reverseRows.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Rien dans le rapport de délégations (il se construit par la tâche planifiée :
                  vide ne signifie pas aucun accès).
                </Typography>
              ) : (
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {reverseRows.slice(0, 12).map((row, index) => (
                    <Chip
                      key={index}
                      size="small"
                      variant="outlined"
                      label={`${row.Identity ?? row.Mailbox ?? row.identity ?? ''} (${row.AccessRights ?? row.Permissions ?? ''})`}
                    />
                  ))}
                </Stack>
              )}
            </div>
          </Stack>
        )}
      </CardContent>
    </Card>
  )
}

/** Members of the roles the beneficiary holds, and the recorded change actors. */
const RolesBlock = ({ tenant, socCase, evidence }) => {
  const activeRoles = evidence?.identityRoles ?? socCase?.Evidence?.identity?.activeRoles ?? []
  const roles = ApiGetCall({
    // directoryRoles does not support $filter: the activated-roles list is small, the sieve is
    // ours. Members expanded in the same read.
    url: `/api/ListGraphRequest?tenantFilter=${tenant}&Endpoint=directoryRoles&$expand=members($select=id,displayName,userPrincipalName)`,
    queryKey: `PSITScopeRoles-${tenant}`,
    waiting: Boolean(tenant && activeRoles.length > 0),
  })
  const rows = Array.isArray(roles.data?.Results) ? roles.data.Results : []
  const touched = rows.filter((role) => activeRoles.includes(role?.displayName))
  const actors = (socCase?.Evidence?.audit?.summary?.Actors ?? []).map((entry) => entry.Actor)

  return (
    <Card variant="outlined">
      <CardHeader
        title="Rôles touchés"
        subheader="Qui d'autre détient le privilège, et qui a fait le changement"
      />
      <CardContent>
        <Stack spacing={2}>
          {activeRoles.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Statut admin du bénéficiaire non encore relevé (il se lit à l’ingestion et dans
              l’onglet Preuves).
            </Typography>
          ) : roles.isFetching && !roles.isFetched ? (
            <PsitSocLoading label="Lecture des membres de rôles" />
          ) : (
            touched.map((role) => (
              <div key={role.id}>
                <Typography variant="subtitle2" gutterBottom>
                  {role.displayName}
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {(role.members ?? []).slice(0, 12).map((member) => (
                    <Chip
                      key={member.id}
                      size="small"
                      variant="outlined"
                      label={member.userPrincipalName || member.displayName}
                    />
                  ))}
                  {(role.members ?? []).length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      Aucun autre membre lisible.
                    </Typography>
                  )}
                </Stack>
              </div>
            ))
          )}
          {actors.length > 0 && (
            <div>
              <Typography variant="subtitle2" gutterBottom>
                Acteurs des changements (journal d’audit)
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {actors.slice(0, 6).map((actor) => (
                  <Chip key={actor} size="small" color="warning" variant="outlined" label={actor} />
                ))}
              </Stack>
            </div>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}

/** Accounts recently logged on the machine: who else a compromised device exposes. */
const DeviceUsersBlock = ({ tenant, intuneDeviceId }) => {
  const device = ApiGetCall({
    url: `/api/ListGraphRequest?tenantFilter=${tenant}&Version=beta&Endpoint=deviceManagement/managedDevices/${intuneDeviceId}&$select=usersLoggedOn,userDisplayName,userPrincipalName`,
    queryKey: `PSITScopeDeviceUsers-${tenant}-${intuneDeviceId}`,
    waiting: Boolean(tenant && intuneDeviceId),
  })
  const data = device.data?.Results ?? device.data
  const sessions = Array.isArray(data?.usersLoggedOn) ? data.usersLoggedOn : []
  const ids = [...new Set(sessions.map((session) => session?.userId).filter(Boolean))].slice(0, 10)
  const users = ApiGetCall({
    url: `/api/ListGraphRequest?tenantFilter=${tenant}&Endpoint=users&$select=id,displayName,userPrincipalName&$filter=id in (${ids
      .map((id) => `'${id}'`)
      .join(',')})`,
    queryKey: `PSITScopeDeviceUserNames-${tenant}-${ids.join('|')}`,
    waiting: Boolean(tenant && ids.length > 0),
  })
  const names = {}
  for (const user of Array.isArray(users.data?.Results) ? users.data.Results : []) {
    names[user.id] = user.userPrincipalName || user.displayName
  }

  return (
    <Card variant="outlined">
      <CardHeader
        title="Comptes connectés à la machine"
        subheader="Qui d'autre un poste compromis expose"
      />
      <CardContent>
        {device.isFetching && !device.isFetched ? (
          <PsitSocLoading label="Lecture des sessions du poste" />
        ) : sessions.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {device.isSuccess
              ? 'Intune ne rapporte aucune session récente sur ce poste.'
              : 'Sessions non lues (poste non résolu dans Intune).'}
          </Typography>
        ) : (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {sessions.slice(0, 10).map((session, index) => (
              <Tooltip
                key={index}
                describeChild
                title={`Dernière session le ${frUtc(session.lastLogOnDateTime)} UTC`}
              >
                <Chip
                  size="small"
                  variant="outlined"
                  label={names[session.userId] || session.userId}
                />
              </Tooltip>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  )
}

/** The same sender's other messages, on demand: a message trace costs Exchange time. */
const PhishCampaignBlock = ({ tenant, socCase }) => {
  const networkMessageId = socCase?.Entities?.networkMessageId
  const evidence = ApiGetCall({
    url: `/api/PSITListMailEvidence?tenantFilter=${tenant}&NetworkMessageId=${networkMessageId}&ReceivedUtc=${socCase?.Entities?.receivedUtc ?? ''}`,
    // Same key as the mail panel: the sender is already paid for.
    queryKey: `PSITMailEvidence-${tenant}-${networkMessageId}`,
    waiting: Boolean(tenant && networkMessageId),
  })
  const sender =
    evidence.data?.Message?.SenderFromAddress ||
    evidence.data?.Message?.SenderAddress ||
    evidence.data?.Message?.Sender ||
    ''
  const trace = ApiPostCall({})
  const [searched, setSearched] = useState(false)
  const rows = useMemo(
    () => (Array.isArray(trace.data?.data) ? trace.data.data : (trace.data?.data?.Results ?? [])),
    [trace.data]
  )
  const recipients = useMemo(
    () => [...new Set(rows.map((row) => row?.RecipientAddress).filter(Boolean))],
    [rows]
  )

  return (
    <Card variant="outlined">
      <CardHeader
        title="Campagne du même expéditeur"
        subheader="Les autres messages de cet expéditeur sur le tenant, 48 dernières heures"
      />
      <CardContent>
        <Stack spacing={1}>
          {!sender ? (
            <Typography variant="body2" color="text.secondary">
              Expéditeur non encore lu : ouvrir l’onglet Preuves pour charger l’évidence du
              message.
            </Typography>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary">
                {`Expéditeur : ${sender}`}
              </Typography>
              <div>
                <Tooltip
                  describeChild
                  title="Chercher la campagne : trace de messages Exchange sur 48 h pour cet expéditeur — quelques secondes"
                >
                  <span>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={trace.isPending}
                      onClick={() => {
                        setSearched(true)
                        trace.mutate({
                          url: '/api/ListMessageTrace',
                          data: { tenantFilter: tenant, sender, days: 2 },
                        })
                      }}
                    >
                      Chercher la campagne
                    </Button>
                  </span>
                </Tooltip>
              </div>
              {searched && trace.isSuccess && (
                <Typography variant="body2">
                  {rows.length === 0
                    ? 'Aucun autre message de cet expéditeur sur 48 h.'
                    : `${rows.length} message(s) tracé(s), ${recipients.length} destinataire(s) : ${recipients
                        .slice(0, 8)
                        .join(', ')}${recipients.length > 8 ? '…' : ''}`}
                </Typography>
              )}
              <CippApiResults apiObject={trace} errorsOnly />
            </>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}

const IDENTITY_TYPES = [1, 2, 6, 15, 19, 20]
const MAILBOX_TYPES = [5, 7]
const DEVICE_TYPES = [9, 10, 11, 12]

export const PsitSocScopeContext = ({ socCase, evidence }) => {
  const tenant = socCase?.Tenant
  const typeId = Number(socCase?.TypeId)
  const userId = socCase?.Entities?.userId || evidence?.user?.userId
  const upn = socCase?.Entities?.upn
  const intuneDeviceId = evidence?.device?.device?.id

  if (!socCase?.CaseId) return null

  return (
    <>
      {(IDENTITY_TYPES.includes(typeId) || MAILBOX_TYPES.includes(typeId)) && userId && (
        <DevicesBlock tenant={tenant} userId={userId} createdUtc={socCase?.CreatedUtc} />
      )}
      {[6, 19].includes(typeId) && evidence?.app?.principal?.id && (
        <AppConsentsBlock tenant={tenant} principalId={evidence.app.principal.id} />
      )}
      {MAILBOX_TYPES.includes(typeId) && upn && <MailboxBlock tenant={tenant} upn={upn} />}
      {typeId === 4 && <RolesBlock tenant={tenant} socCase={socCase} evidence={evidence} />}
      {DEVICE_TYPES.includes(typeId) && intuneDeviceId && (
        <DeviceUsersBlock tenant={tenant} intuneDeviceId={intuneDeviceId} />
      )}
      {typeId === 18 && socCase?.Entities?.networkMessageId && (
        <PhishCampaignBlock tenant={tenant} socCase={socCase} />
      )}
    </>
  )
}
