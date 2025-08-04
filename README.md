# modern-fastify-template

## Globally replace template strings

This is a TEMPLATE project. You must globally replace the following string-patterns with your project's values:

- `__TEMPLATE_PROJ_NAME__` (i.e. Your Company)
- `__TEMPLATE_PROJ_SLUG__` (i.e. yourcom)
- `__TEMPLATE_PROJ_TAG__` (i.e. yc2 - short project 'tag' for db names/users, infrastructure names, etc.)
- `__TEMPLATE_DOMAIN__` (i.e. your-domain.com)
- `__TEMPLATE_REPO_PATH__` (i.e. github.com/repo-org)
- `__TEMPLATE_REPO_NAME__` (i.e. repo-name-backend)

### Git and Start server

```
git clone https://__TEMPLATE_REPO_PATH__/__TEMPLATE_REPO_NAME__.git
cd __TEMPLATE_REPO_NAME__
npm i
cp env-api-template env-api # for nodemon, milieu and monitor basic-auth your:pass
docker compose up -d
tail -f logger/run.out| bunyan -o short & # To watch the logs
```

In your browser, visit: http://localhost:8600/api/v1/Ping
Also, for observability, visit: http://localhost:8600/api/v1/Health (user: 'your', pass: 'pass')

#### Update schema or clear/reset persistent data or take on new codebase

```
docker compose down -v
rm -rf node_modules # If needed, when new package.json requires it
npm i # For updates to package.json
docker up -d --build
```

### Mailhog access

Mail for local environments is sent to a `mailhog` container.
You can access the mail from this URL: http://localhost:8609/

### Database access

(Password is in docker-compose.yaml, default: 'password')

```
psql --host localhost --port 8605 --user postgres local
```

#### PostgreSQL Cheat-sheet

```
\? # Help
\x on # Show one line per column output
\l # List databases
\d # List tables
\d TABLE-NAME # show table details

select id,jsonb_pretty(log) from monitor limit 1; # Pretty-print
```

# RUNBOOK

## Database

There is a user for each api server environment (vs. using aws_root)

#### Update the password initially and when you want to rotate

At the shell prompt, create a fresh password

```
openssl rand -base64 16
```

Note: for the next step consider having this setting (from https://stackoverflow.com/questions/45702101/psql-how-do-i-not-record-a-single-command-into-history )...

```
\set HISTCONTROL ignorespace
```

At the sql prompt (with optional leading space per HISTCONTROL):

```
ALTER USER __TEMPLATE_PROJ_TAG___stage_api_user WITH PASSWORD 'the-new-password';
```

#### Update milieu/stage.env.json

```
"DB_USER":"__TEMPLATE_PROJ_TAG___stage_api_user",
"_DB_PASS":"the-new-password",
```

and seal it...

```
node src/milieu stage
```

## Secrets

#### Repo stored secrets

The pipeline uses secrets stored and set here: `https://__TEMPLATE_REPO_PATH__/__TEMPLATE_REPO_NAME__/settings/secrets/actions`

#### Additional secrets (Devops, API, Crypto)

| Name                  | Type       | Location                         | Use                                 | Where to change                   |
| --------------------- | ---------- | -------------------------------- | ----------------------------------- | --------------------------------- |
| Project Repo          | string     | `https://__TEMPLATE_REPO_PATH__` | Manage access                       | TODO                              |
| Master DB             | string     | AWS RDS via Bastion              | Developer access                    | AWS RDS                           |
| Bastion server        | ssh-key    | See AWS EC2                      | Developer access to DB              | AWS EC2 key-pairs (and Terraform) |
| DB pass by ENV        | ssh-key    | Milieu                           | API server login to DB Stage/Prod   | Milieu by ENV / DB SQL            |
| SES_SECRET_ACCESS_KEY | aws-pass   | Milieu                           | API server email sending Stage/Prod | Milieu by ENV / AWS               |
| AUTH_KEY              | string     | Milieu                           | API server JWT/OAuth sig            | Milieu by ENV                     |
| MONITOR_HEALTH_AUTH   | basic-auth | Milieu                           | Health endpoint access              | Milieu by ENV                     |
| DISCORD_URL_ALERT     | url        | Milieu/github-actions            | Post to Discord chanel              | Milieu by ENV / Discord-admin     |
| DISCORD_URL_DEPLOY    | url        | Milieu/github-actions            | Post to Discord chanel              | Milieu by ENV / Discord-admin     |
