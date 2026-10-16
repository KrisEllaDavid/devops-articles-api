# Articles API — industrialisation DevOps

[![CI/CD](https://github.com/KrisEllaDavid/devops-articles-api/actions/workflows/ci-cd.yml/badge.svg?branch=devops)](https://github.com/KrisEllaDavid/devops-articles-api/actions/workflows/ci-cd.yml)

API REST de gestion d'articles (Node.js / Express / PostgreSQL), conteneurisée avec Docker et livrée automatiquement par un pipeline **GitHub Actions** qui publie l'image dans le **GitHub Container Registry (GHCR)** puis la déploie sur un runner.

---

## Sommaire

1. [Structure du projet](#structure-du-projet)
2. [Exécution locale](#exécution-locale)
3. [Fonctionnement du pipeline](#fonctionnement-du-pipeline)
4. [Déploiement sur un runner local (self-hosted)](#déploiement-sur-un-runner-local-self-hosted)
5. [Reproduire l'environnement GitHub](#reproduire-lenvironnement-github)
6. [Gestion Git](#gestion-git)
7. [Référence de l'API](#référence-de-lapi)

---

## Structure du projet

```text
.
├── .github/workflows/ci-cd.yml   # Pipeline : test → lint → build & push → deploy
├── src/
│   ├── server.js                 # Application Express (routes /articles, /health)
│   └── database.js               # Pool PostgreSQL + création du schéma
├── tests/articles.test.js        # Tests d'intégration (Jest + Supertest)
├── Dockerfile                    # Image de production multi-stage, non-root
├── .dockerignore                 # Contexte de build minimal, sans secrets
├── docker-compose.yml            # Stack API + PostgreSQL (local et déploiement)
├── .env.example                  # Modèle des variables d'environnement
├── .gitignore / .gitattributes   # Exclusions Git, fins de ligne LF
└── package.json
```

### Variables d'environnement

| Variable       | Défaut        | Description                                               |
| -------------- | ------------- | --------------------------------------------------------- |
| `PORT`         | `3000`        | Port d'écoute de l'API (dans le conteneur)                |
| `DB_HOST`      | `localhost`   | Hôte PostgreSQL (forcé à `db` avec docker compose)        |
| `DB_PORT`      | `5432`        | Port PostgreSQL                                           |
| `DB_NAME`      | `articles_db` | Nom de la base                                            |
| `DB_USER`      | `article`     | Utilisateur                                               |
| `DB_PASSWORD`  | `article`     | Mot de passe — **à surcharger hors développement**        |
| `API_PORT`     | `3000`        | *(compose)* Port publié sur l'hôte pour l'API             |
| `DB_HOST_PORT` | `5432`        | *(compose)* Port publié sur `127.0.0.1` pour PostgreSQL   |
| `API_IMAGE`    | `articles-api:local` | *(compose)* Image à exécuter (registre ou build local) |

> Le fichier `.env` contient des identifiants : il est exclu de Git. Seul `.env.example` est versionné.

---

## Exécution locale

### Prérequis

- [Docker](https://docs.docker.com/get-docker/) avec le plugin **Docker Compose v2**
- *(optionnel, hors conteneur)* Node.js 22 et npm

### Option 1 — Stack complète avec Docker Compose (recommandé)

```bash
git clone https://github.com/KrisEllaDavid/devops-articles-api.git
cd devops-articles-api
git switch devops

cp .env.example .env              # puis ajuster DB_PASSWORD
docker compose up -d --build      # build de l'image + démarrage API & PostgreSQL
docker compose ps                 # les deux services doivent être "healthy"
```

L'API est disponible sur <http://localhost:3000> :

```bash
curl http://localhost:3000/health
# {"status":"UP","database":"UP"}
```

Commandes utiles :

```bash
docker compose logs -f api        # suivre les logs de l'API
docker compose down               # arrêter (les données sont conservées)
docker compose down -v            # arrêter et supprimer le volume de données
```

### Option 2 — Exécuter l'image publiée sur GHCR

Aucun build local : on récupère l'image produite par le pipeline.

```bash
export API_IMAGE=ghcr.io/kriselladavid/devops-articles-api:devops
docker compose pull api
docker compose up -d --no-build
```

### Option 3 — Node.js sur la machine, PostgreSQL en conteneur

```bash
cp .env.example .env              # DB_HOST=localhost
docker compose up -d db           # PostgreSQL seul, exposé sur 127.0.0.1:5432
npm ci
npm run dev                       # redémarrage automatique (node --watch)
```

### Lancer les tests

Les tests d'intégration utilisent une vraie base PostgreSQL (la table `articles` est vidée avant chaque test — utilisez une base dédiée) :

```bash
docker compose up -d db
npm ci
npm test
```

---

## Fonctionnement du pipeline

Fichier : [`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml)

```text
   push (devops, main)
          │
   ┌──────┴──────┐
   ▼             ▼
┌──────┐    ┌──────────┐
│ test │    │   lint   │
└──┬───┘    └────┬─────┘
   └──────┬──────┘
          ▼
 ┌─────────────────┐       ghcr.io/kriselladavid/devops-articles-api
 │ build-and-push  │ ────► :devops  :sha-<commit>  :latest (branche par défaut)
 └────────┬────────┘
          ▼
 ┌─────────────────┐
 │     deploy      │  pull par digest → docker compose up --wait → smoke tests
 └─────────────────┘
```

### Déclencheurs

| Événement                         | Comportement                                                 |
| --------------------------------- | ------------------------------------------------------------ |
| `push` sur `devops` (ou `main`)   | Tests, lint, build **et publication** de l'image, déploiement |
| `pull_request` vers `main`        | Tests, lint et build **sans publication** ni déploiement      |
| `workflow_dispatch`               | Lancement manuel depuis l'onglet *Actions*                    |

Un nouveau push sur une branche annule le run encore en cours sur cette même branche (`concurrency`).

### Jobs

| Job                 | Rôle                                                                                                                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **test**            | `npm ci` puis `npm test` contre un conteneur de service PostgreSQL 16. Si un test échoue, aucune image n'est publiée.                                                                                                       |
| **lint**            | Analyse du `Dockerfile` avec [hadolint](https://github.com/hadolint/hadolint) (bonnes pratiques).                                                                                                                          |
| **build-and-push**  | Build Buildx (cache GitHub Actions), étiquetage via `docker/metadata-action` et push sur GHCR.                                                                                                                             |
| **deploy**          | Sur le runner cible : récupère l'image **par son digest** (exactement celle qui vient d'être construite), démarre la stack avec `docker compose up --wait` (attente des healthchecks), puis vérifie `/health` et `/articles`. Affiche les logs en cas d'échec. |

### Authentification au registre

Le pipeline n'utilise **aucun secret à créer** : l'authentification sur `ghcr.io` repose sur les variables prédéfinies de GitHub Actions :

- `github.actor` comme identifiant,
- `secrets.GITHUB_TOKEN` (jeton éphémère généré pour chaque run) comme mot de passe.

Les permissions du jeton sont réduites au minimum : `contents: read` par défaut, `packages: write` uniquement pour le job de build, `packages: read` pour le déploiement.

### Tags de l'image

| Tag                 | Exemple                     | Usage                                         |
| ------------------- | --------------------------- | --------------------------------------------- |
| nom de branche      | `:devops`                   | Dernière version de la branche                |
| SHA du commit       | `:sha-<sha complet>`        | Version immuable, traçable jusqu'au commit    |
| `latest`            | `:latest`                   | Uniquement sur la branche par défaut          |

L'image porte les labels OCI (`org.opencontainers.image.source`, `revision`, …) qui la relient au dépôt et au commit.

### Paramétrage (facultatif)

Dans *Settings → Secrets and variables → Actions* :

| Type     | Nom              | Défaut              | Effet                                                         |
| -------- | ---------------- | ------------------- | ------------------------------------------------------------- |
| Variable | `DEPLOY_RUNS_ON` | `"ubuntu-latest"`   | Runner du job `deploy` (valeur JSON, voir section suivante)    |
| Variable | `API_PORT`       | `3000`              | Port publié par l'API sur le runner                            |
| Variable | `DB_HOST_PORT`   | `5432`              | Port publié par PostgreSQL sur le runner (`127.0.0.1`)         |
| Secret   | `DB_PASSWORD`    | `article`           | Mot de passe PostgreSQL de l'environnement déployé             |

---

## Déploiement sur un runner local (self-hosted)

Par défaut, le job `deploy` s'exécute sur un runner hébergé par GitHub : la stack y est démarrée et testée, puis détruite avec la machine virtuelle. Cela valide la livraison de bout en bout sans infrastructure.

Pour un déploiement **persistant sur une machine locale** :

1. **Installer Docker** (Docker Engine + Compose v2, ou Docker Desktop) sur la machine.
2. **Enregistrer un runner** : *Settings → Actions → Runners → New self-hosted runner*, puis suivre les commandes affichées. Par exemple sous Linux :

   ```bash
   mkdir actions-runner && cd actions-runner
   # télécharger et extraire l'archive indiquée par GitHub, puis :
   ./config.sh --url https://github.com/KrisEllaDavid/devops-articles-api --token <TOKEN>
   sudo ./svc.sh install && sudo ./svc.sh start     # lancer comme service
   ```

   L'utilisateur du runner doit pouvoir utiliser Docker (`sudo usermod -aG docker <user>`).
   Sous Windows, le job utilise `bash` : Git for Windows doit être installé.
3. **Cibler ce runner** : créer la variable de dépôt `DEPLOY_RUNS_ON` avec la valeur

   ```json
   ["self-hosted", "linux"]
   ```

   (adapter les labels à ceux du runner, par ex. `["self-hosted", "windows"]`).
4. *(recommandé)* Créer le secret `DB_PASSWORD`.
5. Pousser un commit sur `devops` : le job `deploy` tourne sur la machine locale et l'API reste accessible sur `http://localhost:3000`. Les données PostgreSQL sont conservées entre les déploiements (volume `articles-api_db-data`) ; chaque déploiement remplace uniquement le conteneur de l'API par la nouvelle image.

L'historique des déploiements est visible dans l'onglet *Environments → local* du dépôt.

---

## Reproduire l'environnement GitHub

Pour rejouer l'ensemble dans un autre compte ou une autre organisation GitHub :

1. Forker le dépôt (ou le pousser dans un nouveau dépôt) en conservant les branches `main` et `devops`.
2. Dans *Settings → Actions → General*, vérifier que les Actions sont autorisées et que *Workflow permissions* permet au `GITHUB_TOKEN` d'écrire les packages (la permission `packages: write` est déclarée dans le workflow).
3. Pousser un commit sur `devops` (ou lancer *Run workflow* depuis l'onglet *Actions*).
4. L'image apparaît dans l'onglet *Packages* du compte : `ghcr.io/<owner>/<repo>`.
   Si le package est privé, se connecter avant un `docker pull` :

   ```bash
   echo <PAT avec read:packages> | docker login ghcr.io -u <utilisateur> --password-stdin
   ```

5. *(optionnel)* Configurer un runner self-hosted comme décrit ci-dessus.

---

## Gestion Git

- `main` contient le code source initial, tel que fourni.
- `devops` contient l'ensemble des travaux d'industrialisation ; il est destiné à être fusionné dans `main` via une Pull Request.
- Les commits suivent la convention [Conventional Commits](https://www.conventionalcommits.org/) (`chore`, `test`, `build`, `ci`, `docs`) : `git log --oneline main..devops` retrace chaque étape.

---

## Référence de l'API

| Méthode  | Route            | Description                    | Codes                |
| -------- | ---------------- | ------------------------------ | -------------------- |
| `GET`    | `/health`        | État de l'API et de la base    | 200, 503             |
| `GET`    | `/articles`      | Liste (plus récents d'abord)   | 200                  |
| `GET`    | `/articles/:id`  | Détail d'un article            | 200, 400, 404        |
| `POST`   | `/articles`      | Création                       | 201, 400             |
| `PUT`    | `/articles/:id`  | Mise à jour complète           | 200, 400, 404        |
| `DELETE` | `/articles/:id`  | Suppression                    | 204, 400, 404        |

Corps attendu pour `POST` / `PUT` :

```json
{
  "name": "Clavier",
  "description": "Clavier mécanique",
  "price": 49.99,
  "stock_quantity": 10
}
```
