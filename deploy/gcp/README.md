# GCP Nakama Deployment Notes

This folder contains the production-facing proxy configuration used by `docker-compose.gcp.yml`.

## What this stack does

- Runs CockroachDB locally on the VM
- Runs Nakama with the project Lua modules mounted in
- Places Caddy in front of Nakama for automatic HTTPS on a public hostname
- Keeps CockroachDB, Nakama gRPC, Nakama HTTP, and Nakama Console bound to `127.0.0.1`

Only Caddy exposes public ports:

- `80`
- `443`

## Files

- `../../docker-compose.gcp.yml`
- `./Caddyfile`
- `../../.env.gcp.example`

## Before starting

1. Copy `.env.gcp.example` to `.env.gcp`
2. Replace all placeholder secrets
3. Point your DNS hostname to the VM public IP
4. Ensure ports `80` and `443` are allowed in the GCP firewall

## Start command

Run from the repository root:

```bash
docker compose --env-file .env.gcp -f docker-compose.gcp.yml up -d
```

## Accessing the Nakama console privately

Do not expose port `7351` publicly.

Use SSH tunneling instead:

```bash
gcloud compute ssh YOUR_INSTANCE_NAME --zone YOUR_ZONE -- -L 7351:localhost:7351
```

Then open:

- `http://localhost:7351`
