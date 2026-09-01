import { useState } from 'react'
import {
  Autocomplete,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography,
  Tooltip,
} from '@mui/material'
import { ApiPostCall } from '../../../api/ApiCall'
import { CippApiResults } from '../../CippComponents/CippApiResults'
import { psitSocTypeById } from '../../../utils/psit-soc-types'

// Why it happened, not what happened: the value that feeds the recommendations instead of
// leaving them generic. 'shadow-it' is the one the four-verdict taxonomy leans on most.
export const PSIT_ROOT_CAUSES = [
  { value: 'phishing', label: 'Hameçonnage (lien, pièce jointe, AiTM)' },
  { value: 'password', label: 'Mot de passe faible, réutilisé ou fuité' },
  { value: 'legacy-auth', label: 'Protocole hérité sans MFA' },
  { value: 'shadow-it', label: 'Shadow IT : outil ou application hors circuit' },
  { value: 'misconfiguration', label: 'Configuration : droit ou règle trop large' },
  { value: 'insider', label: 'Acteur interne (volontaire ou négligent)' },
  { value: 'benign', label: 'Aucune cause à traiter : activité normale' },
  { value: 'unknown', label: 'Non déterminée' },
]

/**
 * Step 5 of the frame: map the behaviour to MITRE ATT&CK and name the root cause.
 *
 * The techniques arrive pre-filled from the type's catalogue defaults and stay correctable per
 * dossier - the catalogue says what this alert family usually is, the analyst says what this
 * dossier actually was. Both live on the qualification, written before any verdict exists, and
 * a later verdict carries them (the server guarantees it).
 */
export const PsitSocAnalysisPanel = ({ socCase, queryKey }) => {
  const catalogueEntry = psitSocTypeById(socCase?.TypeId)
  const saved = socCase?.Qualification ?? {}
  const [techniques, setTechniques] = useState(
    () => (saved.AttackTechniques?.length ? saved.AttackTechniques : (catalogueEntry?.attack ?? []))
  )
  const [rootCause, setRootCause] = useState(saved.RootCause || '')

  const write = ApiPostCall({ relatedQueryKeys: queryKey ? [queryKey] : [] })

  const save = () => {
    write.mutate({
      url: '/api/PSITExecSocCase',
      data: {
        tenantFilter: socCase.Tenant,
        CaseId: socCase.CaseId,
        AttackTechniques: techniques,
        ...(rootCause ? { RootCause: rootCause } : {}),
      },
    })
  }

  const savedTechniques = saved.AttackTechniques ?? []
  const dirty =
    JSON.stringify(techniques) !== JSON.stringify(savedTechniques.length ? savedTechniques : (catalogueEntry?.attack ?? [])) ||
    (rootCause || '') !== (saved.RootCause || '')

  return (
    <Card variant="outlined">
      <CardHeader
        title="Analyse"
        subheader="Techniques observées (MITRE ATT&CK) et cause racine : ce que les rapports citent, et ce qui rend les recommandations concrètes"
      />
      <CardContent>
        <Stack spacing={2}>
          <Autocomplete
            multiple
            freeSolo
            size="small"
            options={catalogueEntry?.attack ?? []}
            value={techniques}
            onChange={(event, value) =>
              setTechniques(value.map((technique) => String(technique).trim().toUpperCase()).filter(Boolean))
            }
            renderTags={(value, getTagProps) =>
              value.map((technique, index) => (
                <Chip
                  size="small"
                  label={technique}
                  {...getTagProps({ index })}
                  key={technique}
                />
              ))
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="Techniques ATT&CK"
                helperText="Pré-remplies par la catégorie du dossier ; corriger selon ce qui a réellement été observé (attack.mitre.org)"
              />
            )}
          />

          <TextField
            select
            size="small"
            label="Cause racine"
            value={rootCause}
            onChange={(event) => setRootCause(event.target.value)}
            helperText="La cause de l’incident (hameçonnage, mot de passe réutilisé, protocole hérité…) ; reprise dans les recommandations des rapports"
          >
            {PSIT_ROOT_CAUSES.map((cause) => (
              <MenuItem key={cause.value} value={cause.value}>
                {cause.label}
              </MenuItem>
            ))}
          </TextField>

          {saved.RootCause || savedTechniques.length > 0 ? (
            <Typography variant="caption" color="text.secondary">
              {`Enregistré sur le dossier : ${savedTechniques.join(', ') || 'aucune technique'}${saved.RootCause ? `, cause « ${PSIT_ROOT_CAUSES.find((cause) => cause.value === saved.RootCause)?.label ?? saved.RootCause} »` : ''}.`}
            </Typography>
          ) : (
            <Typography variant="caption" color="text.secondary">
              Rien d’enregistré encore : les valeurs ci-dessus sont les défauts de la catégorie.
            </Typography>
          )}

          <div>
            <Tooltip describeChild title="Enregistrer l'analyse : fixe les techniques ATT&CK et la cause racine sur le dossier — les rapports les citent">
              <span>
                <Button
                  size="small"
                  variant="contained"
                  disabled={!dirty || write.isPending}
                  onClick={save}
                >
                  Enregistrer l’analyse
                </Button>
              </span>
            </Tooltip>
          </div>
          <CippApiResults apiObject={write} errorsOnly />
        </Stack>
      </CardContent>
    </Card>
  )
}
