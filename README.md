# 🚀 Productivity API Platform

A secure, API-first platform for unified Gmail and Calendar integration. Built for developers and users to manage Google service connections, authentication, and data access.

---

## 🏗️ Architecture Overview

| Layer         | Technology Stack                        | Description                                                      |
|-------------- |----------------------------------------|------------------------------------------------------------------|
| Frontend      | Vite + React (SPA), React Router       | Client-side SPA for authentication and Google account management. |
| Backend       | Express.js (Node.js), Passport.js      | RESTful API, business logic, authentication, Google API orchestration. |
| Database      | PostgreSQL (Prisma ORM)                | Stores users, OAuth tokens (encrypted), login identities.        |
| Auth          | Google OAuth2, Form Signup, JWT (HS256)| Google login, phone+password signup, stateless JWT sessions.     |
| Integrations  | Google Cloud Platform APIs             | Gmail and Calendar API access.                                   |
| Deployment    | Docker, GCP Cloud Run                  | Containerized deployment, scalable cloud infrastructure.         |

---

## 🎯 Problem Statement

Developers lack a unified, secure backend for Gmail/Calendar API access. Users have no central interface to manage app permissions.  
**.ai** abstracts OAuth, token storage, and permission handling, exposing consistent APIs for productivity integrations.

---

## ✨ Features

- **Google OAuth & Form Signup:** Secure authentication via Google or phone/password.
- **JWT Auth:** Stateless, short-lived tokens for all protected routes.
- **Account Linking:** Merge Google and phone-based accounts safely.
- **Encrypted Token Storage:** AES-256-GCM for all OAuth tokens.
- **REST APIs:** Gmail (send/fetch), Calendar (fetch/create/update).
- **Frontend SPA:** Minimal UI for login, connecting accounts, viewing events.
- **Containerized:** Ready for deployment on AWS/GCP.

---

## ⚙️ Setup

### 1. Clone & Install

```bash
git clone <repo-url>
cd <repo>
npm install
cd Frontend
npm install
```

### 2. Environment Variables

Create `.env` in root:

```
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/AskOrb.ai

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=http://localhost:4000/auth/google/callback

JWT_SECRET=...
JWT_REFRESH_SECRET=...
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

```

### 3. Database

Run migrations:

```bash
npx prisma migrate dev
```

### 4. Start Backend

```bash
npm run dev
```

### 5. Start Frontend

```bash
cd Frontend
npm run dev
```

---

## 🛠️ API Endpoints

### Auth

- `GET /auth/google` – Start Google OAuth
- `GET /auth/google/callback` – Google OAuth callback
- `POST /api/auth/register` – Form signup (phone/password)
- `POST /api/auth/login` – Login via phone/password
- `GET /auth/status` – Check authentication status
- `POST /auth/logout` – Logout

### Connections

- `GET /api/connections` – List Gmail/Calendar connections
- `DELETE /api/connections/:id` – Remove a connection

### Gmail

- `POST /api/gmail/send` – Send email
- `GET /api/gmail/fetch` – Fetch emails

### Calendar

- `GET /api/calendar/events` – List events
- `POST /api/calendar/events` – Create event
- `PUT /api/calendar/events/:eventId` – Update event

### AI Summary

- `GET /api/summary/daily` – Get AI-powered daily briefing (cached or fresh)
- `POST /api/summary/generate` – Force generate a new summary
- `GET /api/summary/history` – Get summary history
- `GET /api/summary/:id` – Get a specific summary by ID
- `DELETE /api/summary/:id` – Delete a summary
- `GET /api/summary/status/check` – Check LLM configuration status

---

## 🤖 AI Daily Summarization

The platform includes an AI-powered daily briefing feature that:

1. **Aggregates** calendar events and unread emails from all connected accounts
2. **Processes** data through content filtering (PII redaction, sanitization)
3. **Generates** a personalized daily briefing using OpenAI GPT-4o-mini
4. **Caches** summaries for 1 hour to optimize costs and latency

### Setup

Add to your `.env`:

```
OPENAI_API_KEY=sk-...
```

### Features

- Schedule overview with busy hours and free slots
- Email digest with urgency classification
- AI-extracted action items
- Daily productivity focus tip
- Multi-account support (aggregates from all connected accounts)

---

## 🔒 Security

- All protected routes require `Authorization: Bearer <JWT>`.
- Tokens are short-lived (24h), refreshable.
- OAuth tokens stored encrypted (AES-256-GCM).
- No duplicate users (unique phone/email enforced).
- Account linking prevents cross-account conflicts.

---

## 🧪 Testing

- End-to-end flows for signup, login, linking.
- JWT expiry and validation.
- Token encryption/decryption.
- Duplicate prevention.
- API error codes (400, 401, 409).
- Postman collection for API testing.

### Postman Collection

The Postman collection is available at `Postman/Productivity-Postman-Collection.json`. See `Postman/POSTMAN_GUIDE.md` for detailed usage instructions.

**Note:** Postman desktop app doesn't send an `Origin` header, so CORS restrictions don't apply. Requests from Postman will work without needing to add it to the allowed origins list.

---

## 🚀 Deployment

- Multi-stage Dockerfile for frontend/backend.
- GCP Cloud Run ready.
- Prisma migrations via Cloud Run Jobs.
- Database backups before migration.

---

## 📦 Deliverables

- Deployed application (API + SPA)
- Private GitHub repository
- Postman collection

---

## 📚 References

- [Low-Level Design](lld.txt)
- [Todo List](todos.txt)