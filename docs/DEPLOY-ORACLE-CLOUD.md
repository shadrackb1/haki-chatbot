# Deploy Both Bots to Oracle Cloud Free Tier (Free Forever)

## What You Get (Free, No Credit Card Charged)
- **4 ARM OCPUs** (24GB RAM) — more than enough for both bots
- **200GB storage**
- **Always-on** — no spin-down, no cold starts
- **Ubuntu 22.04** pre-installed
- **Free forever** — Oracle never auto-charges

---

## Step 1: Create Oracle Cloud Account (10 min)

1. Go to **https://cloud.oracle.com/free**
2. Click **"Start for Free"**
3. Fill in your details (use your real phone for OTP)
4. Select region: **UK London (London)** or **South Africa (Johannesburg)** — closest to Kenya
5. Choose **"Always Free"** account (uncheck any paid upgrades)
6. Complete signup

---

## Step 2: Create a Free VPS Instance (5 min)

1. After login, go to **Compute → Instances → Create Instance**
2. Settings:
   - **Name:** `haki-bots`
   - **Image:** Ubuntu 22.04 (or latest ARM)
   - **Shape:** Select **VM.Standard.A1.Flex** (ARM — this is the free one!)
     - Click "Change shape" → Ampere → VM.Standard.A1.Flex
     - **OCPU count:** 4 (max free)
     - **Memory:** 24 GB (max free)
   - **Networking:** Use the default VCN (auto-created)
3. Under **"Add SSH keys"**:
   - Select **"Generate a key pair"**
   - **Download both keys** (private `.key` and public `.pub`)
   - Save the `.key` file somewhere safe on your laptop
4. Click **Create** and wait ~2 min for the instance to boot
5. Note the **Public IP address** (looks like `129.x.x.x`)

---

## Step 3: Connect to Your VPS (2 min)

Open PowerShell and connect:

```powershell
# Change path to wherever you saved the .key file
ssh -i C:\Users\ADMIN\Downloads\your-key-name.key ubuntu@YOUR_PUBLIC_IP
```

If it asks `Are you sure?` → type `yes`

You should see `ubuntu@instance:~$` — you're in!

---

## Step 4: Install Docker on the VPS (3 min)

Copy-paste these commands one by one:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to docker group (no sudo needed)
sudo usermod -aG docker ubuntu

# Install docker-compose
sudo apt install docker-compose-plugin -y

# Log out and back in for group to take effect
exit
```

Then reconnect:
```powershell
ssh -i C:\Users\ADMIN\Downloads\your-key-name.key ubuntu@YOUR_PUBLIC_IP
```

Verify Docker works:
```bash
docker --version
docker compose version
```

---

## Step 5: Upload Your Bot Files to VPS (3 min)

From your laptop, in PowerShell:

```powershell
# Copy the entire project to the VPS
scp -i C:\Users\ADMIN\Downloads\your-key-name.key -r C:\Users\ADMIN\Desktop\Haki-Chatbot\* ubuntu@YOUR_PUBLIC_IP:/home/ubuntu/haki-chatbot/
```

Or clone from GitHub instead:
```bash
# On the VPS:
git clone https://github.com/ishiidoc96-ship-it/haki-chatbot.git
cd haki-chatbot
```

---

## Step 6: Create the .env File on VPS

SSH into the VPS and create the env file:

```bash
cd ~/haki-chatbot
nano .env
```

Paste this (replace the API key):

```
LLM_API_KEY=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
LLM_API_URL=https://integrate.api.nvidia.com/v1/chat/completions
LLM_MODEL=meta/llama-3.1-8b-instruct
BOT_NAME=Haki
BOT_VERSION=1.0.0
DEFAULT_LANGUAGE=sw
SUPPORTED_LANGUAGES=sw,en
LOG_LEVEL=info
BOT_OWNER_NUMBER=254746053175
RATE_LIMIT_PER_MINUTE=20
RATE_LIMIT_PER_DAY=200
RATE_LIMIT_GLOBAL=100
HEALTH_PORT=3001
```

Save: `Ctrl+X` → `Y` → `Enter`

---

## Step 7: Build & Launch Both Bots (5 min)

```bash
cd ~/haki-chatbot

# Build both bot images
docker compose build

# Start both bots in background
docker compose up -d
```

---

## Step 8: Scan QR Codes (the only time you need your laptop)

The bots will print QR codes to connect to WhatsApp. To see them:

```bash
# See Haki's QR code
docker compose logs -f haki

# See PixelAI's QR code (open another terminal)
docker compose logs -f pixelai
```

**Scan each QR code** with WhatsApp (on your phone):
- Open WhatsApp → Settings → Linked Devices → Link a Device
- Scan the QR code

Once both show `✅ LIVE!`, press `Ctrl+C` to stop watching logs.

**After the first scan, the bots remember the session forever** — you never need to scan again unless you delete the VPS.

---

## Step 9: Verify Everything Is Running

```bash
# Check both containers are running
docker compose ps

# Check health
curl localhost:3001/health    # Haki
curl localhost:3002/health    # PixelAI

# View recent logs
docker compose logs --tail 20
```

---

## Useful Commands

```bash
# Stop both bots
docker compose down

# Restart both bots
docker compose restart

# Restart only Haki
docker compose restart haki

# View live logs
docker compose logs -f

# Update bots (after code changes)
git pull
docker compose up -d --build

# Check disk usage
df -h

# Check RAM usage
free -h
```

---

## Auto-Restart on VPS Reboot

Docker's `restart: always` policy means the bots automatically restart if:
- The VPS reboots
- A bot crashes
- Docker daemon restarts

**You don't need to do anything** — they're self-healing.

---

## Troubleshooting

### Bot shows "Not configured - using fallback"
- Your `LLM_API_KEY` is missing or wrong in `.env`
- Edit: `nano ~/haki-chatbot/.env`

### WhatsApp disconnects frequently
- This shouldn't happen with multi-device, but if it does:
```bash
docker compose restart haki
```

### VPS is slow
- Check: `docker stats`
- If one bot is eating too much RAM, reduce to 3 OCPU/16GB in Oracle Cloud console

### Can't SSH in
- Make sure you're using the right IP and key file
- Check that port 22 is open in Oracle Cloud security list
- Network → Virtual Cloud Networks → your VCN → Security Lists → add Ingress Rule for port 22
