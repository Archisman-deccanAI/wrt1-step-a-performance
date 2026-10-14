# app - WRT1 Step A Performance dashboard

React + Vite. Runs in two modes, set by `VITE_DATA_MODE`:

- `seed` (default): uses bundled sample data in `src/seed/`. No Firebase needed. Great for development and demos.
- `firebase`: domain-locked Google sign-in and live reads from Firestore.

## Run in seed mode

```
npm install
npm run dev
```

The DEMO switcher (top right) lets you view any annotator. Each real user will see only their own data in firebase mode.

## Switch to firebase mode

1. `cp .env.example .env.local`
2. Fill in the Firebase web config and set `VITE_DATA_MODE=firebase`.
3. `npm run dev` (or `npm run build` then `npm run preview`).

## Structure

- `src/App.jsx` - auth state and routing between Login and Dashboard
- `src/auth.js` - Google sign-in (domain-checked) with a seed-mode mock
- `src/data.js` - data layer; seed JSON or Firestore reads
- `src/components/` - Dashboard, KpiCards, CorrectionsTable, Login
- `firestore.rules` - row-level security (a user reads only their own data; trainers read all)
- `firebase.json` - hosting + rules config

Firestore collections: `metric_slice/{email}`, `correction/{id}`, `app_user/{email}`, `meta/current`, `identity_map/{id}`. All written server-side by `../ingestion/refresh.py`.
