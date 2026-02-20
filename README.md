# Neon Console PWA

Production-ready React + Vite PWA starter with:

- Firebase Auth (Email/Password + Google popup)
- Responsive sidebar + top profile header
- Futuristic dark Tailwind UI
- Framer Motion page animations
- Installable PWA with offline caching

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create env file:

```bash
copy .env.example .env
```

3. Fill `.env` values from your Firebase project settings.
4. In Firebase Console, enable:
   - Email/Password provider
   - Google provider
5. Add your app URL (for local dev, `http://localhost:5173`) to Firebase authorized domains.

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
    providers/
    routes/
    router.tsx
  components/
    layout/
    ui/
  features/
    auth/
    dashboard/pages/
  hooks/
  lib/
  styles/
```

