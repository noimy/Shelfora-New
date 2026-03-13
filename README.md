# Shelfora — Inventory Prediction SaaS

> Know exactly when your stock will run out — before it happens.

Shelfora is a full-stack inventory prediction tool for local businesses. It tracks sales, predicts stockouts, and tells you the exact day to reorder — all powered by a Next.js + PostgreSQL backend deployable to Vercel in under 30 minutes.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Database | PostgreSQL via Prisma ORM |
| Hosting | Vercel (frontend + API) |
| DB Hosting | Supabase or Neon (free tiers available) |
| Auth | JWT sessions + bcrypt (built-in, no vendor) |
| Email | Resend |
| Payments | Stripe |
| Cron | Vercel Cron Jobs |

---

## Pricing

| Plan | Price | Products | Key Features |
|---|---|---|---|
| **Basic** | $19.99/mo | 50 | Manual entry, CSV import, email alerts, 1 location |
| **Pro** | $79.99/mo | 500 | POS integrations, barcode scanning, SMS, API, 3 locations |
| **Enterprise** | $169.99/mo | Unlimited | Everything + auto PO drafts, supplier automation, SSO, white-label |

---

## Project Structure

```
shelfora/
├── prisma/
│   ├── schema.prisma          # Full DB schema (users, products, sales, etc.)
│   └── seed.ts                # Demo data seeder
├── src/
│   ├── app/
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── signup/        # POST — create account
│   │       │   ├── login/         # POST — sign in, set cookie
│   │       │   ├── logout/        # POST — clear session
│   │       │   ├── me/            # GET  — current user
│   │       │   └── forgot-password/
│   │       ├── products/
│   │       │   ├── route.ts       # GET list, POST create
│   │       │   └── [id]/
│   │       │       ├── route.ts   # GET, PUT, DELETE
│   │       │       └── adjust/    # POST — inventory adjustment
│   │       ├── sales/
│   │       │   ├── route.ts       # GET history, POST single/bulk
│   │       │   ├── barcode-scan/  # POST — scan barcode → record sale
│   │       │   └── csv-import/    # POST — upload CSV
│   │       ├── predictions/       # GET all, POST recalculate
│   │       ├── alerts/            # GET, PATCH (mark read)
│   │       ├── integrations/      # GET, POST connect, DELETE disconnect
│   │       ├── analytics/         # GET aggregated charts data
│   │       ├── audit/             # GET filterable audit log
│   │       ├── settings/          # GET, PATCH business + notif settings
│   │       ├── billing/
│   │       │   ├── checkout/      # POST — Stripe checkout session
│   │       │   ├── portal/        # POST — Stripe customer portal
│   │       │   └── webhook/       # POST — Stripe webhook handler
│   │       ├── webhooks/
│   │       │   └── sale/          # POST — receive POS sale events
│   │       └── cron/
│   │           └── daily/         # GET — nightly predictions + emails
│   ├── lib/
│   │   ├── db.ts              # Prisma singleton
│   │   ├── auth.ts            # JWT, sessions, cookies
│   │   ├── predictions.ts     # Core prediction engine
│   │   ├── email.ts           # Resend email templates
│   │   └── plans.ts           # Plan limits and feature gating
│   └── middleware.ts          # Auth guard for all routes
├── .env.example               # All required env vars documented
├── vercel.json                # Cron schedule + function timeouts
├── next.config.js
└── tsconfig.json
```

---

## Deployment Guide — Step by Step

### Step 1 — Set up your database (Supabase — free)

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Click **New project**
3. Give it a name (e.g. `shelfora-prod`), set a strong password, pick a region close to your users
4. Wait ~2 minutes for it to provision
5. Go to **Settings → Database → Connection string**
6. Copy the **URI** (with `pgbouncer=true` for `DATABASE_URL`) and the **Direct connection** (for `DIRECT_URL`)

> **Alternative:** [Neon](https://neon.tech) also offers a free PostgreSQL tier and works identically.

---

### Step 2 — Set up Resend (email)

1. Go to [resend.com](https://resend.com) and create an account
2. Add and verify your domain (e.g. `shelfora.com` or your own domain)
3. Go to **API Keys → Create API Key**
4. Copy the key — this is your `RESEND_API_KEY`
5. Set `EMAIL_FROM` to something like `Shelfora <alerts@yourdomain.com>`

> Without a verified domain you can only send to the email you signed up with. Fine for testing.

---

### Step 3 — Set up Stripe (payments)

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com) and create an account
2. Create three products:
   - **Shelfora Basic** → $19.99/month recurring → copy Price ID → `STRIPE_BASIC_PRICE_ID`
   - **Shelfora Pro** → $79.99/month recurring → copy Price ID → `STRIPE_PRO_PRICE_ID`
   - **Shelfora Enterprise** → $169.99/month recurring → copy Price ID → `STRIPE_ENTERPRISE_PRICE_ID`
3. Go to **Developers → API Keys** → copy Secret Key → `STRIPE_SECRET_KEY`
4. Go to **Developers → Webhooks → Add endpoint**:
   - URL: `https://yourapp.vercel.app/api/billing/webhook`
   - Events to listen for: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
   - Copy the signing secret → `STRIPE_WEBHOOK_SECRET`

---

### Step 4 — Deploy to Vercel

#### Option A — GitHub (recommended)

```bash
# 1. Push to GitHub
git init
git add .
git commit -m "Initial Shelfora backend"
git remote add origin https://github.com/yourusername/shelfora.git
git push -u origin main

# 2. Go to vercel.com → New Project → Import from GitHub
# 3. Select your repo
# 4. Framework: Next.js (auto-detected)
# 5. Add environment variables (see Step 5 below)
# 6. Click Deploy
```

#### Option B — Vercel CLI

```bash
npm i -g vercel
vercel login
vercel --prod
```

---

### Step 5 — Add environment variables in Vercel

In your Vercel project → **Settings → Environment Variables**, add:

```
NEXT_PUBLIC_URL          = https://yourapp.vercel.app
DATABASE_URL             = postgresql://... (from Supabase, with ?pgbouncer=true)
DIRECT_URL               = postgresql://... (from Supabase, direct connection)
JWT_SECRET               = [generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"]
RESEND_API_KEY           = re_xxxxxxxxx
EMAIL_FROM               = Shelfora <alerts@yourdomain.com>
STRIPE_SECRET_KEY        = sk_live_xxxxxxxxx
STRIPE_WEBHOOK_SECRET    = whsec_xxxxxxxxx
STRIPE_BASIC_PRICE_ID    = price_xxxxxxxxx
STRIPE_PRO_PRICE_ID      = price_xxxxxxxxx
STRIPE_ENTERPRISE_PRICE_ID = price_xxxxxxxxx
WEBHOOK_SECRET           = [generate random 32 bytes hex]
CRON_SECRET              = [generate random 32 bytes hex]
ADMIN_SECRET             = [generate random 32 bytes hex]
```

---

### Step 6 — Run database migrations

After your first deploy, run the migrations from your local machine:

```bash
# Install dependencies
npm install

# Copy env vars locally
cp .env.example .env.local
# Fill in your actual values

# Push schema to database (creates all tables)
npm run db:push

# Optional: seed demo data
npm run db:seed
```

> After `db:push` succeeds, your Supabase database will have all 10 tables created and ready.

---

### Step 7 — Verify it's working

1. Visit `https://yourapp.vercel.app`
2. Click **Sign up** — create an account
3. Check your email for a verification link
4. Add your first product and log a sale
5. Go to Dashboard — predictions should appear within seconds

**Test the cron job manually:**
```
GET https://yourapp.vercel.app/api/cron/daily
Authorization: Bearer YOUR_CRON_SECRET
```

**Test the webhook:**
```bash
curl -X POST https://yourapp.vercel.app/api/webhooks/sale \
  -H "Content-Type: application/json" \
  -d '{
    "transaction_id": "test_001",
    "business_id": "YOUR_BUSINESS_ID",
    "timestamp": "2026-03-13T14:22:00",
    "items": [{ "product_id": "SKU-001", "quantity": 2 }]
  }'
```

---

## API Reference

All API routes require a valid session cookie or `Authorization: Bearer <token>` header.

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/signup` | Create account |
| POST | `/api/auth/login` | Sign in |
| POST | `/api/auth/logout` | Sign out |
| GET | `/api/auth/me` | Current user + business |
| POST | `/api/auth/forgot-password` | Send reset email |

### Products
| Method | Path | Description |
|---|---|---|
| GET | `/api/products` | List all products (with predictions) |
| POST | `/api/products` | Create product |
| GET | `/api/products/:id` | Product detail + sales history |
| PUT | `/api/products/:id` | Update product |
| DELETE | `/api/products/:id` | Archive product |
| POST | `/api/products/:id/adjust` | Inventory adjustment |

### Sales
| Method | Path | Description |
|---|---|---|
| GET | `/api/sales` | Sales history |
| POST | `/api/sales` | Record single sale |
| POST | `/api/sales` (with `sales[]`) | Bulk daily entry |
| POST | `/api/sales/barcode-scan` | Barcode scan → sale |
| POST | `/api/sales/csv-import` | Upload CSV file |

### Other
| Method | Path | Description |
|---|---|---|
| GET | `/api/predictions` | All predictions |
| POST | `/api/predictions` | Force recalculate |
| GET | `/api/alerts` | Unread alerts |
| PATCH | `/api/alerts` | Mark as read |
| GET | `/api/analytics` | Aggregated analytics |
| GET | `/api/audit` | Audit log |
| GET/PATCH | `/api/settings` | Business + notification settings |
| GET/POST/DELETE | `/api/integrations` | POS integrations |
| POST | `/api/webhooks/sale` | POS webhook receiver |
| POST | `/api/billing/checkout` | Stripe checkout |
| POST | `/api/billing/portal` | Stripe billing portal |

---

## Connecting the Frontend

The `shelfora.html` frontend is fully wired to this backend — every button, form, and page makes real API calls. No additional wiring needed.

### Step 1 — Place the frontend file

Put `shelfora.html` in the `/public` folder of this project so it's served from the same domain as the backend:

```
shelfora-backend/
└── public/
    └── shelfora.html   ← place it here
```

It will be accessible at `https://yourapp.vercel.app/shelfora.html`.

Alternatively, host it on a separate domain (Netlify, another Vercel project, etc.) and set `BACKEND_URL` as described below.

### Step 2 — Set BACKEND_URL (if using separate domains)

Open `shelfora.html` and find this line near the top of the `<script>` block:

```js
const BACKEND_URL = '';
```

- **Same domain** (frontend in `/public`): leave it as `''` — all API calls use relative paths automatically.
- **Separate domain**: set it to your backend URL, e.g. `'https://shelfora-api.vercel.app'`.

### Step 3 — Set ADMIN_SECRET in the frontend

The admin panel (triple-click the logo to access) pulls live user and activity data from your backend. Open `shelfora.html` and find:

```js
const ADMIN_SECRET = '';
```

Paste in the same value you set for `ADMIN_SECRET` in your Vercel environment variables.

### Step 4 — Demo account

After running `npm run db:seed`, a demo account is available:
- **Email:** `demo@greenleafcafe.com`
- **Password:** `demo123456`

The "See live demo" button on the landing page uses this account automatically.

---

## POS Integration Setup

### Square
1. Go to [developer.squareup.com](https://developer.squareup.com)
2. Create an app → copy Access Token
3. In Shelfora Integrations page → Connect Square → paste Store ID + Access Token
4. For real-time sync: register your webhook URL in Square Developer Dashboard:
   `https://yourapp.vercel.app/api/webhooks/sale`
5. Map your Square product IDs to Shelfora products via the `posProductId` field

### Shopify
1. Go to your Shopify admin → Apps → Develop apps
2. Create a private app → give it `read_orders` and `read_inventory` permissions
3. Copy the API key → use as Access Token in Shelfora

### All other POS systems
Follow the same pattern — get an API key or access token from your POS dashboard, enter it in the Shelfora integrations page. The webhook endpoint `/api/webhooks/sale` accepts events from any POS that can POST JSON.

---

## Local Development

```bash
# Install dependencies
npm install

# Set up env vars
cp .env.example .env.local
# Fill in values (use a local Postgres or free Supabase for dev)

# Generate Prisma client
npm run db:generate

# Push schema to dev database
npm run db:push

# Seed with demo data
npm run db:seed

# Start dev server
npm run dev
```

Visit `http://localhost:3000` — login with `demo@greenleafcafe.com` / `demo123456`

---

## Security Notes

- Passwords hashed with bcrypt (cost factor 12)
- JWT sessions stored in `httpOnly`, `secure`, `sameSite=lax` cookies
- All API routes authenticated via middleware
- Webhook endpoints verified via HMAC-SHA256 signatures
- Stripe webhooks verified via official SDK
- Cron endpoint protected by `CRON_SECRET` bearer token
- No sensitive data exposed in API responses
- SQL injection impossible — Prisma uses parameterized queries
- Rate limiting: add [Upstash Rate Limit](https://upstash.com) for production

---

## Support

- Email: support@shelfora.com
- Docs: https://docs.shelfora.com

---

## Changelog — v1.1 (Full Release)

The following items were added to complete the production-ready build:

### New Pages (Next.js App Router)
- `/login` — Sign in with email + password
- `/signup` — Account creation with business setup
- `/forgot-password` — Request password reset email
- `/reset-password?token=…` — Set new password from email link
- `/verify-email?token=…` — Confirm email address
- `/dashboard` — Main app: greeting, stat cards, urgent alerts, full stockout table
- `/products` — Product list with search/filter, CSV import, add product modal
- `/products/[id]` — Product detail: prediction cards, quick sale buttons, sales/adjustments tabs
- `/reorders` — Reorder alerts grouped by Critical / Low / Healthy with CSV export
- `/analytics` — KPI cards, daily sales bar chart, category donut chart, top products table
- `/integrations` — POS connect/disconnect, barcode scanner, webhook endpoint viewer
- `/audit` — Paginated audit log with search, filter, and CSV export
- `/settings` — Business profile, notification prefs, billing/upgrade, account management

### New API Routes
- `POST /api/auth/reset-password` — validate token, update password
- `POST /api/auth/verify-email` — mark email as verified

### New Libraries
- `src/lib/rateLimit.ts` — in-memory rate limiter (10 req/15min on auth, 5/hr on signup)
- `src/lib/sms.ts` — Twilio SMS for critical stockout alerts and daily digests
- `src/lib/hooks.ts` — React hooks: `useProducts`, `usePredictions`, `useAlerts`, `useAnalytics`, `useCurrentUser`
- `src/lib/utils.ts` — `fmtDate`, `fmtDateTime`, `formatCurrency`, `greetingFor`, `cn`

### New Components
- `AppShell` — authenticated layout wrapper with auto-redirect on session expiry
- `Sidebar` — navigation with active states and alert badge count
- `Toast` — global notification system (`toast('msg', 'success|error|warn|info')`)
- `Modal` — reusable dialog with ESC-to-close
- `StatusBadge` — stock status indicators
- `DaysBar` — animated days-remaining bar chart

### SMS Alerts (Twilio)
- Nightly cron sends SMS to `smsPhone` when critical products exist
- Configurable: enable/disable per-business in notification settings
- Format: business name, critical count, low count, link to `/reorders`

### Rate Limiting
| Endpoint | Limit |
|---|---|
| Login | 10 requests / 15 min per IP |
| Signup | 5 requests / hour per IP |
| Forgot password | 5 requests / hour per IP |
| General API | 120 requests / min per IP |
| Webhooks | 50 requests / 10 sec per IP |

### Test Suite (Jest)
Run tests: `npm test`
Run with coverage: `npm run test:coverage`

| Test file | Coverage |
|---|---|
| `lib/predictions.test.ts` | Avg daily sales, stockout days, reorder date, status thresholds, recommended qty |
| `lib/auth.test.ts` | Password hashing, verification, salt uniqueness |
| `lib/rateLimit.test.ts` | Allow/block/reset/track-independently |
| `lib/plans.test.ts` | All feature gates for all 3 plans |
| `api/auth.test.ts` | Signup validation, login failures, forgot-password enumeration, reset expiry |
| `api/products.test.ts` | Auth guard, plan limit 403, create/list |
| `api/sales.test.ts` | Stock validation, barcode plan gating, record sale |
| `api/webhooks.test.ts` | Signature, duplicate prevention, product matching |
| `api/alerts.test.ts` | List with unread count, mark read, mark all |
| `api/integrations.test.ts` | Plan gating, connect, disconnect, invalid provider |

### Setup: SMS (Twilio)

1. Go to [twilio.com](https://twilio.com) → create free account (no credit card)
2. Get a phone number from the Twilio console (~$1/month after trial)
3. Copy Account SID, Auth Token, and your Twilio number
4. Add to `.env.local`:
   ```
   TWILIO_ACCOUNT_SID=ACxxxxxxxx
   TWILIO_AUTH_TOKEN=xxxxxxxx
   TWILIO_FROM_NUMBER=+15550001234
   ```
5. In the app: Settings → Notifications → enable SMS Alerts → enter your phone number
6. SMS will fire nightly via the cron job when critical products exist

