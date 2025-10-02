# Security Policy

## Supported Versions

Whiskey-DB follows [Semantic Versioning](https://semver.org/).

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | ✅ Full support    |
| < 1.0   | ❌ Not supported   |

Security fixes will only be backported to the latest **minor** release line.

---

## Reporting a Vulnerability

If you discover a security issue, **please do not open a public GitHub issue**.

Instead:
 
- Open a [GitHub Security Advisory](https://docs.github.com/en/code-security/security-advisories/repository-security-advisories/creating-a-repository-security-advisory)

I will investigate and patch as soon as possible.

---

## Deployment Recommendations

This project is designed for **self-hosting**. To reduce your attack surface:

- Always run behind a **TLS-terminating reverse proxy** (Caddy, Nginx, Traefik).
- Expose only the **web frontend (Next.js)** to your LAN/WAN.  
  The FastAPI backend should remain internal to the Docker network.
- Use strong, unique secrets in your `.env` file.
- Never commit your real `.env` or SQLite database files to version control.

---

## Data Security

- By default, Whiskey-DB uses **SQLite** stored in the `/data` volume.  
  For production or shared deployments, configure **Postgres**.
- Regularly **back up** your `/data` volume.
- Uploaded images are stored on disk. Consider serving them through the backend with authentication if hosting outside your LAN.
- Centralised application logs are written to the path defined by `LOG_FILE_PATH` (default `./logs/whiskey_db.log`). Keep that directory on trusted storage and rotate/ship it according to your retention requirements.
- Supply `PUID`/`PGID` so dependency installs can run elevated but immediately reset ownership on generated artifacts, and always enable `COOKIE_SECURE` in HTTPS deployments to keep auth cookies encrypted in transit.

---

## Dependencies

- Backend: [FastAPI](https://fastapi.tiangolo.com/), [SQLModel](https://sqlmodel.tiangolo.com/), [Uvicorn](https://www.uvicorn.org/)
- Frontend: [Next.js](https://nextjs.org/), [React](https://react.dev/)
- We recommend running:
  ```bash
  pip install --upgrade pip
  pip-audit
  npm audit
  ```
  monthly to catch upstream vulnerabilities.

## Responsible Disclosure

We ask that you give us reasonable time to investigate and release a patch before any public disclosure. We are committed to being transparent about confirmed issues and fixes in the [CHANGELOG](./CHANGELOG.md).
