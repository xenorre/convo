# Deployment

Convo runs on the shared VPS behind the Traefik that apexcore runs there, at
https://convo.deezby.pl. Paths below are relative to the home folder of the
server user that deploys; the server's address and that user's name are kept
out of this public repository (deploy.sh reads them from VPS_HOST and
VPS_USER).

| What | Where |
| --- | --- |
| Compose file | `~/apps/convo/docker-compose.prod.yaml` (from [docker-compose.prod.yaml](docker-compose.prod.yaml)) |
| Secrets | `~/apps/convo/.env`, chmod 600 (see [.env.production.example](.env.production.example)) |
| Containers | `convo-app` (the app, one image), `convo-db` (MongoDB 7.0) |
| Volumes | `convo-mongo-data` (the database), `convo-uploads` (uploaded files) |
| Networks | `apexcore-network` (Traefik, app only), `convo-internal` (app and database, no internet) |
| Backups | `~/apps/convo/backups`, one folder per day, kept 7 days |

The Compose project is called `convo-prod`, not `convo`: on a developer's
machine `convo` is the development project, and its MongoDB would be taken
over.

## How it fits together

- The image serves the API, Socket.IO and the built frontend on port 3000 and
  runs as the unprivileged `node` user.
- Traefik routes `convo.deezby.pl` to it, gets the certificate from Let's
  Encrypt, redirects HTTP to HTTPS and adds the `security-headers@file`
  headers.
- MongoDB requires a password and has no published port. The app signs in as
  `convo`, which can only read and write the `convo` database. The root
  account is for backups, restores and maintenance.
- Uploaded files live in the `convo-uploads` volume and are served by the app
  under `/uploads`, at most 2 MB each.
- There is no Redis: one app instance needs none.

## Secrets

Make every secret with `openssl rand -hex 32` and keep passwords hex: they go
into a MongoDB connection URL.

MongoDB creates the root and `convo` accounts on its first start only. To
change a password later, change it in the database too:

```bash
docker exec -it convo-db sh -c 'mongosh -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin convo'
# then: db.changeUserPassword("convo", "<new password>")
```

## Backups

[scripts/backup-vps.sh](scripts/backup-vps.sh) saves the database
(`convo-db.archive.gz`, from mongodump) and the uploaded files
(`uploads.tar.gz`) into a dated folder, deletes folders older than 7 days and
warns when the disk is 80% full. It refuses to run when the database isn't
healthy, and an interrupted run leaves no folder that looks complete.

Run it daily from the crontab of the server user that deploys (`crontab -e`):

```
15 3 * * * $HOME/apps/convo/backup-vps.sh >> $HOME/apps/convo/backups/backup.log 2>&1
```

Copy a backup off the server now and then:

```bash
scp -r "$VPS_USER@$VPS_HOST:apps/convo/backups/<folder>" .
```

## Restoring a backup

From `~/apps/convo`, with `B=backups/<folder>`:

```bash
# The database: replaces the convo collections with the backup's.
docker exec -i convo-db sh -c 'exec mongorestore --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive --gzip --drop --nsInclude "convo.*"' < "$B/convo-db.archive.gz"

# The files: puts the backup's files back; files added since stay.
docker run --rm -i --network none --volume convo-uploads:/data --entrypoint tar convo:latest -xzf - -C /data < "$B/uploads.tar.gz"
```
