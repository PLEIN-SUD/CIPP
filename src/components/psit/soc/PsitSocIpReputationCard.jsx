import { useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { ApiGetCall, ApiPostCall } from '../../../api/ApiCall'
import { CippApiResults } from '../../CippComponents/CippApiResults'

/**
 * The AbuseIPDB key, on the settings screen - the webhook secret's sibling.
 *
 * The key never reaches this component: the status read answers configured or not, by whom and
 * when, and the save endpoint validates the key with one live check before storing it. The
 * description states the two facts an operator must accept before configuring: every check
 * sends the address to the third party, and the free quota is a thousand checks a day (the
 * 24-hour server cache is what makes that hold).
 */
export const PsitSocIpReputationCard = () => {
  const [keyInput, setKeyInput] = useState('')
  const queryKey = 'PSITIpReputationKey'
  const status = ApiGetCall({
    url: '/api/PSITExecIpReputationKey',
    queryKey,
    waiting: true,
  })
  const save = ApiPostCall({ relatedQueryKeys: [queryKey] })

  const configured = status.data?.Configured === true

  return (
    <Card variant="outlined">
      <CardHeader
        title="Réputation des adresses (AbuseIPDB)"
        subheader={
          configured
            ? `Clé en place, enregistrée le ${status.data?.SetUtc || 'à une date inconnue'} par ${status.data?.SetBy || 'N/D'}`
            : 'Aucune clé configurée : les puces de réputation sont absentes des écrans'
        }
        action={
          <Chip
            size="small"
            color={configured ? 'success' : 'default'}
            label={configured ? 'Active' : 'Inactive'}
          />
        }
      />
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Chaque vérification envoie l’adresse IP au service AbuseIPDB. Le quota gratuit est de
            1 000 vérifications par jour ; le portail garde chaque relevé 24 heures pour le tenir.
            La clé est validée par une consultation au moment de l’enregistrement, et n’est jamais
            renvoyée à l’écran.
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <TextField
              size="small"
              type="password"
              label="Clé API AbuseIPDB (vide pour effacer)"
              value={keyInput}
              onChange={(event) => setKeyInput(event.target.value)}
              sx={{ minWidth: 320 }}
            />
            <Tooltip
              describeChild
              title="Enregistrer : valide la clé par une consultation puis la stocke côté serveur ; un champ vide efface le réglage et retire les puces des écrans"
            >
              <span>
                <Button
                  size="small"
                  variant="contained"
                  disabled={save.isPending}
                  onClick={() =>
                    save.mutate(
                      { url: '/api/PSITExecIpReputationKey', data: { Key: keyInput.trim() } },
                      { onSuccess: () => setKeyInput('') }
                    )
                  }
                >
                  {save.isPending ? 'Validation...' : 'Enregistrer'}
                </Button>
              </span>
            </Tooltip>
          </Stack>
          <CippApiResults apiObject={save} />
        </Stack>
      </CardContent>
    </Card>
  )
}
