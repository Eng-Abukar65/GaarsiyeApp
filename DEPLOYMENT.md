# DeliveryApp — Production Deployment Guide

Three deployable units:

| Unit | Path | Technology | Host |
|---|---|---|---|
| Backend API | `backend/` | Node 20 + Express 5 + MySQL | Railway |
| Web app (Admin + Vendor + Worker) | `vendor/` | React 19 + Vite 8 | Vercel |
| Mobile app (Customer + Driver + Car Wash Worker) | `customer/` | Flutter 3.38 | Android APK |

> `admin/` is the **superseded** standalone admin app. The admin UI now lives inside
> `vendor/` at `/admin/*`. Deploy `vendor/` only — deploying `admin/` as well would
> give you two apps fighting over the same accounts.
>
> There is **one** Flutter project, not three. Customer, Driver and Car Wash Worker
> are role-gated shells inside it (`lib/features/{customers,drivers,workers}`),
> selected by the role on the login response. One APK serves all three.

---

## 1. Railway — Backend

### 1.1 Create the services

1. New Project → **Deploy from GitHub repo** → pick this repository.
2. Service → Settings → **Root Directory**: `backend`
3. Same project → **New** → **Database** → **Add MySQL**.
4. Backend service → **Variables** → **Add Variable Reference** → link the MySQL service.

Railway detects Node via Nixpacks. `backend/railway.json` pins the start command and
health check; nothing else is needed.

### 1.2 Environment variables

Set these on the **backend** service. Use `${{ MySQL.* }}` references for the
database — never paste literal credentials.

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Enables the strict CORS allow-list and disables localhost DB fallbacks |
| `MYSQL_URL` | `${{ MySQL.MYSQL_URL }}` | Preferred. Alternatively set the five `MYSQL*` vars below |
| `MYSQLHOST` | `${{ MySQL.MYSQLHOST }}` | Only if not using `MYSQL_URL` |
| `MYSQLPORT` | `${{ MySQL.MYSQLPORT }}` | " |
| `MYSQLUSER` | `${{ MySQL.MYSQLUSER }}` | " |
| `MYSQLPASSWORD` | `${{ MySQL.MYSQLPASSWORD }}` | " |
| `MYSQLDATABASE` | `${{ MySQL.MYSQLDATABASE }}` | " |
| `JWT_SECRET` | *(generate)* | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `SETTINGS_ENCRYPTION_KEY` | *(generate, different value)* | Encrypts stored vendor payment credentials |
| `CORS_ORIGINS` | `https://<your-app>.vercel.app` | Exact origin, no trailing slash, comma-separated for several |
| `CORS_ALLOW_VERCEL_PREVIEWS` | `false` | `true` only while testing preview deployments |
| `ADMIN_COMMISSION_RATE` | `2` | |
| `DELIVERY_BASE_FEE` | `2` | |
| `DELIVERY_PER_KM_FEE` | `0.5` | |
| `ASSIGNMENT_RESPONSE_MINUTES` | `5` | |
| `VENDOR_RESPONSE_MINUTES` | `5` | |
| `TZ` | `Africa/Mogadishu` | |
| `BUSINESS_TIMEZONE` | `Africa/Mogadishu` | |
| `BUSINESS_UTC_OFFSET` | `+03:00` | |
| `DB_TIMEZONE` | `+03:00` | **Do not change** — it preserves the meaning of existing timestamps |
| `SMTP_HOST` | `smtp.gmail.com` | Optional; needed for initial-password emails |
| `SMTP_PORT` | `587` | |
| `SMTP_SECURE` | `false` | |
| `SMTP_USER` | *(your address)* | |
| `SMTP_PASS` | *(Google App Password)* | 16 characters, not your account password |
| `SMTP_FROM` | `Gaarsis App <no-reply@yourdomain>` | |
| `HURMOOD_API_URL` | `https://api.waafipay.net/asm` | Optional; per-vendor credentials are managed in Admin → Settings → Payments |

**Do not set `PORT`.** Railway injects it, and the server already reads
`process.env.PORT`.

### 1.3 Import the database

`backend/schema/railway_import.mysql8.sql` is the current local database
(66 tables, with data), already converted for MySQL 8.

> This file is **git-ignored on purpose**: it contains real customer emails,
> phone numbers, addresses and password hashes. It exists on the machine that
> generated it — transfer it to Railway directly, don't push it to GitHub.

```bash
mysql -h <MYSQLHOST> -P <MYSQLPORT> -u <MYSQLUSER> -p<MYSQLPASSWORD> <MYSQLDATABASE> < backend/schema/railway_import.mysql8.sql
```

Get the connection values from Railway → MySQL service → **Variables**, or use
the **Connect** tab's ready-made command.

To regenerate the dump from a local database later:

```bash
mysqldump -u root deliveryapp --single-transaction --routines --events --triggers --add-drop-table --default-character-set=utf8mb4 --result-file=backend/schema/railway_import.sql
node backend/scripts/prepare-mysql8-dump.js backend/schema/railway_import.sql
```

Starting from an **empty** database instead is also supported — the app creates
its own tables on boot — but then you must seed accounts (§1.5).

### 1.4 Verify

```bash
curl https://<your-backend>.up.railway.app/api/health
curl https://<your-backend>.up.railway.app/api/health/database
```

`/api/health/database` returns `200` with `"missingTables": []` when the schema is
complete, and `503` listing what is missing when it is not.

### 1.5 Seed accounts (only if the database is empty)

```bash
railway run --service backend npm run seed
```

Creates one admin, vendor, customer, delivery driver and car wash worker.
Passwords are bcrypt-hashed at cost 12 and printed **once** to the console.
Existing accounts are never modified unless you pass `--reset-passwords`.

Choose the credentials yourself by setting `SEED_ADMIN_EMAIL`,
`SEED_ADMIN_PASSWORD`, `SEED_VENDOR_PASSWORD`, … before running.

---

## 2. Vercel — Web app

### 2.1 Create the project

1. **Add New → Project** → import this repository.
2. **Root Directory**: `vendor`
3. Framework preset: **Vite** (auto-detected). Build command and output directory
   come from `vendor/vercel.json`.

### 2.2 Environment variables

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://<your-backend>.up.railway.app/api` |
| `VITE_MAPBOX_ACCESS_TOKEN` | *(optional — falls back to free CartoDB tiles)* |
| `VITE_GOOGLE_MAPS_API_KEY` | *(optional)* |

`VITE_*` variables are inlined at **build** time. Changing one in Vercel requires a
redeploy before it takes effect. The URL must be `https://` (the site is HTTPS, so a
`http://` API is blocked as mixed content), must end in `/api`, and must not have a
trailing slash.

### 2.3 Deploy

Push to the default branch, or:

```bash
npm i -g vercel
cd vendor
vercel --prod
```

### 2.4 Page refresh on a deep link

Handled by `vendor/vercel.json`, which rewrites every unmatched path to
`/index.html` so React Router can take over. Without it, reloading
`/admin/vendors` returns Vercel's 404.

### 2.5 Close the loop

After the Vercel domain exists, set `CORS_ORIGINS` on Railway to that exact
origin and redeploy the backend. The browser cannot call the API until you do.

---

## 3. Flutter — Android

### 3.1 Point the app at the backend

The base URL lives in exactly one place:
`customer/lib/core/constants/api_constants.dart`.

Either edit `productionUrl` there, or override it per build (preferred — nothing
to commit):

```bash
flutter build apk --release --dart-define=API_BASE_URL=https://<your-backend>.up.railway.app/api
```

A release build uses that URL and nothing else. It will not fall back to a LAN
address — a fallback on a customer's phone either fails to resolve or reaches an
unrelated device on their network.

### 3.2 Build

```bash
cd customer
flutter clean
flutter pub get
flutter analyze
flutter test
flutter build apk --release --dart-define=API_BASE_URL=https://<your-backend>.up.railway.app/api
```

Output: `customer/build/app/outputs/flutter-apk/app-release.apk`

Rename for distribution — one APK covers all three roles:

```bash
cp build/app/outputs/flutter-apk/app-release.apk DeliveryApp-release.apk
```

Split per-ABI to roughly halve the download size:

```bash
flutter build apk --release --split-per-abi --dart-define=API_BASE_URL=https://<your-backend>.up.railway.app/api
```

### 3.3 Android App Bundle (Google Play)

```bash
flutter build appbundle --release --dart-define=API_BASE_URL=https://<your-backend>.up.railway.app/api
```

Output: `customer/build/app/outputs/bundle/release/app-release.aab`.
Play requires an `.aab`, and requires it to be signed with a real upload key (§3.4).

### 3.4 Release signing

Not yet configured — release builds currently use the **debug** key. The APK
installs and runs, but Google Play will reject it. Gradle prints a warning
saying so on every release build.

To configure it:

```bash
cd customer
keytool -genkey -v -keystore android/app/gaarsis-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias gaarsis
```

(`keytool` ships with the JDK. If it is not on PATH:
`& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe"`.)

Then copy `android/key.properties.example` to `android/key.properties` and fill in
the two passwords you just chose plus the alias. `build.gradle.kts` picks the
keystore up automatically on the next release build.

`android/key.properties`, `*.jks` and `*.keystore` are in `.gitignore`. **Back the
keystore up privately** — lose it and you can never publish an update to the same
Play listing again.

### 3.5 Install

```bash
adb install -r DeliveryApp-release.apk
```

Or copy the APK to the device and open it, having allowed "Install unknown apps"
for the file manager.

The application id is `com.gaarsis.deliveryapp`. It changed from
`com.example.deliveryapp` (which Play rejects), so this installs alongside any
previously sideloaded build rather than upgrading it — uninstall the old one first.

---

## 4. Test accounts

`npm run seed` prints freshly generated passwords once and stores only bcrypt
hashes. Emails default to:

| Role | Default email | Logs in at |
|---|---|---|
| Admin | `admin@deliveryapp.com` | Web → `/login` |
| Vendor | `vendor@deliveryapp.com` | Web → `/login` |
| Car Wash Worker | `worker@deliveryapp.com` | Web → `/login`, and the mobile app |
| Customer | `customer@deliveryapp.com` | Mobile app |
| Delivery Driver | `driver@deliveryapp.com` | Mobile app |

Admin, Vendor and Car Wash Worker all authenticate through
`POST /api/auth/staff/login`, which decides the role from the account itself.

---

## 5. Roles stay separate

Delivery Drivers and Car Wash Workers are different identities and cannot be
assigned to each other's work. This is enforced at three levels:

1. **Tokens** — a driver token carries `role: driver`, a worker token
   `role: car_wash_worker`. Each role's routes reject the other's token with 403.
2. **Assignment queries** — `assignDriverToOrder` only selects from `drivers`;
   car-wash assignment only selects from `car_wash_workers`. Separate tables,
   separate id spaces.
3. **Foreign keys** — `deliveries.driver_id → drivers.id` and
   `car_wash_bookings.worker_id → car_wash_workers.id`. A cross-assignment cannot
   be written even if the application code were wrong.

---

## 6. Local development

```bash
# Backend  (http://localhost:5001)
cd backend && npm install && npm run dev

# Web app  (http://localhost:5173)
cd vendor && npm install && npm run dev

# Mobile
cd customer && flutter run
```

Debug builds probe `10.0.2.2` (emulator), `localhost` (with
`adb reverse tcp:5001 tcp:5001`) and the LAN addresses listed in
`api_constants.dart`. Add your machine's current IP there when testing on a
physical device.
