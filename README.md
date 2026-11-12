# ROYALS G.A.A.P. 2026

A responsive registration website and private Council of Leaders dashboard.

## Local setup
1. Install Node.js 20+ and PostgreSQL (or create a Supabase PostgreSQL project).
2. Create a database and run `schema.sql` in its SQL editor.
3. Copy `.env.example` to `.env` and fill in `DATABASE_URL`, `SESSION_SECRET`, and `ADMIN_PASSWORD`.
4. Run `npm install`, then `npm start`.
5. Open `http://localhost:3000`; admin dashboard: `http://localhost:3000/admin`.

### Test on another device on the same Wi-Fi
- The server listens on all network interfaces. Keep the computer running the server connected to the same Wi-Fi as the phone/other device.
- In Windows PowerShell, run `ipconfig` and find the active Wi-Fi adapter IPv4 Address (for example, `192.168.1.25`).
- On the other device, open `http://YOUR-COMPUTER-IP:3000` (for example, `http://192.168.1.25:3000`). For the admin page, add `/admin`.
- If Windows Firewall asks, allow Node.js on Private networks only. Do not expose the local server directly to the public internet; deploy it to Render for public access. This local address only works while both devices are on the same network and the server is running.

## Render deployment
- Create a Web Service from this repository.
- Build command: `npm install`
- Start command: `npm start`
- Add environment variables from `.env.example`.
- Run `schema.sql` once against the Supabase database before opening registration.
- Use a strong, unique `SESSION_SECRET` and `ADMIN_PASSWORD`.
- Set `NODE_ENV=production`.

## Important implementation notes
- The public counter counts successful registration records and shows progress toward 200. The 200-person figure is a target, not a registration cap; registration is not blocked when the count reaches or exceeds 200.
- Offline payments are recorded as `pending`; authorized admins can mark them paid.
- CSV exports require an authenticated admin session.
- Registration records are stored in PostgreSQL, not in the Render filesystem.
- The duplicate check blocks an exact match of normalized name, age, division and academic category. Review possible name collisions manually.
- Before public launch, add the organizers' approved privacy contact details and confirm the payment/attendance policy wording.
