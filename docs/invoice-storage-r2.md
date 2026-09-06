# Invoice file storage (Cloudflare R2)

Production stores receipt files in a **private** Cloudflare R2 bucket. The API still serves files via `GET /invoices/:id/file` with JWT — no public bucket or presigned URLs.

## Local development

```env
STORAGE_DRIVER=local
```

Files are written under `{project}/invoices/{userId}/{invoiceId}.{ext}`. No R2 account required.

## Production setup (Render)

### 1. Create R2 bucket

1. Cloudflare Dashboard → **R2** → **Create bucket**
2. Name: `taxsmart-invoices-prod`
3. Keep bucket **private** (default)

### 2. Create API token

1. R2 → **Manage R2 API Tokens** → **Create API Token**
2. Permissions: Object Read & Write on `taxsmart-invoices-prod`
3. Copy **Access Key ID** and **Secret Access Key**

### 3. Render environment variables

Add to the `taxsmart-backend` Web Service:

```env
STORAGE_DRIVER=s3
S3_BUCKET=taxsmart-invoices-prod
S3_REGION=auto
S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=<from R2 token>
S3_SECRET_ACCESS_KEY=<from R2 token>
```

Deploy after setting env vars. No Prisma migration — `Invoice.fileUrl` stores the object key (`invoices/{userId}/{invoiceId}.{ext}`).

## Greenfield cutover

- Do **not** migrate files from Render disk (`uploads/`)
- Existing prod invoices uploaded before this change will not have files in R2
- Users can re-upload receipts after cutover

## Free tier

Cloudflare R2 free tier (~10 GB) is sufficient for portfolio/MVP usage.
