import { Alert, AlertTitle, Button, Stack, Typography } from '@mui/material'
import { Refresh } from '@mui/icons-material'
import { COLLECTION_STATUS, getCollectionStatus } from '../../utils/psit-bec-collection'

// Tells the analyst what state the collection is in before they read anything into it.
//
// A failed run is cached like a successful one and is never re-queued on its own, so without this
// the page shows empty checks and both reports would be generated from an error. The way out is the
// upstream "Refresh Data" control, which calls execBECCheck with Overwrite and resets the cache row;
// this surfaces the same action where the problem is visible rather than leaving the analyst to
// guess that a refresh is what a failure needs.

const TITLES = {
  [COLLECTION_STATUS.FAILED]: 'La collecte a échoué',
  [COLLECTION_STATUS.MISSING]: 'Aucune donnée de collecte',
  [COLLECTION_STATUS.STALE]: 'Collecte ancienne',
}

export const PsitBecCollectionStatus = ({ becData, onRestart }) => {
  const collection = getCollectionStatus(becData)

  if (
    collection.status === COLLECTION_STATUS.OK ||
    collection.status === COLLECTION_STATUS.RUNNING
  ) {
    return null
  }

  const isStale = collection.status === COLLECTION_STATUS.STALE

  return (
    <Alert severity={isStale ? 'warning' : 'error'} sx={{ mt: 2 }}>
      <AlertTitle>{TITLES[collection.status]}</AlertTitle>
      <Stack spacing={1}>
        <Typography variant="body2">{collection.message}</Typography>
        <Typography variant="body2">
          {isStale
            ? 'Relancez la collecte si la question porte sur les jours écoulés depuis. Les qualifications déjà enregistrées et la fiche de dossier ne sont pas effacées par une relance.'
            : "Les résultats affichés ci-dessous ne sont pas exploitables et aucun rapport ne doit être produit à partir d'eux. Un échec reste en cache jusqu'à ce qu'une relance le remplace : rechargez la page autant que vous voulez, c'est le même échec qui s'affichera. Les qualifications déjà enregistrées et la fiche de dossier ne sont pas effacées par une relance."}
        </Typography>
        {onRestart && (
          <Stack direction="row">
            <Button
              size="small"
              variant="outlined"
              color={isStale ? 'warning' : 'error'}
              startIcon={<Refresh />}
              onClick={() => onRestart()}
            >
              Relancer la collecte
            </Button>
          </Stack>
        )}
      </Stack>
    </Alert>
  )
}
