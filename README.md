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

## Espace personnel et synchronisation

Sur chaque appareil, ouvrir la même adresse et utiliser le même code. Il s’agit d’un espace personnel unique, pas d’un service multiutilisateur. Les semaines sont conservées dans SQLite dans `data/asc.sqlite3` (ou `ASC_DATA_DIR`). Sauvegarder ce répertoire sur l’hébergement ; ne pas le publier dans Git. Le code est conservé sous forme de dérivé scrypt salé. Les sessions sont des cookies HttpOnly, SameSite=Strict, Secure par défaut, valables 24 heures. Dix tentatives incorrectes dans une fenêtre de 15 minutes bloquent temporairement les tentatives de cette adresse réseau. Le bouton Verrouiller ferme la session de cet appareil.

Les modifications sont envoyées automatiquement après une courte pause. Les autres appareils relisent le serveur toutes les 15 secondes, au retour sur l’onglet ou avec Synchroniser. La lecture est suspendue pendant un formulaire ouvert ou la saisie du nom. Un numéro de révision empêche l’écrasement silencieux des modifications d’un autre appareil. En cas de conflit, sauvegarder sa version JSON puis choisir explicitement la version du serveur ou remplacer celle-ci. Il n’y a pas de fusion automatique entre deux modifications concurrentes.

Les modifications non synchronisées restent en mémoire : garder l’onglet ouvert ou télécharger une sauvegarde en cas de coupure réseau. Elles ne survivent pas à la fermeture de l’onglet. Aucune nouvelle donnée personnelle n’est mise en cache dans localStorage. Les anciennes données locales restent accessibles via « Importer les semaines de cet ancien navigateur » après connexion ; l’import est explicite. Les fichiers JSON contiennent les semaines en clair : les conserver dans un endroit privé.

## Saisie

Choisir une semaine (la date est ramenée au lundi), puis un jour. Ajouter jusqu’à huit lignes par jour en quatre étapes : lieu, trajet/TPE, heures, vérification. Les étapes Précédent/Suivant conservent la saisie ; la dernière étape enregistre. Fermer le formulaire abandonne la saisie non enregistrée.

- « À l’entreprise » affiche seulement le TPE : trajet et autres catégories sont à zéro. La ligne exportée s’appelle **Atelier ASC**.
- « Journée à l’atelier — 8 h » crée directement une ligne Atelier ASC de 480 minutes de TPE. Si la journée est remplie, un remplacement doit être confirmé.
- Les clients des interventions antérieures sont proposés dans le champ Client ; leur sélection préremplit la dernière localité utilisée. La localité reste modifiable. Aucun carnet séparé n’est nécessaire.
- « Congé » et « Arrêt maladie » permettent de choisir un jour, la semaine affichée ou une période future (366 jours maximum). Les samedis et dimanches sont exclus par défaut, avec une option pour les inclure. Ces absences remplacent les journées choisies après confirmation si elles contiennent des interventions. Le PDF et l’ODS affichent le motif « Congé » ou « Arrêt maladie », sans heures travaillées ni supplémentaires. Supprimer la ligne d’absence permet de reprendre une saisie normale.
- « Copier une journée » permet de choisir une semaine et un jour, puis de copier toutes ses lignes dans le jour sélectionné. Une journée déjà remplie n’est remplacée qu’après confirmation. La copie est indépendante de l’original.
- L’historique liste les semaines non vides et leur total. Sélectionner une semaine permet de la revoir, la modifier ou télécharger à nouveau son PDF.

Les trajets aller-retour sont saisis en minutes. Les autres durées acceptent `2h30`, `2:30` ou `2h` ; un nombre entier seul signifie des heures. Total = trajet + TPE + régie + chantier + SAV. Heures supplémentaires = maximum de zéro et total journalier moins 8 h ; elles ne sont pas ajoutées une seconde fois au total.

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
