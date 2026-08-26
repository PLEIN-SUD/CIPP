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
              {methods.map((method, index) => (
                <Typography key={index} variant="body2">
                  {method?.Type || method?.type || 'méthode'}
                  {method?.Device || method?.device ? ` · ${method.Device ?? method.device}` : ''}
                  {method?.LastUsed || method?.lastUsed
                    ? ` · utilisée le ${method.LastUsed ?? method.lastUsed}`
                    : ''}
                </Typography>
              ))}
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
