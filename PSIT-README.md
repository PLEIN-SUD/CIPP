# Personnalisations Plein Sud IT (PSIT)

Ce dépôt est un fork de `KelvinTegelaar/CIPP`. Ce fichier documente les règles de travail sur les
personnalisations PSIT. Il ne remplace pas la documentation upstream (`README.md`).

## Isoler la divergence

- Tout ajout est un fichier **préfixé `Psit` / `psit-`** : `src/components/psit/`,
  `src/utils/psit-*.js`, `tests/**/Psit*` et `tests/utils/psit-*`.
- Une modification d'un fichier upstream est **encadrée par une paire de marqueurs**, dans la
  syntaxe de commentaire du langage :

  ```jsx
  {/* PSIT-CUSTOM-BEGIN: raison courte */}
  ...
  {/* PSIT-CUSTOM-END */}
  ```

  C'est la **seule forme admise**, y compris pour une modification d'une seule ligne, y compris
  entre attributs JSX. Pas d'annotation en fin de ligne : le contrôle de divergence ne reconnaît
  que les paires.

- À la fin d'une tâche, lister les fichiers upstream modifiés et les fichiers PSIT créés.

## Ne jamais reformater un fichier upstream

**Ne lancez pas `prettier` sur un fichier upstream.** Les fichiers de CIPP ne sont pas tous
conformes au prettier du dépôt : le lancer reformate des lignes que personne n'a modifiées et
transforme un correctif de 14 lignes en diff de 285. Chaque ligne ainsi déplacée est un conflit
potentiel à la prochaine synchronisation upstream.

Le script `yarn prettier` du dépôt cible `**/*.{js,jsx,json}` : **il ne doit pas être lancé sur ce
fork**. Formatez uniquement les fichiers PSIT, un par un :

```bash
node node_modules/prettier/bin/prettier.cjs --write src/components/psit/MonFichier.jsx
```

Même prudence avec `--write` sur un répertoire : sur un système de fichiers insensible à la casse,
`prettier --write tests` atteint aussi `Tests/` et a déjà reformaté 91 fixtures upstream.

Ce garde-fou est automatique :

```bash
node scripts/psit-report-lint.mjs        # prose + divergence
node scripts/psit-report-lint.mjs --init-baseline   # après une synchro upstream
```

Il échoue si une ligne d'un fichier upstream déclaré diffère de sa **référence** hors d'une paire de
marqueurs. La référence est une copie de la version upstream d'origine, dans
`psit/upstream-baseline/`, retrouvée automatiquement comme la version la plus récente du fichier
sans marqueur. Elle est committée et se rafraîchit délibérément à chaque synchronisation upstream,
avec `--init-baseline` : c'est le moment où un humain doit de toute façon relire ces blocs.

`--init-baseline` **refuse de s'exécuter** si l'arbre de travail contient des modifications non
committées sur l'un des fichiers surveillés : la baseline est prise dans l'historique committé, et
sur un arbre sale elle enregistrerait vos propres blocs comme « la version upstream », ce qui ferait
passer le contrôle au vert sur un état que personne n'a relu. Avant écrasement, l'ancienne baseline
est copiée dans `psit/upstream-baseline/history/<horodatage>/` : à committer avec la nouvelle, c'est
la seule trace de ce qu'upstream contenait quand les blocs ont été écrits.

Comparer au sommet d'`upstream/main` ou d'`upstream/dev` ne marche pas : les deux branches upstream
ont divergé entre elles, et le diff rapporte alors l'écart d'upstream comme le nôtre.

Le lint contrôle aussi la prose des modules de rapport : pas de `(s)`, pas de tiret cadratin, pas de
« Page x of y », pas d'identifiant interne rendu, pas de lexique banni, un seul deux-points par
phrase, pas de majuscule après un deux-points en milieu de phrase, sous-titres en groupe nominal.
L'analyse passe par l'AST (`@babel/parser`) et non par des expressions régulières sur le fichier :
un `grep` prend `filter((s) => …)` pour un pluriel parenthésé et la table de règles de
`psit-report-prose` pour du lexique banni, et un lint qui crie faux se fait désactiver.

## Rapports PDF

Le rendu passe par `@react-pdf/renderer` (composants React vers PDF, côté navigateur), **pas** par
un moteur HTML vers PDF. Il n'y a donc ni feuille de style d'impression, ni `break-inside`, ni
`orphans`. Les équivalents sont des props : `wrap={false}` (bloc insécable), `minPresenceAhead`
(ne pas orphelinier un titre), `break` (saut forcé), `fixed` (répétition sur chaque page, avec
`subPageNumber` dans les callbacks `render`).

Les règles de rédaction sont centralisées dans `src/utils/psit-report-prose.js` : cardinalités et
accords, formats de date, espaces insécables, dictionnaire de formulations. Deux points de contrat :

- `cardinal(0, 'connexion')` rend « aucune connexion », mais une valeur **absente lève une
  erreur** : « aucune connexion » est un constat, une donnée non collectée est une défaillance de
  collecte, et les confondre écrit un faux constat dans un document opposable. Pour ce cas, passer
  `NOT_COLLECTED`, rendu « non déterminé ».
- Pas de `(s)`, pas de tiret cadratin, pas de date hors des deux formats du module.

## Caractères : CP1252, et pas un de plus

`@react-pdf/renderer` compose avec les polices standard PDF, qui s'encodent en **WinAnsi
(CP1252)**. Mesuré sur un rendu réel, dans `tests/render/psit-pdf-glyphs.test.jsx` :

- **tout ce que CP1252 couvre arrive intact**, y compris la ponctuation du bloc 0x80-0x9F que
  Windows y a mise : l'apostrophe typographique `’`, la puce `•`, les points de suspension
  `…`, les tirets `–` `—`, la ligature `œ`. Le cadratin reste banni par la règle
  `no-dash`, pour le registre, pas pour l'encodage ;
- **ce qui sort de CP1252 n'échoue pas** : l'encodeur émet un octet qui veut dire autre chose,
  et la page imprime **un autre caractère**. `→` (U+2192) imprime une apostrophe. U+202F,
  la fine insécable que la typographie française demande vraiment devant un deux-points,
  imprime une barre oblique. Aucun avertissement, nulle part.

D'où la règle de lint `cp1252-only`, et d'où l'usage de U+00A0 plutöt que U+202F dans
`nbsp()`.

### Un piège d'outillage, pas de rendu

Un extracteur de texte PDF qui décode ces octets en **Latin-1** au lieu de CP1252 transforme une
apostrophe correcte en U+0092 invisible : l'assertion échoue, le terminal n'affiche rien, et le
PDF se fait accuser d'un défaut qui est dans le lecteur. `tests/render/psit-pdf-text.js` décode
en CP1252 depuis, avec la table écrite en clair. Une demi-journée a été perdue à corriger
des chaînes qui n'avaient rien.

### Les insécables ne sont posées qu'à un endroit

`nbsp()` existe, est testé, et n'est appelé que sur la phrase du repère mesuré. Partout
ailleurs, l'espace devant un deux-points ou un point-virgule est une espace ordinaire, donc
sécable : une ligne peut commencer par `:`. Le poser partout demanderait de passer une centaine
de chaînes par la fonction, ou un composant enveloppe côté PSIT ; à faire délibérément,
pas au fil de l'eau.

## Continuation de section : « (suite) »

react-pdf **ne permet pas** de détecter qu'une page est la continuation d'une section. Les deux
mécanismes possibles ont été essayés sur des rendus réels :

- un `render` sur le titre de l'en-tête `fixed` (`({ subPageNumber }) => …`) fait **disparaître tous
  les titres de page** dès que le document dépasse une page : le moteur résout les nœuds fixes une
  fois et jette la sortie du callback ;
- un `Text` imbriqué avec `render`, à côté d'un titre en texte simple, ne rend rien du tout.

Le libellé est donc **manuel**, et la primitive `PageHeader` reste à sa forme upstream.

### Quand l'appliquer

Uniquement sur un titre de `ContentPage` qu'on **découpe soi-même** en deux `ContentPage`
consécutives, quand le contenu est prévisible et déjà long : la seconde porte le titre suivi de
« (suite) », comme « Annexe A : couverture des vérifications » puis « Annexe A : détail des
contrôles ».

Ne pas l'appliquer à une section dont le débordement dépend des données : le titre serait faux dans
la moitié des dossiers. Une section qui déborde parce que le volume varie garde son titre unique,
répété tel quel sur les pages suivantes par l'en-tête `fixed` — le tableau, lui, répète son en-tête
de colonnes, ce qui suffit à situer le lecteur.

### Sections qui débordent, mesurées sur les rendus de l'étape F

| Section | Rendu | Pages |
|---|---|---|
| « Éléments de description au sens de l'article 33.3 du RGPD » | tous les rendus d'incident | 2 |
| « Liste à vérifier, extraite du suivi des messages » (annexe des tiers) | 60 destinataires | 4 |
| « Constats et base probante » (faits établis) | commentaire d'analyste très long | 3 |
| Rapport d'investigation | aucun débordement observé | 1 |

Les trois premières varient avec les données : elles gardent un titre unique. La page d'exposition
déborde même sur un dossier ordinaire, ce qui est acceptable — c'est la section la plus dense du
rapport et son découpage manuel figerait une coupure qui n'a pas de sens éditorial.

## Jeux d'essai : aucune donnée personnelle, jamais

**Ce dépôt est un fork public.** Une adresse réelle dans une fixture est publiée, indexée par
la recherche de code, et reste accessible dans l'historique du commit qui l'a ajoutée. La supprimer
ensuite ne la retire pas du passé.

C'est arrivé : l'adresse du propriétaire du fork servait d'opérateur et d'analyste dans dix
fichiers de fixtures des deux dépôts, 73 occurrences. Repérée par lui, pas par un contrôle.

Le contrôle existe maintenant, dans `psit-report-lint` :

- `no-personal-data` — le domaine du fork et tout nom de personne réelle sont bannis des
  fixtures PSIT, **y compris dans une expression régulière ou un commentaire** : deux occurrences
  avaient survécu au premier passage parce que les points étaient échappés ;
- `no-real-domain` — une adresse de fixture doit être sur un domaine réservé : `.test`,
  `.example`, `.invalid`, `.localhost`, `example.com/net/org`, ou les domaines de documentation
  Microsoft `contoso` et `fabrikam` dont les fixtures upstream sont pleines. Il a déjà attrapé un
  nom de règle inventé qui tombait sur un TLD réel.

Pour un opérateur ou un analyste, écrire un **rôle** et non une personne :
`analyste@example.test`. Le nom de l'entreprise dans le rapport lui-même
(« Entité émettrice : PLEIN SUD IT ») est une mention de marque du produit, pas une donnée
personnelle : elle reste.

Ce que le contrôle **ne** couvre pas : les métadonnées d'auteur des commits, qui portent
nécessairement une adresse et sont la pratique normale de git ; et le contenu déjà poussé. Retirer
une donnée de l'historique d'un dépôt public demande une réécriture et un force-push, avec les
conséquences que ça implique pour quiconque a cloné : c'est une décision, pas une correction.

## Ajouter un test : forcer la casse du chemin

Le dépôt contient **deux répertoires qui ne diffèrent que par la casse**, hérités d'upstream :
`Tests/Shapes/` (93 fichiers) et `tests/` (161). Sous Windows, le système de fichiers les confond
et `core.ignorecase` fait enregistrer à git la casse du disque, qui est `Tests`. Un
`git add tests/render/mon-test.jsx` se retrouve donc committé en `Tests/render/mon-test.jsx`, et
sous Linux ça fait un second répertoire que la configuration Vitest ne regarde pas.

```bash
git -c core.ignorecase=false add tests/render/mon-test.jsx
```

À vérifier avec `git status --short` : le chemin affiché doit être en minuscules. Ne pas
tenter de renommer les 93 fichiers d'upstream pour régler le fond : c'est de la divergence pure.

## Limites connues, hors périmètre

### Deux plafonds qu'aucun dossier ne peut atteindre

Le tableau de confinement est limité à 12 lignes sur une liste fixe de 9 actions types, et le
tableau des résultats du rapport d'investigation à 11 lignes sur une liste fixe de 11 contrôles.
Aucun jeu de données ne les dépasse, donc aucune assertion ne les couvre : c'est délibéré, pas
un oubli. Si la liste des actions types ou des contrôles s'allonge, ces deux plafonds deviennent
des troncatures muettes — les relâcher ou les recalculer à partir de la longueur de la liste.

### Troncatures signalées : la formulation est unique

Toute quantité tronquée dit ce qu'elle montre, ce qu'il y avait, et où est le reste, avec la
**même phrase dans tout le document** : « 8 lignes sur 12 figurent ici ; la liste complète est
dans l'export de données du dossier. » (`truncationNote()`), ou sa forme courte quand la place
manque dans une cellule : « et 2 objets de plus » (`andMore()`). `listWithNote()` plafonne et
signale d'un seul appel, ce qui évite de recompter à la main.

Ne pas inventer une formulation par section : un lecteur qui a compris la phrase une fois doit la
reconnaître partout.

### Seuils de troncature, bas mais assumés

**Traité :** les vingt mécanismes de plafonnement des deux rapports ont été recensés, et les
seize qui coupaient sans le dire signalent désormais leur troncature (voir juste au-dessus).
Chaque cas a une assertion sur un jeu qui dépasse son seuil.

**Reste à juger, sans avoir été changé :** plusieurs seuils sont bas au regard des volumes d'un
dossier réel. Huit lignes pour les modifications de règles, huit pour les appareils gérés, cinq
pour les rafales d'envoi. Sur une compromission active, une bonne partie de la matière part dans
l'export brut, que personne ne lit. Ces seuils tiennent à la place disponible sur une page, pas à
un raisonnement d'enquête : à revoir avec un vrai dossier volumineux sous les yeux.

### Une règle de transfert externe verrouille le verdict

Quand la collecte trouve une règle de boîte qui transfère vers un domaine extérieur, le signal est
classé `established` : la donnée suffit à le qualifier, aucune réponse d'analyste ne le déplace. Le
verdict du dossier reste donc `compromised` **même si l'analyste qualifie tous les signaux à
qualifier comme attendus**.

Conséquence : un transfert légitime — boîte fonctionnelle qui recopie vers un prestataire, archivage
contractuel, redirection décidée par la direction — ne peut être ni écarté, ni documenté comme tel.
Le rapport d'incident se génère, avec « compromission retenue » en couverture, sur un dossier que
l'analyste sait sain.

Comportement **préexistant à la révision rédactionnelle** : il n'a pas été introduit par elle et
n'est pas modifié par elle. La parité de valeurs le confirme (`scripts/psit-value-parity.mjs`, cas
« tout attendu »). À traiter dans un dossier séparé, où la question de fond se pose : faut-il un
quatrième état de qualification pour un signal établi mais légitime, avec la trace de qui l'a
déclaré légitime et sur quelle base ?

## Ce que les assertions ne voient pas

Écrit pour qu'une session ultérieure ne refasse pas le diagnostic. Tout ce qui suit est passé
à travers une suite verte, et n'a été trouvé qu'en **lisant le texte extrait d'un PDF rendu**.

### Les accords ne se vérifient pas tout seuls

Six défauts, chacun dans une chaîne assemblée à la main autour d'un compteur juste :

| Imprimé | Attendu | Cause |
|---|---|---|
| 5 correspondants externes distinct observé | distincts observés | qualificatif accordé à la main |
| avec 2 voies d'exfiltration établie | établies | idem, au féminin |
| 2 signaux est retenu | ont été retenus | `cardinal()` employé là où `sentence()` portait déjà l'auxiliaire |
| suivis de une campagne | d'une campagne | élision absente |
| 1 tiers a été destinataire à vérifier | relevé parmi les destinataires… | participe pris pour un attribut |
| 10 destinataires supplémentaire ne figure pas | supplémentaires ne figurent pas | accord et verbe à la main |

Le compte était juste dans les six cas, et une assertion sur le compte passait. **Un nombre
correct dans une phrase fausse reste une phrase fausse.** Les helpers existent pour ça :
`cardinal()` pour le nombre, `sentence()` pour « N ont été X », `agree()` pour un
qualificatif nu, `elideDe()` pour « de » devant une voyelle. Écrire l'accord à la main dans
une interpolation, c'est reprendre le défaut à zéro.

### Une coupe qui précède le plafond du tableau est muette

`otherEvents` faisait `.slice(0, 20)` avant de passer `limit={20}` au tableau. Le primitif calcule
ce qu'il omet à partir de ce qu'on lui donne : il recevait vingt lignes, n'en cachait aucune, et
n'écrivait rien. Vingt-six événements en entrée, vingt imprimés, six disparus sans un mot.

Règle : **ne jamais couper une liste avant de la passer à quelque chose qui la plafonne déjà.**
Passer la liste entière et laisser le plafond compter. Ailleurs, `listWithNote()` fait les deux.

### La note de troncature d'un primitif upstream est en anglais

Un rapport français imprimait « and 14 more. Export the table from the report page for the full
list. » au milieu de son annexe. Le primitif suit désormais la langue du document, par un bloc
marqué ; la branche anglaise est inchangée octet pour octet. `emptyText` a le même piège : sans
valeur explicite, un tableau vide affiche « Nothing to report. ».

**À vérifier à chaque reprise d'un primitif upstream dans un rapport français** : toute chaîne
par défaut est anglaise.

### CP1252, mesuré et non supposé

Voir la section dédiée plus haut. En un paragraphe : **tout CP1252 arrive intact** dans le PDF,
apostrophe typographique, puce, points de suspension, tirets et ligature comprises. Ce qui **sort**
de CP1252 n'est ni perdu ni signalé : il est **remplacé**. `→` imprime une apostrophe, U+202F
imprime une barre oblique. La règle de lint `cp1252-only` ferme ça.

### Le piège qui a coûté le plus cher : l'extracteur de test

Le rendu affichait « Règle de transfert vers **lextérieur** ». Diagnostic posé :
`@react-pdf/renderer` jette les caractères au-dessus de U+00FF. Quatorze apostrophes, trois puces
et une ellipse remplacées dans le code des rapports.

**Le diagnostic était faux.** L'apostrophe arrivait bien dans le PDF, encodée en WinAnsi 0x92.
`tests/render/psit-pdf-text.js` décodait ces octets en **Latin-1**, où 0x92 est un caractère de
contrôle invisible : l'assertion échouait, le terminal n'affichait rien, et le PDF se faisait
accuser d'un défaut qui était dans l'instrument. Les dix-huit remplacements ont été défaits.

Deux leçons, dans cet ordre :

1. **Un outil de mesure se vérifie avant ce qu'il mesure.** Le test qui a tranché,
   `tests/render/psit-pdf-glyphs.test.jsx`, a été écrit pour *confirmer* la théorie et l'a
   contredite. C'est le seul test de ce dépôt dont le rôle est de dire ce que l'outillage voit.
2. **Un caractère invisible dans un terminal n'est pas un caractère absent.** Comparer des
   points de code, pas des rendus de terminal : `[...texte].map((c) => c.codePointAt(0))`.

### Ce que les assertions ne verront jamais

Ni la largeur d'une colonne, ni une césure, ni un contraste, ni le rendu d'un glyphe à l'œil.
Les rendus de `psit/render-samples/` existent pour ça, et le contrôle le plus utile reste une
impression en niveaux de gris.

## Tests

Node 24 avec `engines: ^22`, donc appeler les binaires directement plutôt que par `yarn` :

```bash
export PATH="/c/Program Files/nodejs:$PATH"
node node_modules/vitest/vitest.mjs run --project unit tests/components/psit tests/utils
node node_modules/eslint/bin/eslint.js src/components/psit
```

Attention à la casse : le dépôt contient `tests/` **et** `Tests/`. Sur Windows, un fichier créé
dans `tests/` peut être indexé par git sous `Tests/` ; vérifier `git status` avant de committer.
