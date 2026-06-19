# Deployment Guide - VP Whiteboard

## Prerequisites

1. Node.js hosting (Digital Ocean App Platform, Railway, Render, or any VPS)
2. Supabase account (free tier works)

## Current Production Setup (CI/CD)

Production and staging both run on a single DigitalOcean droplet (`165.245.141.179`) behind Nginx, each as a pair of PM2-managed processes (Nuxt app + standalone Yjs WebSocket relay). Deploys are **push-triggered via GitHub Actions** — there is no manual build step in normal operation.

| Environment | URL | App port | WS port | PM2 processes | Source branch | Workflow |
|---|---|---|---|---|---|---|
| **Production** | `whiteboard.vp-associates.com` | 3000 | 3001 | `vp-whiteboard`, `vp-ws-server` | `master` | `.github/workflows/deploy.yml` |
| **Staging** | `staging-whiteboard.vp-associates.com` | 3002 | 3003 | `vp-whiteboard-staging`, `vp-ws-server-staging` | `develop` | `.github/workflows/deploy-staging.yml` |

### Branch model (GitFlow)

- **`master`** → production. Pushing `master` triggers the prod workflow: SSH into the droplet, `git reset --hard origin/master`, rebuild, restart the prod PM2 processes.
- **`develop`** → staging. Pushing `develop` triggers the staging workflow against the staging checkout/processes.
- **Feature branches** (e.g. `fix/autocad-tools`) → merge into `develop` to ship to staging; merge `develop` into `master` to ship to production.

```
feature branch  →  develop (staging)  →  master (production)
```

### How to deploy

Just push:

```bash
git push origin develop    # ships to staging
git push origin master     # ships to production (after verifying staging)
```

Watch a run:

```bash
gh run list  --repo alaw989/vp-whiteboard --workflow "Deploy Staging" --limit 3
gh run watch <run-id> --repo alaw989/vp-whiteboard --exit-status
```

### Concurrency guard

Both workflows declare a shared GitHub Actions concurrency group `droplet-build` (`cancel-in-progress: false`). The droplet has ~3.9 GB RAM and each build peaks near 2 GB, so this group **serializes** prod and staging builds — a `master` build and a `develop` build queue rather than run simultaneously and OOM the box.

### Secrets

Both workflows reuse the same repo-level GitHub secrets for SSH access: `DO_HOST`, `DO_USER`, `DO_SSH_KEY`, `DO_PORT`. Production additionally injects `SITE_URL`, `WS_URL`, `AUTH_PASSWORD`, `AUTH_SECRET`, and the `SUPABASE_*` keys into prod's `.env` on each deploy. Staging reuses its existing on-disk `.env` (it shares prod's Supabase/auth, with staging URLs and ports 3002/3003), so **no additional secrets are required for staging**.

### First-run bootstrap (one-time per environment)

The workflows use `pm2 restart`, so a brand-new checkout needs the processes started once before the workflow can restart them:

```bash
ssh root@165.245.141.179
cd /var/www/vp-whiteboard          # or vp-whiteboard-staging
npm install
NODE_OPTIONS="--max-old-space-size=2048" npm run build
pm2 start .output/server/index.mjs --name vp-whiteboard          # …-staging for staging
pm2 start server/ws-server.js       --name vp-ws-server          # …-staging for staging
pm2 save
```

### Notes

- `workflow_dispatch` (manual trigger) is currently inert for both workflows because the repo's default branch is `main` (a legacy stub). Only `push` triggers a deploy. To enable manual runs, set the repo default branch to `master`.
- The concurrency group protects CI runs from each other, but **not** from a manual build started over SSH — don't run a manual build on the droplet while a CI deploy is in flight.
- The generic platform steps below (App Platform / Railway / from-scratch VPS) are kept as reference; the live system is the CI/CD setup described above.

## Step 1: Set up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Once created, go to **SQL Editor** in the left sidebar
3. Copy the contents of `supabase/schema.sql` and run it
4. Go to **Settings > API** and note down:
   - Project URL (`SUPABASE_URL`)
   - anon/public key (`SUPABASE_ANON_KEY`)

## Step 2: Push Code to GitHub

```bash
cd /home/deck/Sites/vp-whiteboard
git init
git add .
git commit -m "Initial commit"
# Create a new repo on GitHub first, then:
git remote add origin https://github.com/YOUR_USERNAME/vp-whiteboard.git
git push -u origin main
```

## Step 3: Deploy to Digital Ocean App Platform

1. Go to [digitalocean.com](https://cloud.digitalocean.com/apps)
2. Click **Create App** → **Deploy from GitHub**
3. Select your `vp-whiteboard` repository
4. Configure:
   - **Project Name**: vp-whiteboard
   - **Region**: Choose closest to your users
   - **Plan**: Basic ($5/month) is fine for testing

5. **Build & Run Settings**:
   - Build Command: `npm run build`
   - Run Command: `npm start`

6. **Environment Variables** (add these):
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   NUXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NUXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   WS_PORT=3001
   NUXT_PUBLIC_WS_URL=wss://your-app-url.ondigitalocean.app
   NUXT_PUBLIC_SITE_URL=https://your-app-url.ondigitalocean.app
   ```

7. **Important**: Enable WebSockets
   - In app settings, find **WebSocket Support**
   - Set to **Enabled**

8. Click **Deploy**

## Step 4: Deploy to Railway (Alternative)

1. Go to [railway.app](https://railway.app)
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your `vp-whiteboard` repository
4. Add environment variables (same as above)
5. Railway will auto-detect Nuxt and configure everything
6. Click **Deploy**

## Step 5: Deploy to VPS with Nginx (Recommended)

For a VPS (Digital Ocean Droplet, Linode, etc.):

### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 (process manager)
sudo npm install -g pm2

# Install Nginx
sudo apt install -y nginx
```

### 2. Deploy App

```bash
# Clone repo
git clone https://github.com/YOUR_USERNAME/vp-whiteboard.git
cd vp-whiteboard

# Install dependencies
npm install

# Create .env file
cp .env.example .env
nano .env  # Add your environment variables
```

**Important - Add these to your .env:**
```bash
# WebSocket URL (update with your domain)
NUXT_PUBLIC_WS_URL=ws://localhost:3001

# Or for production with HTTPS:
# NUXT_PUBLIC_WS_URL=wss://whiteboard.vp-associates.com

# Supabase (if using)
NUXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NUXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

```bash
# Build
npm run build

# Start BOTH servers with PM2
pm2 start .output/server/index.mjs --name vp-whiteboard
pm2 start server/ws-server.js --name vp-ws-server
pm2 save
pm2 startup  # Follow the instructions
```

**Verify both processes are running:**
```bash
pm2 status
# You should see both vp-whiteboard and vp-ws-server online
```

### 3. Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/vp-whiteboard
```

Add this configuration (includes WebSocket proxy):

```nginx
server {
    listen 80;
    server_name whiteboard.vp-associates.com;

    # Main app
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket server (for Yjs collaboration)
    location /whiteboard: {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/vp-whiteboard /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 4. Add SSL with Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d whiteboard.vp-associates.com
```

## Troubleshooting

### WebSocket not connecting

- Ensure WebSocket support is enabled (App Platform)
- Check `NUXT_PUBLIC_WS_URL` uses `wss://` for HTTPS
- For Nginx, ensure `proxy_set_header Upgrade` is set

### File upload failing

- Check Supabase storage bucket exists: `whiteboard-files`
- Verify RLS policies allow public uploads
- Check file size (max 10MB)

### Build errors

- Delete `.nuxt` folder and rebuild: `rm -rf .nuxt && npm run build`
- Clear npm cache: `npm cache clean --force`

## Post-Deployment Checklist

- [ ] Create a test whiteboard
- [ ] Upload an image file
- [ ] Draw on canvas
- [ ] Open in second browser window to test real-time sync
- [ ] Export as PNG
- [ ] Test share link
- [ ] Verify persistence (refresh page, drawings should remain)
