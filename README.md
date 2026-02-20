# Neon Console PWA

Production-ready React + Vite PWA starter with:

- Responsive sidebar + top profile header
- Futuristic dark Tailwind UI
- Framer Motion page animations
- Installable PWA with offline caching

## Setup

1. Install dependencies:

```bash
npm install
```

## Run

```bash
npm run dev
```

Build production:

```bash
npm run build
npm run preview
```

## Structure

```txt
src/
  app/
    router.tsx
  components/
    layout/
    pwa/
    ui/
  hooks/
  pages/
  lib/
  styles/
```

## Automation Billing (Backend)

Pay-per-use automation is now supported in the backend (`server/`):

- Billing summary: `GET /api/automation/billing`
- Manual top-up: `POST /api/automation/billing/top-up`

Required backend envs are documented in `server/.env.example`:

- `AUTOMATION_PAY_PER_USE_ENABLED`
- `AUTOMATION_CURRENCY`
- `AUTOMATION_DEFAULT_BALANCE_CENTS`
- `AUTOMATION_PRICE_DAILY_BRIEFING_CENTS`
- `AUTOMATION_PRICE_MISSED_TASK_ALERT_CENTS`
- `AUTOMATION_PRICE_INACTIVE_FARMING_ALERT_CENTS`
- `AUTOMATION_PRICE_WEEKLY_REPORT_CENTS`
