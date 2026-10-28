# Feuille de semaine · ASC Electronique

**Version Cloudflare gratuite disponible : voir [CLOUDFLARE.md](CLOUDFLARE.md).** Elle conserve les fonctions et génère PDF/ODS dans le navigateur, avec un Worker et une base D1 pour la connexion et la synchronisation. Les instructions Python ci-dessous restent valables pour un hébergement classique.

Application en français adaptée au téléphone et à l’ordinateur. Python 3.10+ et LibreOffice (`libreoffice` ou `soffice`) pour le PDF ; aucune dépendance Python tierce pour le serveur.

## Démarrer et protéger son espace

Depuis le dépôt, créer son code personnel une seule fois :

```sh
python3 server.py --set-code
python3 server.py
```

Le code est demandé dans le terminal, sans affichage. Minimum 8 caractères ; privilégier une phrase longue et unique. Ne pas mettre de code dans les sources ou dans une commande shell. `--set-code` permet également de remplacer un code oublié : les semaines sont conservées et toutes les sessions sont révoquées. Aucun code par défaut n’est créé. Sans cette initialisation, l’application refuse la connexion.

Port 8000, adresse locale par défaut. Pour un accès réseau privé : `HOST=0.0.0.0 python3 server.py`. Pour un hébergement, placer le serveur derrière un proxy HTTPS, conserver `ASC_COOKIE_SECURE=1` (valeur par défaut) et configurer un volume persistant pour `ASC_DATA_DIR`. Les cookies sécurisés fonctionnent sur localhost pour les tests. Uniquement pour un test HTTP sur un réseau local de confiance, `ASC_COOKIE_SECURE=0` permet l’envoi du cookie sur une adresse IP locale ; ne pas utiliser ce réglage sur Internet.

Le serveur Python reste nécessaire : Cloudflare Pages seul ne peut pas exécuter cette version Python ni LibreOffice. Cloudflare peut servir de proxy HTTPS vers un hébergement Python compatible et persistant ; la version Workers/D1 livrée dans ce dépôt est décrite dans CLOUDFLARE.md. La mise en ligne n’est pas incluse dans ces changements.

## Une application en trois écrans

- **Ma journée** : navigation du lundi au vendredi uniquement, choisir la date, ajouter son travail ou remplir 8 h à l’atelier. Congés, maladie et copie restent accessibles dans « Congé, maladie ou copie d’une journée ».
- **Mes semaines** : choisir une semaine, partager ou télécharger le PDF et renseigner « Envoyée ». L’historique présente aussi le statut. Une correction du nom ou des lignes transforme automatiquement « Envoyée » en « À renvoyer ». Aucun mail n’est envoyé par le bouton de statut.
- **Mon bilan** : heures travaillées et supplémentaires du mois, jours de congé et de maladie séparés. Seules les journées qui appartiennent au mois sont comptées, y compris si une semaine commence le mois précédent. Le bloc-notes présente automatiquement le détail hebdomadaire au-delà de 35 h, rattaché au mois du vendredi de fin de semaine ; les notes personnelles sont modifiables et synchronisées. Une exportation texte permet de conserver le bilan.

Le nom, les favoris, les couleurs, les sauvegardes, le rappel et le verrouillage sont regroupés dans **Réglages**.

## Espace personnel et synchronisation

Sur chaque appareil, ouvrir la même adresse et utiliser le même code. Il s’agit d’un espace personnel unique. La version Python conserve les données dans SQLite dans `data/asc.sqlite3` (ou `ASC_DATA_DIR`), la version Cloudflare dans D1. Les données et secrets ne doivent pas être publiés dans Git. Les sessions utilisent des cookies HttpOnly et SameSite=Strict, Secure par défaut, valables 24 heures ; les codes ne sont pas conservés en clair.

Les modifications sont envoyées automatiquement. Les autres appareils relisent le serveur toutes les 15 secondes, au retour sur l’onglet ou avec Synchroniser. Les journées distinctes modifiées sur deux appareils sont réunies automatiquement ; les notes, favoris et statuts sont également conservés lorsqu’ils ne se contredisent pas. Si la même journée ou la même note est modifiée différemment, un choix explicite est demandé sans écrasement silencieux. Une sauvegarde JSON est disponible avant ce choix.

## Hors connexion

Dans la version Cloudflare, se connecter une première fois en HTTPS, avec Internet, sur chaque appareil. L’application prépare ses fichiers avec un service worker. Les réponses de l’API et les données personnelles ne sont jamais placées dans son cache. Les données et modifications en attente sont sauvegardées dans IndexedDB, chiffrées avec AES-GCM. La clé locale est dérivée du code avec PBKDF2-SHA256 (100 000 itérations et sel local distinct). Une clé de session reste dans sessionStorage pour éviter de redemander le code à chaque actualisation du même onglet ; le verrouillage la supprime.

Il est ensuite possible de fermer puis rouvrir sans réseau, saisir des journées, consulter le bilan et générer PDF/ODS. Dans un nouvel onglet hors ligne, le code personnel déverrouille les données locales. Les modifications sont synchronisées automatiquement au retour du réseau ; si la session serveur a expiré, le code est redemandé. Un changement du code serveur ne peut pas effacer à distance une copie hors ligne déjà téléchargée.

Le mode hors connexion dépend des capacités et du stockage du navigateur. Un navigateur privé, l’effacement des données ou l’éviction du stockage par le système peuvent supprimer la copie locale. Conserver des sauvegardes JSON ; ces fichiers sont en clair et doivent rester privés. La version Python profite aussi du stockage local chiffré mais ne prépare pas son interface pour une réouverture sans réseau.

## Récupération et école

Contrat de 35 h : une semaine saisie de 39 h propose 4 h de crédit. Le compteur dans Mon bilan demande une validation explicite par semaine (à partir du vendredi). Une seconde validation remplace la première, sans doublon. Une correction des journées invalide le crédit et demande une revalidation. Le champ de crédit reste vérifiable/modifiable pour les semaines incomplètes ou avec absence, dont la règle doit être confirmée avec l’entreprise.

Le solde de départ est **inconnu par défaut**. Le compteur affiche alors uniquement les mouvements suivis depuis la date de début ; il ne présente pas ce résultat comme le solde réel. Le solde de départ peut être renseigné ultérieurement avec sa date de référence. Les crédits plus anciens que le début du suivi ne sont pas inclus.

Une journée « Récupération — 8 h » porte la mention Récupération sur la feuille, sans heures travaillées. Elle déduit 8 h si elle est passée ou réservée si elle est future. Les jours de récupération ne sont pas ajoutés automatiquement aux heures travaillées pour calculer un crédit ; vérifier la règle de l’entreprise pour une semaine comportant une récupération ou une autre absence.

Réglages → Mon planning d’école permet de marquer les dates prévues (lundi au vendredi). Un planning préparé peut être importé en JSON (liste de dates ISO ou objet contenant `dates`), sans remplacer les autres données personnelles. Ces dates ne créent ni heures effectuées ni crédit. Le choix « École — heures effectuées » dans la saisie quotidienne permet ensuite de renseigner la durée réelle de formation ; ces heures sont portées en TPE avec le libellé École et comptent dans les 35 h. Une semaine d’école de 39 h peut être confirmée explicitement dans le compteur pour 4 h de crédit. Cette confirmation ne remplit pas des horaires journaliers inconnus dans le PDF. Le planning réel fourni par l’utilisateur doit être relevé à partir d’un document suffisamment lisible ; aucune date n’est devinée.

Le samedi et le dimanche sont retirés de la saisie quotidienne. Les sept jours du modèle original sont conservés en données et à l’export, afin que le samedi de congé soit bien compté et affiché sans saisir de travail le week-end.

Dans les exports, H.SUP est désormais le dépassement de 35 h **sur la semaine entière**, réparti sur les dernières lignes, sans additionner les dépassements quotidiens. Le repère de 8 h dans Ma journée reste un objectif journalier, pas le calcul du crédit.

## Partage, favoris et rappel

« Partager le PDF » ouvre le menu du téléphone lorsque le navigateur prend en charge le partage de fichiers. Si une nouvelle action est nécessaire après la préparation, le bouton indique « Partager le PDF prêt ». L’annulation ne marque jamais une semaine envoyée. Si le partage natif est indisponible, le PDF est téléchargé pour être joint manuellement au mail.

Un favori mémorise un client, une localité et le trajet aller-retour en minutes. Il peut être créé depuis Réglages ou à la dernière étape d’une intervention ; il préremplit la saisie sans recopier les heures du chantier.

Le vendredi, un rappel dans l’application apparaît pour la semaine courante non envoyée. Pour un rappel même application fermée, « Ajouter aussi le rappel au calendrier du téléphone » télécharge un événement récurrent chaque vendredi à 17 h, heure de Paris, avec alarme. Il faut importer et accepter cet événement dans un calendrier compatible, une seule fois. Aucune notification push automatique n’est promise lorsque l’application est fermée.

## Saisie

Choisir une semaine (la date est ramenée au lundi), puis un jour. Ajouter jusqu’à huit lignes par jour en quatre étapes : lieu, trajet/TPE, heures, vérification. Les étapes Précédent/Suivant conservent la saisie ; la dernière étape enregistre. Fermer le formulaire abandonne la saisie non enregistrée.

- « À l’entreprise » affiche seulement le TPE : trajet et autres catégories sont à zéro. La ligne exportée s’appelle **Atelier ASC**.
- « Journée à l’atelier — 8 h » crée directement une ligne Atelier ASC de 480 minutes de TPE. Si la journée est remplie, un remplacement doit être confirmé.
- Les clients des interventions antérieures sont proposés dans le champ Client ; leur sélection préremplit la dernière localité utilisée. La localité reste modifiable. Aucun carnet séparé n’est nécessaire.
- « Congé » et « Arrêt maladie » permettent de choisir un jour, la semaine affichée ou une période future (366 jours maximum). Pour les congés, le samedi est compté et le dimanche exclu : une semaine complète vaut 6 jours. Si la période se termine un vendredi, le samedi suivant est inclus. Les récupérations se posent uniquement du lundi au vendredi. Les week-ends restent optionnels pour la période d’arrêt maladie, selon les dates du certificat. Ces absences remplacent les journées choisies après confirmation si elles contiennent des interventions. Le PDF et l’ODS affichent le motif « Congé » ou « Arrêt maladie », sans heures travaillées ni supplémentaires. Supprimer la ligne d’absence permet de reprendre une saisie normale.
- « Copier une journée » permet de choisir une semaine et un jour, puis de copier toutes ses lignes dans le jour sélectionné. Une journée déjà remplie n’est remplacée qu’après confirmation. La copie est indépendante de l’original.
- L’historique liste les semaines non vides et leur total. Sélectionner une semaine permet de la revoir, la modifier ou télécharger à nouveau son PDF.

Les trajets aller-retour sont saisis en minutes. Les autres durées acceptent `2h30`, `2:30` ou `2h` ; un nombre entier seul signifie des heures. Total = trajet + TPE + régie + chantier + SAV. Heures supplémentaires = maximum de zéro et total hebdomadaire moins 35 h ; elles ne sont pas ajoutées une seconde fois au total.

## Couleurs de l’application

Le bouton « Couleurs » dans l’en-tête ouvre une roulette, un curseur et cinq palettes. Le thème s’applique à toutes les pages et aux formulaires. Le contraste des accents est adapté à la teinte choisie. La préférence est mémorisée uniquement sur cet appareil ; elle ne modifie ni les semaines synchronisées, ni le modèle du PDF, ni l’icône installée. La roulette est également utilisable au clavier avec les flèches. « Couleurs d’origine » rétablit la palette par défaut.

## PDF et ODS

Le bouton principal génère un PDF prêt à joindre manuellement au mail de la secrétaire. Il reprend le modèle fourni, sur une page A4. Les bons de préparation et d’intervention restent vides. Les ajustements d’impression se font sur une copie temporaire ; le modèle original reste intact.

L’ODS peut aussi être téléchargé. Les durées exportées sont des textes lisibles ; aucun recalcul n’est effectué si le fichier est modifié manuellement dans un tableur. Les exports nécessitent une session connectée. Aucun envoi de mail automatique ni convertisseur XLSX.

## Validation

```sh
python3 -m unittest discover -s tests -v
node --check static/app.js
node --check static/sync.js
```

Tests navigateur optionnels : Playwright et Chromium requis, LibreOffice et pdftotext pour le test PDF. Ils utilisent une base temporaire et un code de test, sans configurer l’espace personnel réel :

```sh
python3 tests/browser_features.py
python3 tests/browser_wizard.py
python3 tests/browser_workshop.py
```
