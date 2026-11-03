# Livraison du 3 novembre 2026

L’application a été revue pour rendre les actions du quotidien plus lisibles sur téléphone, tout en conservant les règles de calcul, les exports et les données existantes.

## Ce qui change dans l’interface

- Navigation fixe et discrète : **Semaine**, **Calendrier**, **Bilan**.
- Nouveau résumé de semaine en haut : total, objectif de 35 h, progression et journées terminées.
- Dates plus courtes, numéro de semaine et retour rapide à la semaine courante.
- Présentation harmonisée : bleu de l’application, boutons cohérents, icônes SVG, contrastes renforcés, espacements et fenêtres plus soignés.
- État de synchronisation visible et cliquable : à jour, enregistré sur cet appareil, hors connexion ou à vérifier.
- Fin des longs messages répétitifs d’enregistrement dans la page principale.
- La reprise de la veille apparaît seulement lorsqu’une journée est disponible.
- Formulaire structuré ; numéros de bon facultatifs repliés. À l’école ou à l’atelier, les champs de chantier inutiles sont masqués.
- Historique des semaines avec recherche par date, mois, ville ou client, y compris sans accents.
- Bilan mensuel réorganisé : chiffres du mois, récupération et notes ; explications et réglages du compteur repliés.
- Calendrier navigable au clavier, avec un seul arrêt de tabulation dans les dates et des flèches pour les parcourir.
- Possibilité d’afficher temporairement le code lors de la connexion ; il est de nouveau masqué au verrouillage.

## Problèmes identifiés et corrigés

| Avant | Maintenant |
| --- | --- |
| Un brouillon pouvait disparaître en fermant le formulaire ou en quittant des heures modifiées sur place. | Confirmation avant abandon, navigation ou actualisation ; refuser conserve les champs. |
| Une tâche retirée disparaissait immédiatement. | Le bouton **Annuler** permet de la restaurer sans écraser une autre tâche. |
| Le rappel du vendredi était rendu invisible par une règle de style. | Il redevient visible quand les conditions du rappel sont réunies. |
| Le rechargement revenait à la semaine courante. | La semaine et la journée consultées sont conservées dans l’onglet. |
| Un refus du serveur pouvait être présenté comme une absence de connexion. | Le refus est expliqué et la copie locale reste disponible. |
| Une reconnexion ou une fusion distante pouvait redessiner les heures en cours de modification. | La saisie reste affichée ; les données distantes sont conservées et les modifications concurrentes restent contrôlées lors de l’enregistrement. |
| Le cache pouvait mélanger les fichiers de différentes versions pendant un déploiement. | HTML et scripts utilisent la même version installée ; une mise à jour reste explicite. |

## Vérifications

- Compilation de production réussie.
- **37 tests Node réussis** : authentification, D1, conflits, données, tâches, calculs, PDF, envoi programmé simulé et cache.
- **9 tests Python réussis** : stockage et exports.
- Parcours navigateur des dix améliorations quotidiennes : saisie, annulation, notes, favoris, PDF, sauvegarde et rechargement hors connexion.
- Parcours calendrier et tâches : dates, années bissextiles, week-ends vides, listes indépendantes et synchronisation.
- Audit navigateur de la nouvelle interface : brouillons, erreurs serveur, rappel, recherche et navigation à 320, 375, 390, 768 et 1280 px.
- Actualisation et remplacement du service worker, maintien de la session dans l’onglet, verrouillage d’un nouvel onglet, récupération des modifications hors connexion.
- Brouillon Gmail, téléchargement du PDF et partage natif vérifiés en simulation, sans envoyer de mail.

Les parcours utilisent une base D1 de test et des données de démonstration. Les semaines personnelles de production n’ont pas été utilisées pour les tests. Les contrôles visuels ont été réalisés sous Chromium ; ils ne remplacent pas un essai sur un iPhone physique.

## Découvrir la mise à jour

Dans l’application, appuyer sur **Actualiser** en haut, ou sur **Actualiser l’application** lorsque la mise à jour est proposée. Les notes, tâches, favoris et semaines restent enregistrés.

Commandes de contrôle : `npm test`, `npm run test:everyday`, `npm run test:calendar`, `npm run test:pro`, `npm run test:refresh`, `python -m unittest discover -s tests -p 'test_*.py'`. Les parcours navigateur nécessitent Playwright et Chromium comme indiqué dans la documentation du projet.
