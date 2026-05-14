# bullandbear.az Domain Plan

## Decision

Use Cloudflare DNS and test first on:

```txt
https://staging.bullandbear.az
```

When everything is finished, switch the production domain to:

```txt
https://bullandbear.az
https://www.bullandbear.az
```

## Best No-Server Hosting Choice

If you do not want Droplets or Ubuntu, use DigitalOcean App Platform.

For the screen shown in DigitalOcean:

1. Choose **Git repository**.
2. Choose **GitHub**.
3. Select the repository that contains this project.
4. If the repository does not appear, click **Edit your GitHub permissions** and allow DigitalOcean to access the repository.
5. Use branch `main`.
6. Set the app name to `bull-bear-staging`.
7. Add the custom domain `staging.bullandbear.az` after the app is created.

The repo includes an App Platform starter spec:

```txt
.do/app.yaml
```

Replace `YOUR_GITHUB_USERNAME/YOUR_REPOSITORY_NAME` with the real GitHub repository before using that spec directly.

Important: App Platform has ephemeral local file storage. For final production, uploaded videos and PDFs should move to DigitalOcean Spaces, and app data should move to Managed PostgreSQL.

## Best Full-Control Hosting Choice

For this project, the best setup is a VPS with Docker, Nginx, and SSL.

Reason: the app uploads course videos and PDF books, runs a Node backend, scans exchange APIs on an interval, will need payment webhooks, and later should move to PostgreSQL. Static hosting is not ideal for those needs.

## Cloudflare DNS For Testing

Create this record in Cloudflare:

```txt
Type: A
Name: staging
Content: YOUR_SERVER_IP
Proxy: DNS only at first
TTL: Auto
```

After SSL is working, Cloudflare proxy can be turned on if desired.

Set Cloudflare SSL/TLS mode to:

```txt
Full (strict)
```

## Server Environment For Staging

On the VPS, create `.env` from `.env.example` and keep:

```bash
APP_URL=https://staging.bullandbear.az
PORT=3000
```

Before final launch, change it to:

```bash
APP_URL=https://bullandbear.az
```

## Docker Run

The repo includes:

```txt
Dockerfile
docker-compose.yml
deploy/nginx/staging.bullandbear.az.conf
```

Recommended start command on the VPS:

```bash
docker compose up -d --build
```

The app runs privately on:

```txt
127.0.0.1:3000
```

Nginx exposes it publicly through HTTPS.

## Staging Callback URLs

Use these while testing payment and OAuth:

```txt
https://staging.bullandbear.az/payment/success
https://staging.bullandbear.az/payment/failed
https://staging.bullandbear.az/api/payments/webhook/payriff
https://staging.bullandbear.az/api/payments/webhook/epoint
https://staging.bullandbear.az/api/payments/webhook/yigim
https://staging.bullandbear.az/api/auth/oauth/google/callback
https://staging.bullandbear.az/api/auth/oauth/discord/callback
```

## Production Callback URLs

Use these when going live:

```txt
https://bullandbear.az/payment/success
https://bullandbear.az/payment/failed
https://bullandbear.az/api/payments/webhook/payriff
https://bullandbear.az/api/payments/webhook/epoint
https://bullandbear.az/api/payments/webhook/yigim
https://bullandbear.az/api/auth/oauth/google/callback
https://bullandbear.az/api/auth/oauth/discord/callback
```

## Before Going Live

- Keep existing MX/email records unchanged.
- Point `@` and `www` only after staging is approved.
- Change `APP_URL` to `https://bullandbear.az`.
- Update payment provider callback URLs from staging to production.
- Update Google and Discord OAuth callback URLs from staging to production.
- Use strong production secrets in `.env`.
