import { Alert, Stack, Typography } from '@mui/material'
import { Grid } from '@mui/system'
import { CippUserInfoCard } from '../../CippCards/CippUserInfoCard'
import { CippBannerListCard } from '../../CippCards/CippBannerListCard'
import { psitAsArray } from '../../../utils/psit-as-array'
import { groupSignInsByIp } from '../../../utils/psit-bec-signals'
import { psitSocAge } from '../../../utils/psit-soc-queue'

/**
 * Who the account holder is, and how they normally connect - drawn with the same components as
 * the native user page, because the analyst already knows how to read that screen and a second
 * visual language for the same person was a cost without a benefit.
 *
 * What stays PSIT here is the reading, not the drawing: which methods count as second factors,
 * which connections sit outside the declared country, and the refusal to let an empty collection
 * pass for a healthy one.
 */
const METHOD_KINDS = {
  phoneAuthenticationMethod: { label: 'Téléphone', detail: (m) => m.phoneNumber, mfa: true },
  emailAuthenticationMethod: {
    label: 'Adresse de secours',
    detail: (m) => m.emailAddress,
    // SSPR only: it resets the password, it never satisfies an MFA prompt.
    mfa: false,
  },
  fido2AuthenticationMethod: { label: 'Clé FIDO2', detail: (m) => m.model ?? m.displayName, mfa: true },
  microsoftAuthenticatorAuthenticationMethod: {
    label: 'Microsoft Authenticator',
    detail: (m) => m.displayName ?? m.deviceTag,
    mfa: true,
  },
  windowsHelloForBusinessAuthenticationMethod: {
    label: 'Windows Hello',
    detail: (m) => m.displayName,
    mfa: true,
  },
  softwareOathAuthenticationMethod: { label: 'Application OTP', detail: () => null, mfa: true },
  temporaryAccessPassAuthenticationMethod: {
    label: 'Pass d’accès temporaire',
    detail: (m) => (m.isUsable ? 'utilisable' : 'expiré'),
    mfa: true,
  },
  passwordlessMicrosoftAuthenticatorAuthenticationMethod: {
    label: 'Authenticator sans mot de passe',
    detail: (m) => m.displayName,
    mfa: true,
  },
}

const readMethod = (method) => {
  const type = String(method?.['@odata.type'] ?? '').replace('#microsoft.graph.', '')
  const kind = METHOD_KINDS[type]
  if (!kind) {
    // Named rather than hidden, and counted as MFA-capable by prudence: claiming a factor absent
    // because we do not know it is the worse mistake.
    return { label: type || 'méthode inconnue', detail: null, mfa: true }
  }
  return { label: kind.label, detail: kind.detail(method) ?? null, mfa: kind.mfa }
}

export const PsitBecIdentityPanel = ({ userData, becData, tenant }) => {
  const methods = psitAsArray(becData?.MFADevices)
  const readings = methods.map(readMethod)
  const signInGroups = groupSignInsByIp(psitAsArray(becData?.SuspectUserSignIns)).slice(0, 6)
  const usage = userData?.usageLocation

  const methodItems = readings.map((read, index) => ({
    id: methods[index]?.id ?? `method-${index}`,
    text: `${read.label}${read.detail ? ` · ${read.detail}` : ''}`,
    subtext: read.mfa
      ? 'Peut répondre à une demande MFA.'
      : 'Sert uniquement à réinitialiser le mot de passe : ne protège pas la connexion.',
    statusColor: read.mfa ? 'success.main' : 'warning.main',
    statusText: read.mfa ? 'second facteur' : 'réinitialisation seulement',
  }))

  const signInItems = signInGroups.map((group) => {
    const foreign = usage && group.country && group.country !== usage
    const age = psitSocAge(group.lastSeenUtc)
    const apps = [...(group.apps ?? [])].slice(0, 3).join(', ')
    return {
      id: group.ip,
      text: `${group.ip} — ${group.country || 'pays inconnu'}`,
      subtext: `${group.successes} réussie(s), ${group.failures} échec(s)${
        age ? ` · vue il y a ${age.label}` : ''
      }${apps ? ` · ${apps}` : ''}`,
      statusColor: foreign ? 'error.main' : group.country && usage ? 'success.main' : 'warning.main',
      statusText: foreign ? 'hors zone déclarée' : group.country && usage ? 'zone déclarée' : 'zone inconnue',
    }
  })

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, lg: 4 }}>
        <CippUserInfoCard user={userData} tenant={tenant} isFetching={!userData} />
      </Grid>
      <Grid size={{ xs: 12, lg: 8 }}>
        <Stack spacing={3}>
          <Typography variant="h6">Seconds facteurs</Typography>
          {methods.length === 0 ? (
            <Alert severity="error">
              Aucun second facteur enregistré d’après la collecte : ce compte ne tient que par son
              mot de passe. C’est à la fois un facteur de risque et une information pour la
              remédiation.
            </Alert>
          ) : (
            <>
              {!readings.some((read) => read.mfa) && (
                <Alert severity="error">
                  Aucune des méthodes enregistrées n’est utilisable comme second facteur : une
                  adresse de secours ne sert qu’à réinitialiser le mot de passe. Ce compte ne
                  tient que par son mot de passe.
                </Alert>
              )}
              <CippBannerListCard items={methodItems} isCollapsible={false} />
            </>
          )}

          <Typography variant="h6">
            Connexions récentes
            {usage ? ` — pays d’usage déclaré : ${usage}` : ''}
          </Typography>
          {signInItems.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Aucune connexion récupérée sur la fenêtre analysée.
            </Typography>
          ) : (
            <CippBannerListCard items={signInItems} isCollapsible={false} />
          )}
        </Stack>
      </Grid>
    </Grid>
  )
}
