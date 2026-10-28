# Mettre l’application en ligne sur Cloudflare

Cette version utilise **un Worker avec fichiers statiques et une base D1**. Il n’est pas nécessaire de créer un projet Pages distinct, d’acheter un domaine, de conserver un ordinateur allumé ou d’héberger Python. Le lien gratuit est du type `https://asc-feuille-semaine.<votre-sous-domaine>.workers.dev` ; le lien exact est fourni après déploiement.

Le PDF et l’ODS sont générés sur le téléphone ou l’ordinateur. Le PDF reprend le fond du modèle original ASC sur une page A4 ; la génération sur Cloudflare ne dépend pas de LibreOffice. Les traitements coûteux (PDF et dérivation du code) s’exécutent sur l’appareil, pour réduire l’usage du Worker. Le code personnel est dérivé avec PBKDF2-SHA256, 100 000 itérations ; D1 conserve un vérificateur SHA256 du résultat, avec un sel aléatoire, jamais le code en clair. Les sessions durent 24 h et utilisent un cookie HttpOnly/Secure/SameSite=Strict. Dix tentatives dans une fenêtre de 15 minutes bloquent temporairement l’adresse réseau.

Pour un usage personnel modéré, cette architecture vise les offres gratuites Workers et D1, dans leurs quotas. Aucun abonnement payant n’est activé par les fichiers du projet. Vérifier les limites affichées par Cloudflare à la création ; une gratuité illimitée ne peut être garantie. La synchronisation nécessite Internet et la même adresse d’application sur les deux appareils. Conserver des sauvegardes JSON régulières.

## Depuis le navigateur, sans installer sur l’ordinateur

### 1. Mettre le projet sur GitHub

Le dépôt prévu est `garcialexandre66-lgtm/Feuille-de-semaine-automatisation`. Les fichiers doivent être présents sur sa branche principale avant que Cloudflare puisse les importer. Une archive locale ou un projet seulement présent dans la conversation ne suffit pas.

Le dépôt doit contenir notamment `package.json`, `package-lock.json`, `wrangler.jsonc`, `static/`, `cloudflare/` et `templates/`. Ne jamais envoyer `.dev.vars`, `.env`, `data/`, `.wrangler/`, les sauvegardes des semaines ou les codes personnels. `.gitignore` les exclut des ajouts Git normaux.

### 2. Créer la base gratuite

Dans Cloudflare : **Storage & databases → D1 SQL Database → Create database** (le libellé peut varier selon la langue).

- Nom : `asc-semaines`.
- Conserver l’offre gratuite.
- Copier l’identifiant de la base (Database ID), qui n’est pas un mot de passe.
- Dans GitHub, modifier `wrangler.jsonc` : remplacer uniquement `00000000-0000-0000-0000-000000000000` par cet identifiant, puis enregistrer.

### 3. Importer dans Workers & Pages

Dans **Workers & Pages → Create application**, choisir l’import/la connexion d’un **dépôt Git**, puis GitHub. Sélectionner le dépôt et sa branche principale.

Paramètres du projet :

| Champ | Valeur |
| --- | --- |
| Nom du Worker | `asc-feuille-semaine` |
| Répertoire racine | racine du dépôt |
| Installation des dépendances, si demandé | `npm ci` |
| Build command, si demandé | `npm run build` |
| Deploy command | `npm run deploy` |

Le script vérifie l’identifiant D1, prépare les fichiers, applique la migration SQL sans supprimer les semaines existantes, puis déploie le Worker. Si Cloudflare signale une permission manquante pour D1, son autorisation de build doit inclure l’accès à la base de ce compte. Ne pas modifier le code ou rendre la base publique pour contourner cette erreur.

Ne pas choisir « Upload static files » pour publier seulement `dist/` : cela n’installerait pas la connexion ni la synchronisation.

### 4. Créer la clé d’installation dans Cloudflare

Dans le Worker déployé : **Settings → Variables and Secrets → Add**.

- Nom : `SETUP_TOKEN`.
- Type : **Secret**.
- Valeur : une longue clé aléatoire et privée, créée avec votre gestionnaire de mots de passe (au moins 16 caractères, 32 ou plus recommandés).

Enregistrer/déployer la modification. Ne pas entrer cette clé dans GitHub, dans le chat ni dans le fichier de configuration.

### 5. Choisir son code personnel

Ouvrir le lien `workers.dev` fourni par Cloudflare. Le premier écran affiche « Première installation ».

1. Entrer la clé d’installation `SETUP_TOKEN` créée à l’étape précédente.
2. Choisir son code personnel (8 caractères minimum ; une longue phrase unique est préférable).
3. Le confirmer et créer l’espace.
4. Se connecter avec ce code.

L’installation est automatiquement désactivée après la création de l’espace ; un tiers ne peut pas la relancer pour changer le code. Le secret `SETUP_TOKEN` peut ensuite être supprimé des paramètres Cloudflare : il n’est plus utilisé pour les connexions.

Ouvrir la **même adresse** sur le téléphone et l’ordinateur, puis utiliser le même code. Ajouter le lien à l’écran d’accueil depuis Safari ou Chrome. Après une première connexion en ligne sur cet appareil et la préparation du cache, la saisie peut se poursuivre hors connexion. La copie locale est chiffrée et les modifications se synchronisent au retour du réseau. Le stockage du navigateur doit être disponible ; il ne s’agit pas d’une application installée depuis un store.

### 6. Retrouver ses anciennes semaines

Dans l’ancienne application, télécharger « Sauvegarder mes semaines ». Dans la nouvelle, se connecter puis « Importer une sauvegarde ». Les semaines aux mêmes dates sont remplacées seulement après confirmation. Une base SQLite Python existante n’est pas migrée automatiquement dans D1.

## Depuis son propre ordinateur avec Node.js

Node.js 22 ou plus récent et npm sont requis. La même configuration fonctionne en ligne de commande :

```sh
npm ci
npx wrangler login
npx wrangler d1 create asc-semaines
```

Reporter l’identifiant obtenu dans `wrangler.jsonc`, puis :

```sh
npm run deploy
npx wrangler secret put SETUP_TOKEN
```

La dernière commande demande la clé dans le terminal. Terminer l’installation depuis le site comme indiqué ci-dessus. Ne pas copier de secret dans une commande ou un fichier suivi par Git.

## Développement et vérifications

Aucun compte Cloudflare n’est requis pour les tests locaux :

```sh
npm ci
npm run build
npm test
npm run db:local
npm run dev
```

Pour l’installation locale uniquement, mettre une clé d’installation dans `.dev.vars` avec le nom `SETUP_TOKEN`. Ce fichier est ignoré par Git et ne doit pas être envoyé sur GitHub. Le test navigateur crée sa propre clé éphémère et sa propre base, sans `.dev.vars` :

```sh
npm run test:browser
```

Ce test demande Python, Playwright, Chromium et PyMuPDF sur la machine de développement ; ces outils ne sont pas nécessaires en production ni pour générer le PDF sur téléphone. Il vérifie les trois écrans, le bilan et le bloc-notes, les favoris, les statuts, le rappel calendrier, le partage, l’installation initiale, les connexions de deux appareils, la fermeture puis la réouverture hors connexion, la fusion au retour du réseau, le stockage D1, les exports navigateur et le contenu du PDF (atelier, client, congé, maladie, totaux et heures supplémentaires).

Vérification de compilation sans publication : `npx wrangler deploy --dry-run`. Les tests locaux et le dry run ne constituent pas une validation sur un vrai compte Cloudflare.

## Entretien

- Sauvegarder régulièrement les semaines en JSON et protéger ces fichiers.
- D1 contient les semaines, les vérificateurs du code et les sessions. Protéger l’accès au compte Cloudflare et activer son authentification multifacteur.
- La perte du code personnel nécessite une intervention de l’administrateur ; aucun bouton de réinitialisation public n’est exposé.
- Les empreintes des codes Python (scrypt) et Cloudflare (PBKDF2) sont différentes : choisir le code de la nouvelle version lors de son installation.
- Une archive synchronisée est limitée à 1,5 Mo et 1000 semaines pour rester sous les limites de ligne D1. Une limite dépassée est signalée sans effacer les données existantes.
