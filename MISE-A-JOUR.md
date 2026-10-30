# Nouvelle feuille de semaine

En bas de l’accueil, « Total de la semaine » montre toutes les heures saisies de la semaine affichée, y compris les interventions de week-end si elles existent. À 35 h ou moins, le chiffre reste normal. Au-delà de 35 h, il devient rouge et le dépassement apparaît juste dessous : par exemple, 37 h et « +2 h 00 d’heures sup ». Le lien « Consulter vos heures sup » ouvre directement le compteur total suivi, avec les RTT pris et prévus et le solde de départ s’il a été renseigné.

Dans la colonne H.SUP des exports, le calcul journalier demandé reste distinct : 9 h donnent 1 h supplémentaire ; 6 h donnent zéro. Une semaine de 8 h, 8 h, 8 h, 7 h et 6 h donne zéro dans ces cases journalières. Dans le PDF, une case H.SUP vide signifie zéro. Plusieurs lignes d’une même journée sont additionnées avant d’appliquer le seuil de 8 h ; le seuil repart à zéro le lendemain.

Le compteur de récupération dans le récapitulatif mensuel reste séparé, avec le contrat de 35 h confirmé par l’utilisateur : dépassements hebdomadaires saisis, moins les RTT pris (8 h par journée déjà définie dans l’application). Les RTT futurs restent réservés séparément. Les saisies futures ne créent pas de crédit. Un montant confirmé pour une semaine remplace son calcul automatique ; une correction recalcule cette semaine sans doublon. Ce suivi reste une estimation à comparer au décompte de la secrétaire, sans inventer de majoration ni de prime.

Pour inclure les anciennes heures, ouvrir « Consulter vos heures sup » → Renseigner mon solde de départ : choisir la date de début et, s’il est connu, le solde à cette date. Quand le départ est inconnu, ce compteur montre quand même les mouvements suivis, sans les présenter comme le solde total. L’historique et le point de départ restent conservés.

La mise à jour s’installe par GitHub, puis par le déploiement Cloudflare déjà relié au dépôt. Rien à coller dans Google Sheets ou Apps Script. Les données personnelles restent dans la base existante.

## Vérifier sur téléphone ou ordinateur

1. Attendre que la dernière version Cloudflare indique Ready ou déploiement réussi. Actualiser l’application avec Internet. Si elle propose « Actualiser l’application », appuyer sur ce bouton. Ne pas effacer ses données de navigation.
2. L’accueil doit montrer une semaine avec deux flèches, cinq cartes et un bouton « Vérifier et télécharger le PDF ». La roue en haut ouvre les réglages.
3. Choisir la semaine du 5 octobre 2026 avec les flèches ou Réglages → Retrouver une semaine. Le titre doit indiquer « Semaine du 05/10 au 09/10 » et 2026.
4. Appuyer sur une carte : cette journée s’ouvre. Appuyer sur une autre ferme la première. Ajouter ou modifier une ligne dans le formulaire, puis appuyer sur Enregistrer. Les numéros de bon peuvent être renseignés. Une ligne chez un client sans aucun des deux numéros est signalée ; les journées à l’atelier, à l’école et les absences n’en demandent pas.
5. Fermer la carte, puis appuyer sur « Vérifier et télécharger le PDF ». Une journée vide, un bon manquant, une journée dépassant dix heures ou une entrée le week-end apparaît dans la liste. « Revenir à ma semaine » annule sans téléchargement. « Télécharger quand même » génère la version lundi à vendredi.
6. Le fichier attendu s’appelle `Semaine du 05-10-2026 au 09-10-2026.pdf`. Son en-tête indique `Semaine du 05/10/2026 au 09/10/2026`. Il doit contenir uniquement lundi, mardi, mercredi, jeudi, vendredi et huit lignes par jour. Ni cases ni libellés samedi et dimanche. Le format A4, le logo, les colonnes, les coordonnées des cinq journées et les formules de total sont conservés.
7. Une intervention de week-end reste dans les données et apparaît dans le bloc Astreinte. Ses heures ne sont pas déplacées vers un autre jour et ne sont pas ajoutées au PDF du lundi au vendredi. Pour ajouter une nouvelle intervention de week-end : Réglages → Ajouter une intervention le week-end.
8. Réglages → Mon récapitulatif mensuel : heures, dépassement hebdomadaire déjà utilisé par l’application et détail des interventions de week-end. Ces dernières sont déjà incluses dans les heures saisies : le détail ne les additionne pas une deuxième fois. Aucune prime d’astreinte n’est inventée.

Le total travaillé conserve la formule minutes de trajet + TPE + régie + chantier + SAV. H.SUP indique le dépassement de 8 h par jour demandé par l’utilisateur ; le suivi de récupération sur 35 h reste dans le récapitulatif mensuel. Ce paramétrage ne constitue pas une validation de la règle de paie de l’employeur. Les lignes ne portent pas de date autonome : la référence est leur semaine enregistrée et le jour auquel elles appartiennent, jamais le nom ancien d’un modèle ni la date du téléchargement.

## Envoi automatique et classement Drive

Le code est livré, mais l’envoi reste désactivé tant qu’une connexion Google propre à cette application n’est pas configurée et autorisée. Le compte Google connecté à Codex ne donne pas ses accès à l’application hébergée.

Pour l’administrateur, une seule fois :

1. Dans Google Cloud, activer Gmail API et Google Drive API, puis configurer l’écran de consentement Google Auth pour son compte. Créer un client OAuth de type Application Web.
2. Ajouter comme URI de redirection autorisé `https://ADRESSE-EXACTE-DE-L-APPLICATION/api/google/callback`. Utiliser l’adresse de l’application réellement déployée.
3. Dans Cloudflare → le Worker → Settings → Variables and Secrets, ajouter `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (type Secret), et `APP_ORIGIN` (l’adresse HTTPS exacte de l’application, sans barre finale). Ne jamais les mettre dans GitHub, un fichier de sauvegarde ou le chat.
4. Déployer puis ouvrir Réglages → Envoi du vendredi et classement dans Drive → Connecter Gmail et Drive. Autoriser le compte expéditeur. Renseigner le destinataire, l’adresse qui reçoit la copie et l’heure du vendredi en heure de Paris, puis activer et enregistrer.

L’application demande l’autorisation d’envoyer les feuilles avec Gmail et d’accéder aux fichiers Drive qu’elle crée. Le jeton de renouvellement est chiffré dans la base D1 avec une clé dérivée du secret OAuth. Un changement de ce secret impose de reconnecter Google. En mode de test Google, l’autorisation peut expirer après sept jours : vérifier la configuration de publication du client OAuth pour un usage durable.

Le contrôle s’effectue tous les quarts d’heure le vendredi, avec passage heure d’été/hiver automatique. L’envoi utilise uniquement les données synchronisées sur le serveur. Si la feuille présente un point à vérifier, il est mis en attente et le motif apparaît dans les réglages. Corriger la feuille permet de reprendre au contrôle suivant du même vendredi. Une entrée de week-end bloque l’envoi automatique : elle requiert une décision humaine ; le téléchargement manuel reste possible après vérification.

Le PDF est classé dans `Feuilles de semaine/AAAA-MM/`, le mois étant celui du lundi de la semaine. Le même PDF est joint à l’e-mail, avec copie. Une semaine déjà envoyée ne repart pas automatiquement après modification. Les erreurs d’envoi ambiguës ne sont pas relancées automatiquement : vérifier Gmail et utiliser le partage manuel pour éviter un doublon. Le dernier résultat apparaît dans les réglages. Aucun envoi réel n’a été effectué pendant les tests.

Références de configuration : [OAuth Google](https://developers.google.com/identity/protocols/oauth2/web-server), [envoi Gmail](https://developers.google.com/workspace/gmail/api/guides/sending), [fichiers Drive](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [déclencheurs Cloudflare](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

## Pour réinstaller le code complet

L’archive du code contient le projet entier, sans dépendances installées ni données personnelles. Remplacer les fichiers correspondants du dépôt en conservant les chemins et la configuration D1 existante. Ne pas copier le contenu dans une seule page HTML et ne pas modifier le Google Sheet pour cette mise à jour. Le déploiement existant exécute `npm run deploy`, qui compile et applique les migrations sans supprimer les semaines.

Commandes de vérification : `npm ci`, `npm test`, `npm run build`, `npx wrangler deploy --dry-run`. Les tests de messagerie et de Drive simulent Google : ils ne contactent aucun destinataire réel.
