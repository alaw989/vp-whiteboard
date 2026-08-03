# Development setup

Getting the project running on a fresh machine (Steam Deck, Linux PC, or anywhere
else). The app is a **Laravel** backend (repo root) + **Nuxt** frontend (`frontend/`)
+ a **Yjs WebSocket relay**. All three run locally for development.

> For architecture, current state, and the gotcha catalog see `CLAUDE.md` and
> `STAGING-LARAVEL-MIGRATION.md`. For production deploy see `PRODUCTION-DEPLOY.md`.

## Prerequisites
- **PHP 8.2+** with `pdo_sqlite` (and `pdo_mysql` if you use MySQL locally)
- **Composer** (PHP dep manager)
- **Node.js 20+** and **npm**
- **Git** + **GitHub auth** on this machine (SSH key or PAT) — needed to push
- *(optional)* **MySQL/MariaDB** — local dev defaults to SQLite, so you can skip this

macOS/Ubuntu example:
```bash
sudo apt install -y php8.4 php8.4-sqlite3 php8.4-mysql php8.4-mbstring php8.4-xml php8.4-curl php8.4-zip php8.4-gd
curl -sS https://getcomposer.org/installer | php && sudo mv composer.phar /usr/local/bin/composer
# Node 20 via nvm or your package manager
```

## 1. Clone + authenticate
```bash
git clone git@github.com:alaw989/vp-whiteboard.git
cd vp-whiteboard
git switch develop          # active development branch (deploys to staging)
```
Confirm you can push: `git push --dry-run origin develop`. If not, set up an SSH
key (or PAT) for GitHub on this machine — that's machine-side, not in the repo.

## 2. Backend — Laravel (repo root)
```bash
cp .env.example .env        # then edit DB_* if you want MySQL (SQLite works by default)
composer install
php artisan key:generate
php artisan migrate
php artisan storage:link    # creates public/storage for uploaded files
php artisan serve           # Laravel on http://localhost:8000
```
The `.env` defaults to SQLite (`DB_CONNECTION=sqlite`, file at `database/database.sqlite`),
which is fine for local dev. For MySQL, set `DB_CONNECTION=mysql` + host/db/user/password.

**Register a user** to log in with: open `http://localhost:8000` is not wired to a
UI, so either register via the Nuxt UI (next step) at `/register`, or seed one:
```bash
php artisan tinker --execute 'echo \App\Models\User::create(["name"=>"Me","email"=>"me@example.com","password"=>"password"])->email;'
```

## 3. Frontend — Nuxt (`frontend/`)
In a second terminal:
```bash
cd frontend
cp .env.example .env        # points Nuxt at Laravel on :8000
npm install
npm run dev                 # Nuxt on http://localhost:3000
```
Open `http://localhost:3000`, register/sign in, and create a whiteboard.

## 4. Real-time — Yjs WS relay (optional, for collaboration)
In a third terminal:
```bash
cd frontend
npm run dev:ws              # relay on ws://localhost:3001
```
Without it, drawing still works (local-only); with it, two browser tabs sync live.

## Deploying to staging
**Push to `develop`** — that's it. GitHub Actions (`.github/workflows/deploy-staging.yml`)
builds and deploys to `staging-whiteboard.vp-associates.com`. Do **not** hand-deploy
over SSH.
```bash
git push origin develop
gh run watch "$(gh run list --workflow=deploy-staging.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
```
SSH to the droplet is fine for **read-only** diagnosis (`pm2 list`, logs, `curl`),
but the deploy itself always goes through GitHub.

## Notes
- **Credentials stay out of the repo.** Both `.env` files are gitignored. CI uses
  GitHub secrets; the droplet's `.env` lives on disk there.
- **Steam Deck:** git has no global identity — commit with
  `git -c user.name=alaw989 -c user.email=alaw989@users.noreply.github.com commit …`
- **Type checking:** `cd frontend && npm run typecheck`
