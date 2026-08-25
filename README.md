# OpenLove ❤️

> **A free, self-hosted, privacy-first relationship tracker and anniversary reminder alternative to "My Love".**

OpenLove allows couples to track how long they have been together with live counters, special multi-category milestones (months, years, days, custom), customizable romantic themes, and Web Push milestone alerts.

---

## ✨ Features

- 🔒 **Zero-Knowledge Privacy**: Couple names, anniversary dates, and high-resolution photos are stored locally on your device via **IndexedDB**. The server never stores your private memories or names.
- 🎨 **Dual UI Themes & Extensible Architecture**:
  - **Modern UI** *(Default)*: Clean, glassmorphic cards, glowing couple avatar, accent color palettes (*Rose, Lavender, Terracotta, Sage, Midnight*).
  - **Traditional UI**: Authentic, nostalgic replica of the classic "My Love" design with deep crimson header and stacked time breakdown.
- 🌙 **Dark Mode Support**: Light, Dark, or System mode with crisp high contrast across all views.
- 🏆 **Comprehensive Milestone Engine**:
  - **Months**: 1st through 11th month, 18 months, 30 months, etc.
  - **Years**: 1st anniversary, 5-year, 10-year, 25-year silver, 50-year golden, etc.
  - **Days**: 50, 100, 500, 1,000, 2,000, 5,000, 10,000 days.
  - **Custom**: Add custom relationship memories (*First Date, Moved In, Proposal*).
- 📲 **PWA & Offline Ready**: Installable to Home Screen on iOS Safari, Android Chrome, and Desktop with offline caching.
- 🔔 **Anonymous Web Push Notifications**: Scheduled background cron alerts you on your exact milestone day in your local timezone.
- 💾 **Portable JSON Backup & QR Share**: 1-tap backup/restore and quick couple sharing via QR codes.

---

## 🚀 Quickstart with Docker Compose

Deploy OpenLove in seconds using Docker:

```bash
# 1. Clone repository
git clone https://github.com/frozdbyte/OpenLove.git
cd OpenLove

# 2. Start container
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000) in your browser to start the onboarding wizard.

### Persistent Data
All SQLite records and auto-generated VAPID keys persist automatically in the `openlove_data` Docker volume (`/app/data`).

---

## ☁️ Deploy on Coolify

OpenLove ships with a ready-made Coolify compose file that pulls the pre-built image from Docker Hub.

1. In your Coolify dashboard, create a new **Docker Compose** service.
2. Point it to this repository or paste the contents of `docker-compose.coolify.yml`.
3. Set your domain in the Coolify UI — the `SERVICE_FQDN_OPENLOVE_3000` variable automatically routes it to the app.
4. Deploy. That's it — Coolify handles SSL, reverse proxy, and restarts.

> **Tip:** VAPID keys for push notifications are auto-generated on first boot into `/app/data/vapid.json`. To use your own, set `PUBLIC_VAPID_KEY`, `PRIVATE_VAPID_KEY`, and `VAPID_SUBJECT` in Coolify's environment variables tab.

---

## 🛠️ Local Development Setup

Ensure you have **Node.js 22+** and **pnpm** installed.

```bash
# 1. Install dependencies
pnpm install

# 2. Initialize database
pnpm prisma db push

# 3. Start development server
pnpm dev
```

The dev server will run at [http://localhost:5173](http://localhost:5173).

---

## ⚙️ Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | HTTP port for the web server |
| `DATABASE_URL` | `file:./data/openlove.db` | SQLite database connection string |
| `PUBLIC_VAPID_KEY` | *(Auto-generated)* | Public VAPID key for Web Push |
| `PRIVATE_VAPID_KEY` | *(Auto-generated)* | Private VAPID key for Web Push |
| `VAPID_SUBJECT` | `mailto:admin@openlove.local` | Contact email in push tokens |

---

## 🔒 Privacy Architecture

OpenLove uses a **zero-knowledge, multi-couple architecture**:

```
+-------------------------------------------------------------+
|                      User Device (Browser)                  |
|  - Names, Start Date, High-Res Photos -> Stored in IndexedDB |
|  - Real-time time calculations & UI themes rendered locally |
+------------------------------+------------------------------+
                               | Anonymous Push Token & Date
                               v
+-------------------------------------------------------------+
|                   OpenLove Server (SQLite)                  |
|  - Stores ONLY: Push endpoint, crypto keys, date & timezone |
|  - Daily cron checks dates -> Dispatches milestone Web Push |
|  - NO names, NO photos, NO personal credentials on server   |
+-------------------------------------------------------------+
```

---

## 📄 License

MIT License. Crafted with ❤️ for couples everywhere.
