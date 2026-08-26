import { Card, CardContent, CardHeader, Chip, Divider, Stack, Typography } from '@mui/material'
import { psitAsArray } from '../../../utils/psit-as-array'
import { groupSignInsByIp } from '../../../utils/psit-bec-signals'
import { psitSocAge } from '../../../utils/psit-soc-queue'

/**
 * Who the account holder is, and how they normally connect.
 *
 * Facts an analyst needs early and that were only reachable by leaving for the upstream user page:
 * the declared usage country to compare sign-in countries against, the second factors registered,
 * and where the recent connections came from.
 *
 * No new call: the collection already gathers the sign-ins and the authentication methods, and the
 * page already holds the directory record. This reads them.
 */
/**
 * The registered methods come from Graph as authenticationMethods, distinguished by their
 * @odata.type, with the useful detail under a different property for each kind. Reading them by a
 * guessed field name printed four rows saying "méthode", which is how this was found.
 */
const METHOD_KINDS = {
  phoneAuthenticationMethod: { label: 'Téléphone', detail: (m) => m.phoneNumber },
  emailAuthenticationMethod: { label: 'Adresse de secours', detail: (m) => m.emailAddress },
  fido2AuthenticationMethod: { label: 'Clé FIDO2', detail: (m) => m.model ?? m.displayName },
  microsoftAuthenticatorAuthenticationMethod: {
    label: 'Microsoft Authenticator',
    detail: (m) => m.displayName ?? m.deviceTag,
  },
  windowsHelloForBusinessAuthenticationMethod: {
    label: 'Windows Hello',
    detail: (m) => m.displayName,
  },
  softwareOathAuthenticationMethod: { label: 'Application OTP', detail: () => null },
  temporaryAccessPassAuthenticationMethod: {
    label: 'Pass d’accès temporaire',
    detail: (m) => (m.isUsable ? 'utilisable' : 'expiré'),
  },
  passwordlessMicrosoftAuthenticatorAuthenticationMethod: {
    label: 'Authenticator sans mot de passe',
    detail: (m) => m.displayName,
  },
}

const readMethod = (method) => {
  const type = String(method?.['@odata.type'] ?? '').replace('#microsoft.graph.', '')
  const kind = METHOD_KINDS[type]
  if (!kind) {
    // Named rather than hidden: an unknown method is still a second factor on the account, and
    // the raw type is what lets us add it here.
    return { label: type || 'méthode inconnue', detail: null }
  }
  return { label: kind.label, detail: kind.detail(method) ?? null }
}

export const PsitBecIdentityPanel = ({ userData, becData }) => {
  const methods = psitAsArray(becData?.MFADevices)
  const signInGroups = groupSignInsByIp(psitAsArray(becData?.SuspectUserSignIns)).slice(0, 6)

  const facts = [
    ['Fonction', userData?.jobTitle],
    ['Service', userData?.department],
    ['Pays d’usage déclaré', userData?.usageLocation],
    ['Compte actif', userData?.accountEnabled === false ? 'non' : 'oui'],
    ['Créé le', userData?.createdDateTime],
  ].filter(([, value]) => value)

  return (
    <Stack spacing={2}>
      <Card variant="outlined">
        <CardHeader title="Titulaire" subheader={userData?.userPrincipalName} />
        <CardContent>
          <Stack spacing={0.5}>
            {facts.map(([label, value]) => (
              <Typography key={label} variant="body2">
                <strong>{label} :</strong> {value}
              </Typography>
            ))}
            {facts.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                Aucune information d’annuaire chargée pour ce compte.
              </Typography>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardHeader
          title="Seconds facteurs"
          subheader="Une méthode ajoutée le jour de l’alerte est un signal, pas un détail"
        />
        <CardContent>
          {methods.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Aucune méthode remontée par la collecte.
            </Typography>
          ) : (
            <Stack spacing={1}>
              {methods.map((method, index) => {
                const read = readMethod(method)
                return (
                  <Typography key={method?.id ?? index} variant="body2">
                    {read.label}
                    {read.detail ? ` · ${read.detail}` : ''}
                  </Typography>
                )
              })}
            </Stack>
          )}
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardHeader
          title="Connexions récentes"
          subheader="Groupées par adresse, la plus active en premier"
        />
        <CardContent>
          {signInGroups.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Aucune connexion récupérée sur la fenêtre analysée.
            </Typography>
          ) : (
            <Stack spacing={1} divider={<Divider flexItem />}>
              {signInGroups.map((group) => {
                const foreign =
                  userData?.usageLocation &&
                  group.country &&
                  group.country !== userData.usageLocation
                const age = psitSocAge(group.lastSeenUtc)
                return (
                  <Stack
                    key={group.ip}
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    flexWrap="wrap"
                    useFlexGap
                  >
                    <Typography variant="body2">{group.ip}</Typography>
                    <Chip
                      size="small"
                      color={foreign ? 'warning' : 'default'}
                      label={group.country || 'pays inconnu'}
                    />
                    <Typography variant="body2" color="text.secondary">
                      {group.successes} réussie(s), {group.failures} échec(s)
                      {age ? ` · vue il y a ${age.label}` : ''}
                    </Typography>
                  </Stack>
                )
              })}
            </Stack>
          )}
        </CardContent>
      </Card>
    </Stack>
  )
}
