# Tester l'API en ligne avec GitHub Codespaces

Aucune installation locale : Codespaces fournit une machine dans le cloud avec VS Code dans le navigateur et Docker déjà installé.

## 1. Ouvrir un Codespace

1. Aller sur <https://github.com/KrisEllaDavid/devops-articles-api>.
2. Sélectionner la branche **`devops`** (⚠️ `main` ne contient pas les fichiers Docker).
3. **`<> Code`** → onglet **Codespaces** → **Create codespace on devops**.
4. Ouvrir un terminal : **Ctrl + `**.

## 2. Autoriser le trafic entre conteneurs

Dans Codespaces, Docker tourne lui-même dans un conteneur et la règle de pare-feu `FORWARD` peut bloquer les échanges entre conteneurs. À exécuter à chaque (re)démarrage du Codespace :

```bash
sudo iptables -P FORWARD ACCEPT
sudo iptables-legacy -P FORWARD ACCEPT 2>/dev/null
```

## 3. Démarrer l'application

Avec l'image publiée par le pipeline sur GHCR :

```bash
export API_IMAGE=ghcr.io/kriselladavid/devops-articles-api:devops
docker compose pull api
docker compose up -d --no-build
```

Ou en construisant l'image depuis le code (le premier build peut rester silencieux une minute) :

```bash
docker compose up -d --build
```

Attendre ~20 s, puis vérifier que `api` et `db` sont **(healthy)** :

```bash
docker compose ps
```

## 4. Tester

```bash
curl http://localhost:3000/health
# {"status":"UP","database":"UP"}

curl -X POST http://localhost:3000/articles -H "Content-Type: application/json" \
  -d '{"name":"Clavier","description":"Clavier mécanique","price":49.99,"stock_quantity":10}'

curl http://localhost:3000/articles
curl http://localhost:3000/articles/1

curl -X PUT http://localhost:3000/articles/1 -H "Content-Type: application/json" \
  -d '{"name":"Clavier","description":"Clavier RGB","price":59.99,"stock_quantity":5}'

curl -i -X DELETE http://localhost:3000/articles/1     # 204
```

Dans le navigateur : onglet **PORTS** → 🌐 sur le port **3000** → ajouter `/articles` à l'URL.

Tests automatisés (optionnel, vident la table `articles`) :

```bash
npm ci && npm test      # 14 passed
```

## 5. Dépannage : API `unhealthy`

Symptômes : `curl: (56) Recv failure: Connection reset by peer` et `docker compose ps` affiche l'API **(unhealthy)** alors que `db` est **(healthy)**.

```bash
docker compose logs api --tail 20
# Cannot start application : Error: connect ETIMEDOUT 172.18.0.2:5432
```

`ETIMEDOUT` vers l'IP de la base indique que le trafic entre conteneurs est bloqué (le healthcheck de `db` passe car il s'exécute dans son propre conteneur). Correctif :

```bash
sudo iptables -P FORWARD ACCEPT
sudo iptables-legacy -P FORWARD ACCEPT 2>/dev/null
docker compose restart api
```

Vérifier la connectivité si besoin :

```bash
docker compose exec api node -e "require('net').connect(5432,'db').on('connect',()=>{console.log('DB reachable');process.exit(0)}).on('error',e=>{console.log(e.code);process.exit(1)}).setTimeout(5000,()=>{console.log('timeout');process.exit(1)})"
```

**Si le problème persiste**, contourner le réseau Docker avec le réseau de l'hôte :

```bash
docker compose down -v
docker run -d --name db --network host -e POSTGRES_DB=articles_db \
  -e POSTGRES_USER=article -e POSTGRES_PASSWORD=article postgres:16-alpine
sleep 5
docker run -d --name api --network host -e DB_HOST=127.0.0.1 -e DB_PORT=5432 \
  -e DB_NAME=articles_db -e DB_USER=article -e DB_PASSWORD=article \
  ghcr.io/kriselladavid/devops-articles-api:devops
# nettoyage : docker rm -f api db
```

## 6. Arrêter

```bash
docker compose down        # ajouter -v pour supprimer aussi les données
```

Puis arrêter le Codespace sur <https://github.com/codespaces> (**⋯** → **Stop codespace**) pour ne pas consommer le quota gratuit.
