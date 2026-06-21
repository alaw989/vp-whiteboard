# Production Deploy Runbook — Laravel Migration

Target: **`whiteboard.vp-associates.com`** (production), droplet `165.245.141.179`.
Branch: `master` (currently old Nuxt+Supabase). Goal: deploy the Laravel-migrated
stack (Laravel + MySQL/Breeze + Nuxt-in-`frontend/`) to production, mirroring the
staging deploy that is verified working at `staging-whiteboard.vp-associates.com`.

This runbook is distilled from the staging deploy (2026-06-21). Every step below
was proven on staging; the **Gotchas** section is the hard-won part — read it first.

---

## ⚠️ Production-specific decisions (do NOT skip)

These two differ from staging (which started empty) and need a human decision:

### 1. Auth model changes: shared password → real user accounts
The migration replaces the shared `AUTH_PASSWORD` (single password everyone used)
with **Laravel Breeze user accounts** (email + password per user). Consequences:
- The old shared password will **stop working**. Every user must register / be seeded.
- Decide: seed a small set of known engineer accounts (`php artisan tinker` →
  `User::create([...])` or a `UserSeeder`), or open registration temporarily.
- Breeze `register` is enabled by default — disable it after seeding if you want
  invite-only (`routes/auth.php` → remove the `/register` route or gate it).

### 2. Data migration: Supabase → MySQL
Production whiteboards + uploaded files currently live in **Supabase**. Options:
- **Migrate** (preserve data): export `whiteboards` + `whiteboard_files` from Supabase
  (SQL/CSV/JSON via the Supabase dashboard or `psql`), map columns to the Laravel
  schema (`id`, `name`, `created_by`, `share_token`, `canvas_state` JSON, timestamps),
  and `LOAD DATA`/seed into MySQL `vp_whiteboard_production`. Re-link uploaded files
  into Laravel `storage/app/public`.
- **Start fresh** (acceptable if production has little real data): deploy with an
  empty DB. Confirm with stakeholders first — this is destructive.

The `canvas_state` column is JSON and maps 1:1 from Supabase's JSONB, so the canvas
content itself transfers cleanly; the work is row ETL + file relocation.

---

## Gotchas (each one bit us on staging — re-apply all)

1. **System `composer` is broken on PHP 8.4.** `/usr/bin/composer` (2.7.1) uses stale
   Symfony libs in `/usr/share/php` and throws `AbstractUnicodeString`/utf8 errors.
   **Use the official phar:** download once —
   `curl -sS https://getcomposer.org/composer.phar -o /usr/local/bin/composer-phar && chmod +x /usr/local/bin/composer-phar`
   — then run `php /usr/local/bin/composer-phar install ...`.

2. **`php8.4-mysql` (and friends) are not installed.** Without it, `migrate` fails
   with "could not find driver". Install:
   `apt-get install -y php8.4-mysql php8.4-mbstring php8.4-xml php8.4-bcmath php8.4-curl php8.4-zip php8.4-gd`
   then `systemctl reload php8.4-fpm`.

3. **`.env` must be readable by `www-data` (PHP-FPM user).** If root writes `.env`
   it ends up `600 root:root`; FPM can't read it → silently falls back to sqlite +
   "no APP_KEY" / "database.sqlite missing", while artisan (root) works fine.
   **Fix:** `chown www-data:www-data .env && chmod 640 .env`. (This was the main
   staging bug — artisan green, FPM red.)

4. **nginx: `try_files … /index.php` inside `location ^~ /api/` escapes to
   `location /` (Nuxt).** The internal redirect to `/index.php` re-matches at server
   scope, hits the Nuxt proxy, and returns Nuxt's error JSON. **Fastcgi-pass
   directly** with a hardcoded `SCRIPT_FILENAME` and preserved `REQUEST_URI`:
   ```nginx
   location ^~ /api/ {
       fastcgi_pass unix:/run/php/php8.4-fpm.sock;
       include fastcgi_params;
       fastcgi_param SCRIPT_FILENAME $realpath_root/index.php;
       fastcgi_param REQUEST_URI $request_uri;
   }
   ```
   (Same block for `^~ /sanctum/`.)

5. **`SESSION_DRIVER=database` needs the sessions table.** It is NOT in the default
   scaffold output. Run `php artisan session:table && php artisan migrate`.

6. **WS relay must authenticate.** The standalone `frontend/server/ws-server.js`
   historically used `AUTH_PASSWORD` HMAC and, with it unset, was an **open relay**.
   It now verifies the `laravel_session` cookie against Laravel `/api/user` per
   connection (cached). Run it with `LARAVEL_URL=https://whiteboard.vp-associates.com`.
   (Anonymous share-link viewers are currently rejected — add a `?token=` path
   validating via `/api/sessions/{shareToken}` if share-link real-time is needed.)

7. **Icons: `@iconify-json/mdi` must be a declared dependency.** `@nuxt/icon` in
   local server-bundle mode needs the collection; without it every `mdi:*` icon
   404s at runtime (toolbar buttons lose their icons). It is now in
   `frontend/package.json` devDependencies — keep it. Verify after install:
   `ls frontend/node_modules/@iconify-json/mdi`.

8. **nginx: Nuxt's icon endpoint `/api/_nuxt_icon/` must reach Nuxt, not Laravel.**
   Because all `/api/*` routes to Laravel, add a longest-prefix exception BEFORE the
   `/api/` block:
   ```nginx
   location ^~ /api/_nuxt_icon/ {
       proxy_pass http://localhost:3000;   # Nuxt, not Laravel
       proxy_http_version 1.1;
       proxy_set_header Host $host;
   }
   ```
   Verify: `curl -o /dev/null -w '%{http_code}' https://whiteboard.vp-associates.com/api/_nuxt_icon/mdi.json?icons=plus` → `200`.

---

## Pre-flight (on droplet, before touching prod)

```bash
ssh -i ~/.ssh/id_ed25519_nopass root@165.245.141.179
php -v                       # 8.4.x
php -m | grep pdo_mysql      # must list pdo_mysql (Gotcha 2)
mysql -u root -e 'SELECT 1'  # root access works
ls /usr/local/bin/composer-phar   # official composer (Gotcha 1)
df -h /                      # disk free
pm2 list                     # note current vp-whiteboard / vp-ws-server (prod, :3000/:3001)
```

Snapshot current prod for rollback:
```bash
cp /etc/nginx/sites-available/whiteboard.vp-associates.com \
   /etc/nginx/sites-available/whiteboard.vp-associates.com.bak.$(date +%s)
# tag the deployed commit
cd /var/www/vp-whiteboard && git rev-parse HEAD > /tmp/prod_commit_before_migration.txt
```

---

## Deploy steps

Assumes the migration is merged to `master` (currently it lives on `develop` /
`feat/autocad-tools` at `33abc76d`). **Merge to master first**, then:

```bash
cd /var/www/vp-whiteboard
git fetch origin && git reset --hard origin/master

# --- Laravel (root) ---
php /usr/local/bin/composer-phar install --no-dev --optimize-autoloader --no-interaction
cp .env.example .env
# Edit .env: APP_ENV=production, APP_DEBUG=false, APP_URL=https://whiteboard.vp-associates.com,
#   DB_CONNECTION=mysql + DB_HOST/PORT/DATABASE/USERNAME/PASSWORD (create DB first, below),
#   SESSION_DOMAIN=whiteboard.vp-associates.com, SANCTUM_STATEFUL_DOMAINS=whiteboard.vp-associates.com,
#   FRONTEND_URL=https://whiteboard.vp-associates.com
chown www-data:www-data .env && chmod 640 .env        # Gotcha 3
php artisan key:generate --force
php artisan session:table 2>/dev/null; php artisan migrate --force   # Gotcha 5
php artisan storage:link
chown -R www-data:www-data storage bootstrap/cache

# --- MySQL DB (create production DB + user) ---
DBPASS=$(openssl rand -hex 16)
mysql -u root <<SQL
CREATE DATABASE vp_whiteboard_production CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'vp_wb_prod'@'127.0.0.1' IDENTIFIED BY '$DBPASS';
GRANT ALL ON vp_whiteboard_production.* TO 'vp_wb_prod'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
echo "$DBPASS" > /root/.vp_wb_prod_dbpass && chmod 600 /root/.vp_wb_prod_dbpass
# (put the same DB_* values into .env, then re-run `php artisan migrate --force`)

# --- Frontend (frontend/) ---
cd frontend
npm install --no-audit --no-fund   # pulls @iconify-json/mdi (Gotcha 7)
cat > .env <<EOF
NUXT_PUBLIC_LARAVEL_URL=https://whiteboard.vp-associates.com
NUXT_PUBLIC_SITE_URL=https://whiteboard.vp-associates.com
NUXT_PUBLIC_WS_URL=wss://whiteboard.vp-associates.com
EOF
NODE_OPTIONS="--max-old-space-size=1536" npm run build

# --- PM2: re-point prod processes to frontend/ ---
pm2 delete vp-whiteboard vp-ws-server
PORT=3000 \
NUXT_PUBLIC_LARAVEL_URL=https://whiteboard.vp-associates.com \
NUXT_PUBLIC_SITE_URL=https://whiteboard.vp-associates.com \
NUXT_PUBLIC_WS_URL=wss://whiteboard.vp-associates.com \
  pm2 start .output/server/index.mjs --name vp-whiteboard --cwd /var/www/vp-whiteboard/frontend
WS_PORT=3001 LARAVEL_URL=https://whiteboard.vp-associates.com \
  pm2 start server/ws-server.js --name vp-ws-server --cwd /var/www/vp-whiteboard/frontend
pm2 save
```

### nginx vhost for `whiteboard.vp-associates.com`
Mirror the staging vhost (see `/etc/nginx/sites-available/staging-whiteboard.vp-associates.com`),
changing ports to `:3000`/`:3001` and the PHP-FPM fastcgi blocks (Gotchas 4 & 8):
`^~ /api/_nuxt_icon/` → Nuxt `:3000`; `^~ /api/` and `^~ /sanctum/` → fastcgi `index.php`;
`/whiteboard` → WS `:3001`; `/` → Nuxt `:3000`. Then:
```bash
nginx -t && systemctl reload nginx
```

---

## Seed users (auth model change — Decision 1)

```bash
cd /var/www/vp-whiteboard
php artisan tinker
# >>> User::create(['name'=>'…','email'=>'…@vp-associates.com','password'=>Hash::make('…')]);
```
Or write a `database/seeders/UserSeeder.php` and `php artisan db:seed --class=UserSeeder`.

---

## Post-deploy verification

```bash
# API + auth (from your laptop, or droplet)
BASE=https://whiteboard.vp-associates.com
curl -s -o /dev/null -w '%{http_code}\n' $BASE/                 # 200 (SPA)
curl -s -o /dev/null -w '%{http_code}\n' $BASE/api/user         # 401 (Laravel routing)
curl -s -o /dev/null -w '%{http_code}\n' $BASE/api/_nuxt_icon/mdi.json?icons=plus  # 200 (Gotcha 8)
# full register→login→create→list flow — see staging smoke test in chat history
# WS auth: pm2 logs vp-ws-server should show ✅ Connection for logged-in users,
#          🚫 Rejected for unauthenticated
pm2 list                       # all online, ↺ low
```

Then a manual click-through: login → create whiteboard → draw → confirm autosave
→ open a second browser for real-time cursor sync.

---

## Rollback

If production is broken:
```bash
cd /var/www/vp-whiteboard
git reset --hard $(cat /tmp/prod_commit_before_migration.txt)   # old Nuxt+Supabase
cp /etc/nginx/sites-available/whiteboard.vp-associates.com.bak.* \
   /etc/nginx/sites-available/whiteboard.vp-associates.com
nginx -t && systemctl reload nginx
# restart old PM2 processes serving root .output + root server/ws-server.js
pm2 resurrect   # or manually re-create the old vp-whiteboard / vp-ws-server
```
Because production's data stayed in Supabase (the migration used a separate MySQL
DB), rollback restores the old app against the untouched Supabase data — no data
loss as long as you didn't delete Supabase.
