# ChatNova

WhatsApp, Messenger and Instagram automation for Meta lead ads: a shared team inbox, instant replies to Lead Ads, a no-code chatbot builder, broadcast campaigns, integrations, analytics and billing.

```
apps/web         Next.js 14 (App Router) - marketing site + dashboard
apps/api         Express 5 + Prisma + Socket.IO + BullMQ worker
packages/shared  Plans, flow types and zod schemas used by both
```

## Local development

Requirements: Node 20+, PostgreSQL 14+. Redis is optional locally (without it, background jobs run in-process).

```bash
npm install
cp apps/api/.env.example apps/api/.env      # set DATABASE_URL and JWT_SECRET
cp apps/web/.env.example apps/web/.env.local
npm run db:migrate                          # creates the tables
npm run db:seed                             # optional demo data: demo@chatnova.app / demo12345
npm run dev                                 # API on :4000, web on :3000
```

Add your email to `SUPER_ADMIN_EMAILS` to access `/admin`.

To receive Meta webhooks locally, expose the API with a tunnel (for example `ngrok http 4000`) and set `API_URL` to the tunnel URL.

## Deploying to Railway (Hobby plan)

The project runs as four Railway services in one project:

| Service  | Source                        | Config file                     |
| -------- | ----------------------------- | ------------------------------- |
| api      | this repo                     | `/apps/api/railway.json`        |
| web      | this repo                     | `/apps/web/railway.json`        |
| Postgres | Railway PostgreSQL template   | -                               |
| Redis    | Railway Redis template        | -                               |

The background worker runs inside the `api` process, so the Hobby plan only needs these four. To scale it separately later, add a third service from this repo using `/apps/api/railway.worker.json` and set `RUN_WORKER=false` on `api`.

### 1. Create the project

1. Push this repo to GitHub.
2. In Railway: **New Project → Deploy from GitHub repo**, pick the repo. This creates the first service; rename it to `api`.
3. **+ New → Database → PostgreSQL**, then **+ New → Database → Redis**.
4. **+ New → GitHub Repo** again with the same repo and name it `web`.

For both `api` and `web`, leave **Root Directory** empty (the repo root, so npm workspaces resolve) and set **Settings → Config-as-code → Railway config file** to the path in the table above.

### 2. API service

**Settings → Networking → Generate Domain** (for example `chatnova-api.up.railway.app`).

**Volumes → New volume**, mount path `/data`. This stores uploaded and downloaded media.

**Variables:**

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
NODE_ENV=production
API_URL=https://<api-domain>
WEB_URL=https://<web-domain>
JWT_SECRET=<long random string>
UPLOAD_DIR=/data/uploads
SUPER_ADMIN_EMAILS=you@example.com
META_APP_ID=...
META_APP_SECRET=...
META_VERIFY_TOKEN=<any random string>
RAZORPAY_KEY_ID=...            # optional
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
STRIPE_SECRET_KEY=...          # optional
STRIPE_WEBHOOK_SECRET=...
GOOGLE_CLIENT_ID=...           # optional, Google sign-in
GOOGLE_SERVICE_ACCOUNT_JSON=...# optional, Google Sheets integration
```

Database migrations run automatically on every deploy (`prisma migrate deploy` in the start command).

### 3. Web service

**Generate Domain**, then set:

```
NEXT_PUBLIC_API_URL=https://<api-domain>
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...   # optional
```

`NEXT_PUBLIC_*` values are compiled into the build, so redeploy `web` after changing them. If you add a custom domain to `web`, update `WEB_URL` on the API too.

## Meta app setup

1. Create an app at [developers.facebook.com](https://developers.facebook.com/apps) of type **Business**. Add the products **WhatsApp**, **Messenger**, **Instagram** and **Facebook Login for Business**.
2. **Facebook Login → Settings → Valid OAuth Redirect URIs:** `https://<api-domain>/api/meta/callback`
3. **Webhooks:**
   - Callback URL: `https://<api-domain>/webhooks/meta`
   - Verify token: your `META_VERIFY_TOKEN`
   - Subscribe to:
     - **WhatsApp Business Account**: `messages`, `message_template_status_update`
     - **Page**: `messages`, `messaging_postbacks`, `message_deliveries`, `message_reads`, `leadgen`
     - **Instagram**: `messages`, `messaging_postbacks`
4. Permissions needed in App Review for production: `whatsapp_business_messaging`, `whatsapp_business_management`, `pages_messaging`, `pages_manage_metadata`, `pages_show_list`, `pages_read_engagement`, `leads_retrieval`, `instagram_basic`, `instagram_manage_messages`, `business_management`.
5. **WhatsApp:** in Business Settings, create a System User with a permanent token that has the WhatsApp permissions. In ChatNova, go to **Channels → Connect WhatsApp** and paste the phone number ID, WABA ID and token.
6. **Messenger, Instagram and Lead Ads:** in ChatNova, go to **Channels → Connect with Facebook**. Pages are subscribed to webhooks automatically. For Lead Ads you may also need to grant the app access in **Business Settings → Integrations → Leads Access**.

## Payments

- **Razorpay (INR):**
  - Webhook URL: `https://<api-domain>/webhooks/razorpay`
  - Events: `payment.captured`
  - Use the same secret as `RAZORPAY_WEBHOOK_SECRET`.
  - Payments are verified in the browser checkout as well, so the webhook is a backup.
- **Stripe (USD):**
  - Webhook URL: `https://<api-domain>/webhooks/stripe`
  - Events: `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`
  - Use the signing secret as `STRIPE_WEBHOOK_SECRET`.

Each successful payment activates the plan for 30 days. Stripe renewals extend it automatically. Super admins can also grant plans manually from `/admin`.

## Public REST API

On the Growth plan and above, create a key under **Integrations → API keys** and send it as `X-API-Key`:

```bash
curl -X POST https://<api-domain>/v1/messages \
  -H "X-API-Key: cn_live_..." -H "Content-Type: application/json" \
  -d '{"phone":"919876543210","text":"Hello from ChatNova"}'
```

The full endpoint reference is in the dashboard under **Integrations → API reference**.
