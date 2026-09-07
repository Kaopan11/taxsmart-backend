# 📌 TaxSmart AI — Backend API

> NestJS REST API for receipt upload, Gemini OCR, tax profile management, and estimated **Tax Savings** (Effective-Rate Shield, tax year 2026).

[![NestJS](https://img.shields.io/badge/NestJS-11-red)](https://nestjs.com/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791)](https://www.postgresql.org/)

**Production API:** [taxsmart-backend-u5eh.onrender.com](https://taxsmart-backend-u5eh.onrender.com)  
**Health check:** [GET /health](https://taxsmart-backend-u5eh.onrender.com/health)  
**Frontend:** [taxsmart-frontend.vercel.app](https://taxsmart-frontend.vercel.app)

---

## 📖 Table of Contents

- [Features](#-features)
- [How It Works](#-how-it-works)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Database Schema](#-database-schema)
- [API Reference](#-api-reference)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [Related Repositories](#-related-repositories)
- [Author](#-author)

---

## ✨ Features

- **Authentication** — Register, login, JWT access token + httpOnly refresh cookie, logout, `/auth/me`
- **Invoice OCR** — Upload receipts (JPEG/PNG/WebP/PDF, max 5MB), BullMQ queue, Gemini extraction, duplicate detection
- **Invoice management** — List with search/filter, get, patch, delete, secure file download via API
- **Tax Savings v1** — Tax profile (Individual / Corporate), savings from deductible expenses × effective rate (2026 rules)
- **Admin** — List all users (`ADMIN` role only)
- **Pluggable storage** — Local disk for dev (`STORAGE_DRIVER=local`) or Cloudflare R2 for prod (`STORAGE_DRIVER=s3`)
- **Health check** — `GET /health` for Render and uptime monitors

---

## 🔄 How It Works

### API request lifecycle

```mermaid
sequenceDiagram
  participant FE as Frontend (Vercel)
  participant API as NestJS (Render)
  participant DB as PostgreSQL
  participant R as Redis (Upstash)
  participant S as Storage (local / R2)
  participant AI as Gemini OCR

  FE->>API: POST /auth/login (credentials)
  API->>DB: Validate user + tokens
  API-->>FE: accessToken + refresh cookie

  FE->>API: POST /invoices/upload (Bearer JWT)
  API->>S: Put receipt file
  API->>DB: Create invoice (PENDING)
  API->>R: Enqueue OCR job
  API-->>FE: invoiceId + ocrStatus

  loop Worker polls job
    API->>S: Get file buffer
    API->>AI: Extract receipt fields
    AI-->>API: merchant, amounts, category
    API->>DB: Update COMPLETED / FAILED / DUPLICATE
  end

  FE->>API: GET /tax/savings?year=2026
  API->>DB: Profile + completed invoices
  API-->>FE: taxSavings, effectiveRate
```

### OCR pipeline

```mermaid
flowchart TD
  A["POST /invoices/upload"] --> B[Validate MIME + size]
  B --> C[Save to storage]
  C --> D[Insert invoice PENDING]
  D --> E[Enqueue BullMQ job]
  E --> F[Worker: read file]
  F --> G[Gemini OCR]
  G --> H{Result}
  H -->|Success| I[COMPLETED + parsed fields]
  H -->|Duplicate| J[DUPLICATE]
  H -->|Error| K[FAILED]
  I --> L["GET /invoices/:id"]
  I --> M["GET /invoices/:id/file"]
```

### Auth logic

Access token (short-lived JWT) + refresh token (httpOnly cookie, hashed in DB). Refresh rotation on every use.

```mermaid
flowchart TD
  A["POST /auth/register or /auth/login"] --> B[Validate input]
  B --> C[bcrypt verify or hash password]
  C --> D[Create JWT accessToken]
  D --> E[Generate refresh token]
  E --> F[Store refresh hash in DB]
  F --> G[Set httpOnly cookie]
  G --> H["Return accessToken + user JSON"]

  I[Protected request with Bearer JWT] --> J{Token valid?}
  J -->|Yes| K[Allow request]
  J -->|No / expired| L["POST /auth/refresh"]
  L --> M{Cookie + DB hash valid?}
  M -->|Yes| N[Delete old refresh hash]
  N --> O[Issue new access + refresh]
  M -->|No| P[401 Unauthorized]

  Q["POST /auth/logout"] --> R[Delete refresh hash in DB]
  R --> S[Clear httpOnly cookie]
```

### Tax Savings logic

Estimate only (MVP v1, tax year **2026**). Not a full tax return or e-Filing.

```mermaid
flowchart TD
  A["GET /tax/savings?year=2026"] --> B[Load tax profile]
  B --> C[Load all user invoices]
  C --> D["computeDeductibleExpenses()"]
  D --> E{Per invoice}
  E -->|COMPLETED + valid year + fields| F[Add to deductible sum]
  E -->|Incomplete / wrong year / other status| G[Count in readiness excluded or review]

  F --> H["lookupEffectiveRate()"]
  B --> H
  H --> I[Read rules from tax-rules/2026.json]
  I --> J["effectiveRate from taxpayerType + estimatedIncome"]

  F --> K["computeTaxSavings()"]
  J --> K
  K --> L["taxSavings = deductibleExpenses × effectiveRate"]
  L --> M["Return taxSavings, assumptions, readiness"]
```

### Authorization

Guards run on protected controllers. `@Roles(ADMIN)` requires both JWT and role check.

```mermaid
flowchart TD
  A[Incoming request] --> B{Route type}

  B -->|Public| C["/auth/register, /auth/login, /health"]
  C --> Z[Allow]

  B -->|Protected| D[JwtAuthGuard]
  D --> E{Valid Bearer JWT?}
  E -->|No| F[401 Unauthorized]
  E -->|Yes| G[Attach user to request]

  G --> H{Has @Roles decorator?}
  H -->|No| I["/invoices/*, /tax/*, /auth/me"]
  I --> Z

  H -->|Yes ADMIN| J[RolesGuard]
  J --> K{user.role === ADMIN?}
  K -->|Yes| L["/admin/users"]
  L --> Z
  K -->|No| M[403 Forbidden]
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Runtime** | Node.js 18+ |
| **Framework** | [NestJS 11](https://nestjs.com/) |
| **Database** | PostgreSQL 16 + [Prisma 7](https://www.prisma.io/) (`@prisma/adapter-pg`) |
| **Queue** | [BullMQ](https://docs.bullmq.io/) + Redis |
| **Auth** | JWT + Passport, bcrypt, httpOnly refresh cookies |
| **OCR** | [Google Gemini](https://ai.google.dev/) (`@google/genai`) |
| **File storage** | Local filesystem or S3-compatible ([Cloudflare R2](https://developers.cloudflare.com/r2/)) |
| **Validation** | class-validator, class-transformer |
| **Tests** | Jest, Supertest |
| **Local infra** | Docker Compose (Postgres + Redis) |
| **Deploy** | [Render](https://render.com/) (Web Service + Postgres) |
| **Frontend** | [Next.js app](https://github.com/Kaopan11/taxsmart-frontend) on Vercel |

---

## 📁 Project Structure

```text
taxsmart-backend/
├── prisma/
│   ├── schema.prisma           # User, Invoice, TaxProfile, …
│   └── migrations/             # Postgres migrations
├── src/
│   ├── admin/                  # GET /admin/users
│   ├── auth/                   # JWT, refresh cookies, guards
│   ├── gemini/                 # Gemini OCR service
│   ├── invoices/
│   │   └── storage/            # local + S3/R2 adapters
│   ├── queue/                  # BullMQ OCR processor
│   ├── tax/                    # profile, savings, 2026 rules
│   ├── prisma/                 # PrismaService
│   ├── app.module.ts
│   └── main.ts                 # CORS, cookies, validation
├── scripts/                    # maintenance scripts
├── test/                       # e2e tests
├── docker-compose.yml            # local Postgres :5433, Redis :6379
├── prisma.config.ts
├── .env.example
└── package.json
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+**
- **Docker** (for local Postgres + Redis)
- **Google Gemini API key** (OCR)

### 1. Start local infrastructure

```bash
docker compose up -d
```

| Service | Host | Port |
|---------|------|------|
| PostgreSQL | `localhost` | `5433` |
| Redis | `localhost` | `6379` |

### 2. Install and configure

```bash
git clone https://github.com/Kaopan11/taxsmart-backend.git
cd taxsmart-backend

npm install

cp .env.example .env
# Edit .env — at minimum set GEMINI_API_KEY and JWT_SECRET
```

### 3. Run migrations

```bash
npx prisma migrate dev
# Production: npm run migrate:deploy
```

### 4. Start the API

```bash
npm run start:dev
```

API runs at [http://localhost:3000](http://localhost:3000). Health: [http://localhost:3000/health](http://localhost:3000/health).

### Scripts

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Dev server with watch |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run compiled app |
| `npm run migrate:deploy` | Apply migrations (prod) |
| `npm test` | Unit tests |
| `npm run test:e2e` | E2E tests |
| `npm run test:cov` | Coverage report |

---

## 🔐 Environment Variables

Copy [`.env.example`](.env.example) to `.env`. Never commit secrets.

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default `3000`; Render sets automatically) |
| `NODE_ENV` | No | `development` / `production` |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `GEMINI_API_KEY` | Yes | Google Gemini API key for OCR |
| `REDIS_HOST` | Yes | Redis host (BullMQ) |
| `REDIS_PORT` | Yes | Redis port (default `6379`) |
| `REDIS_PASSWORD` | Prod | Required for Upstash / cloud Redis |
| `REDIS_TLS` | Prod | Set `true` when provider requires TLS |
| `JWT_SECRET` | Yes | Long random string for access tokens |
| `JWT_EXPIRES_IN` | No | Access token TTL (default `15m`) |
| `JWT_REFRESH_EXPIRES_IN` | No | Refresh token TTL (default `7d`) |
| `REFRESH_COOKIE_NAME` | No | Cookie name (default `refresh_token`) |
| `CORS_ORIGINS` | Prod | Comma-separated frontend URLs (**no trailing slash**) |
| `STORAGE_DRIVER` | No | `local` (dev) or `s3` (prod R2) |
| `LOCAL_STORAGE_ROOT` | No | Base dir for local files (default project cwd) |
| `S3_BUCKET` | Prod (s3) | R2 bucket name |
| `S3_REGION` | Prod (s3) | Use `auto` for Cloudflare R2 |
| `S3_ENDPOINT` | Prod (s3) | R2 endpoint URL |
| `S3_ACCESS_KEY_ID` | Prod (s3) | R2 access key |
| `S3_SECRET_ACCESS_KEY` | Prod (s3) | R2 secret key |

**Local example**

```env
DATABASE_URL="postgresql://taxsmart_user:taxsmart_password@localhost:5433/taxsmart_db"
GEMINI_API_KEY=your-gemini-key
JWT_SECRET=change-me-to-a-long-random-string
STORAGE_DRIVER=local
CORS_ORIGINS=http://localhost:3000,http://localhost:4000
```

---

## 🗄️ Database Schema

Managed by Prisma. Main models:

| Model | Table | Purpose |
|-------|-------|---------|
| `User` | `users` | Accounts, roles (`USER`, `ADMIN`) |
| `RefreshToken` | `refresh_tokens` | Hashed refresh tokens |
| `Invoice` | `invoices` | Receipts, OCR status, amounts |
| `InvoiceItem` | `invoice_items` | Line items from OCR |
| `TaxProfile` | `tax_profiles` | Taxpayer type, estimated income, year |

**Commands**

```bash
npx prisma migrate dev      # local: create + apply
npm run migrate:deploy      # prod: apply pending only
npx prisma studio           # optional UI (local DB)
```

Current migration: `20260905180000_init_postgres_schema`

---

## 📡 API Reference

Base URL (local): `http://localhost:3000`  
Base URL (prod): `https://taxsmart-backend-u5eh.onrender.com`

### Authentication

Protected routes require `Authorization: Bearer <accessToken>`.  
Refresh uses httpOnly cookie on `POST /auth/refresh` with `credentials: include`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | Public | Create account + tokens |
| POST | `/auth/login` | Public | Sign in + tokens |
| POST | `/auth/refresh` | Cookie | Rotate access token |
| POST | `/auth/logout` | Cookie | Revoke refresh + clear cookie |
| GET | `/auth/me` | JWT | Current user profile |

### Invoices

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/invoices/upload` | JWT | Upload receipt (`multipart/form-data`, field `file`) → `202` |
| GET | `/invoices` | JWT | List invoices (`?q`, `?status`, `?category`) |
| GET | `/invoices/:id` | JWT | Get one invoice |
| GET | `/invoices/:id/file` | JWT | Download receipt binary |
| PATCH | `/invoices/:id` | JWT | Update parsed fields |
| DELETE | `/invoices/:id` | JWT | Delete invoice + file → `204` |

### Tax

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/tax/profile` | JWT | Get tax profile (or defaults) |
| PUT | `/tax/profile` | JWT | Upsert tax profile |
| GET | `/tax/savings?year=2026` | JWT | Estimated tax savings |

### Admin

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/admin/users` | JWT + `ADMIN` | List all users |

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Public | Hello message |
| GET | `/health` | Public | `{ "status": "ok" }` |

---

## 🧪 Testing

```bash
npm test              # unit tests (*.spec.ts)
npm run test:e2e      # e2e (test/jest-e2e.json)
npm run test:cov      # coverage report
```

Tax module includes calculator, profile, savings, and integration specs under `src/tax/`.

---

## ☁️ Deployment

### Production URLs

| Service | URL |
|---------|-----|
| **API** | https://taxsmart-backend-u5eh.onrender.com |
| **Health** | https://taxsmart-backend-u5eh.onrender.com/health |
| **Frontend** | https://taxsmart-frontend.vercel.app |

### Render (Web Service)

1. Connect [Kaopan11/taxsmart-backend](https://github.com/Kaopan11/taxsmart-backend).
2. Build: `npm install && npm run build`
3. Start: `npm run start:prod`
4. Set environment variables (see below).

### Render (PostgreSQL)

1. Create Postgres instance.
2. Set `DATABASE_URL` (Internal URL on Render; External + `?sslmode=require` for local `migrate deploy`).
3. Run migrations once:

   ```bash
   npx prisma migrate deploy
   ```

### Required production env

```env
NODE_ENV=production
DATABASE_URL=<render-postgres-url>
GEMINI_API_KEY=<valid-google-ai-key>
JWT_SECRET=<long-random-string>
REDIS_HOST=<upstash-host>
REDIS_PORT=6379
REDIS_PASSWORD=<upstash-password>
REDIS_TLS=true
CORS_ORIGINS=https://taxsmart-frontend.vercel.app
STORAGE_DRIVER=s3
S3_BUCKET=<r2-bucket>
S3_REGION=auto
S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=<r2-key>
S3_SECRET_ACCESS_KEY=<r2-secret>
```

### Frontend integration

On Vercel, set:

```env
NEXT_PUBLIC_API_URL=https://taxsmart-backend-u5eh.onrender.com
```

> `CORS_ORIGINS` on the backend must match the frontend origin exactly (no trailing slash).  
> Frontend must send `credentials: "include"` for refresh cookies.

---

## 🔗 Related Repositories

| Repository | Link |
|------------|------|
| **Backend** (this repo) | [github.com/Kaopan11/taxsmart-backend](https://github.com/Kaopan11/taxsmart-backend) |
| **Frontend** | [github.com/Kaopan11/taxsmart-frontend](https://github.com/Kaopan11/taxsmart-frontend) |

---

## 👤 Author

**Kaopan11** — [GitHub](https://github.com/Kaopan11)

---

Built with [NestJS](https://nestjs.com/) and [Prisma](https://www.prisma.io/). Documentation structure inspired by [FreeCodeCamp README best practices](https://www.freecodecamp.org/news/how-to-write-a-good-readme-file).
