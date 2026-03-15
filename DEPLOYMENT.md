# Deployment Guide - VP Whiteboard

## Prerequisites

1. Node.js hosting (Digital Ocean App Platform, Railway, Render, or any VPS)
2. Supabase account (free tier works)

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
