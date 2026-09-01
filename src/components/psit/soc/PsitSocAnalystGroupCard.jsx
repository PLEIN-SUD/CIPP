import { useState } from 'react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  Stack,
  TextField,
  Typography,
  Tooltip,
} from '@mui/material'
import { ApiGetCall, ApiPostCall } from '../../../api/ApiCall'
import { CippApiResults } from '../../CippComponents/CippApiResults'

/**
 * Which Entra group holds the analysts a dossier can be handed to.
 *
 * The group is configuration, never code: its object id is a production fact about one tenant and
 * these repositories are public. It is typed here once, and the answer echoes back the group's
 * display name so that an object id can be confirmed as the right group without leaving the page.
 *
 * Empty clears it, which is a real gesture and not a mistake: the list then falls back to the
 * portal's own users, and to the partner tenant's accounts when that list is empty too.
 */
export const PsitSocAnalystGroupCard = () => {
  const queryKey = 'PSITSocAnalystGroup'
  const [groupId, setGroupId] = useState('')

  const current = ApiGetCall({ url: '/api/PSITExecSocAnalystGroup', queryKey })
  // Which list the analysts actually come from. It is settings information, so it is read and
  // shown here, where a group can be named, rather than above the triage queue.
  const analysts = ApiGetCall({ url: '/api/PSITListSocAnalysts', queryKey: 'PSITSocAnalysts' })
  // The analyst list is what this setting feeds, so it has to be refetched with it.
  const save = ApiPostCall({ relatedQueryKeys: [queryKey, 'PSITSocAnalysts'] })

  const configuredId = current.data?.GroupId
  const configuredName = current.data?.GroupName

  return (
    <Card variant="outlined">
      <CardHeader
        title="Groupe des analystes"
        subheader="Qui peut se voir attribuer un dossier"
      />
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Sans groupe, la liste proposée à la réattribution est celle des utilisateurs du portail
            (CIPP Users), et à défaut les comptes du tenant partenaire. En indiquant un groupe
            Entra, seuls ses membres actifs sont proposés, y compris ceux qui en font partie via un
            groupe imbriqué.
          </Typography>

          {configuredId ? (
            <Alert severity="success">
              {`Analystes pris dans « ${configuredName || configuredId} ».`}
            </Alert>
          ) : (
            <Alert severity="info">
              Aucun groupe configuré : les utilisateurs du portail sont proposés.
            </Alert>
          )}

          {(Array.isArray(analysts.data?.Notes) ? analysts.data.Notes : []).map((note) => (
            <Alert severity="info" key={note}>
              {note}
            </Alert>
          ))}
          {(Array.isArray(analysts.data?.Warnings) ? analysts.data.Warnings : []).map((warning) => (
            <Alert severity="warning" key={warning}>
              {warning}
            </Alert>
          ))}

          <TextField
            label="Identifiant d’objet du groupe (vide pour effacer)"
            size="small"
            fullWidth
            value={groupId}
            onChange={(event) => setGroupId(event.target.value)}
            placeholder={configuredId || '00000000-0000-0000-0000-000000000000'}
            helperText="Entra ID : la page du groupe affiche son Object ID. Il est vérifié à l’enregistrement."
          />

          <div>
            <Tooltip describeChild title="Enregistrer : vérifie le groupe auprès de Graph puis en fait la seule source de la liste des analystes (champ vide : réglage effacé)">
              <span>
                <Button
                  variant="contained"
                  disabled={save.isPending}
                  onClick={() =>
                    save.mutate({
                      url: '/api/PSITExecSocAnalystGroup',
                      data: { GroupId: groupId.trim() },
                    })
                  }
                >
                  {save.isPending ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </span>
            </Tooltip>
          </div>

          <CippApiResults apiObject={save} />
        </Stack>
      </CardContent>
    </Card>
  )
}
