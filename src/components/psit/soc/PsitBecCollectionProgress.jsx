import { useEffect, useState } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material'
import { PSIT_BEC_CHECKS } from '../../../utils/psit-bec-checks'

/**
 * What the screen says while the collection runs.
 *
 * The eleven checks take one to two minutes server-side, and the page used to show its tabs over
 * empty panels in the meantime: launching an investigation looked like landing on a broken page.
 * While the run is in flight this stands in for the tabs and says three things: it is running,
 * since when, and what it is gathering.
 *
 * The backend reports no per-check progress - only "still waiting" every poll - so the list below
 * is static by honesty: naming the checks tells the analyst what a collection is, ticking them
 * off would be an invention.
 */
export const PsitBecCollectionProgress = ({ userPrincipalName }) => {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const started = Date.now()
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <Card variant="outlined">
      <CardHeader
        title="Collecte en cours"
        subheader={userPrincipalName || 'la boîte sélectionnée'}
      />
      <CardContent>
        <Stack spacing={2}>
          <LinearProgress />
          <Typography variant="body2" color="text.secondary">
            Les onze contrôles s’exécutent côté serveur, comptez une à deux minutes. La page
            vérifie toutes les dix secondes et s’affichera seule.
            {elapsed > 0 ? ` Démarrée il y a ${elapsed} s.` : ''}
          </Typography>
          <div>
            <Typography variant="subtitle2" gutterBottom>
              Ce qui est en train d’être rassemblé
            </Typography>
            <Stack spacing={0.25}>
              {PSIT_BEC_CHECKS.map((check) => (
                <Typography key={check.id} variant="body2" color="text.secondary">
                  · {check.title}
                </Typography>
              ))}
            </Stack>
          </div>
        </Stack>
      </CardContent>
    </Card>
  )
}
