# AI Study Companion - Implementation Walkthrough & Troubleshooting Guide

## 1. Introduction

**AI Study Companion** is a modern, full-stack, multi-model AI learning workspace built for students and educators. It transforms study material, notes, and web content into interactive study assets—such as flashcard decks, practice quizzes, study guides, mindmaps, and assignment notes.

### Key Capabilities
- **Multi-Model AI Proxy**: Integrated gateway supporting Gemini, DeepSeek, OpenAI, Groq, Mistral, OpenRouter, Claude, and Manifest Build.
- **Notebook Workspace**: User-scoped threads to organize study materials, chats, and flashcards.
- **Interactive Assets**: AI-generated flashcard decks with SRS status tracking, quizzes, and structured guides.
- **Security & Data Isolation**: Strict user-scoped isolation backed by session token authentication.

---

## 2. Current Architecture & Implemented Stack

1. **Frontend Architecture (Cloudflare Pages)**:
   - Single Page Application (SPA) built with React 18, TypeScript, Tailwind CSS, Lucide icons, and Vite.
   - Live URL: [https://ai-study-companion.pages.dev](https://ai-study-companion.pages.dev)
2. **Backend API & AI Proxy (Cloudflare Workers)**:
   - Built [worker/index.ts](file:///d:/antigravity/ai-study-companion-web/worker/index.ts) serving Better Auth HTTP handlers, REST API endpoints, and server-managed AI Proxy (`/api/ai-proxy`).
   - Live Backend API: `https://ai-study-companion-backend.rifa-numis.workers.dev`
3. **Database (Neon PostgreSQL)**:
   - Serverless PostgreSQL with Better Auth user tables (`user`, `session`, `account`, `verification`) and app domain tables (`notebooks`, `flashcards`, `study_materials`).
4. **CI/CD Automation (GitHub Actions)**:
   - Repository: [https://github.com/drhimam/ai-study-companion-web.git](https://github.com/drhimam/ai-study-companion-web.git)
   - Automated deployment workflow [.github/workflows/deploy.yml](file:///d:/antigravity/ai-study-companion-web/.github/workflows/deploy.yml).

---

## 3. Detailed Struggles, Root Cause Analyses & Resolution Matrix

During the complete implementation and deployment journey, several complex edge-runtime, database, cross-origin, and authentication struggles were encountered and systematically resolved:

### 1. Top-Level Module Throw Causing Blank/Black Screen
- **Phase**: Frontend Static Build Deployment (Phase 4)
- **Struggle**: Upon visiting `https://ai-study-companion.pages.dev`, the browser rendered a completely black screen with zero HTML/JS output.
- **Root Cause**: `src/lib/supabase.ts` contained a top-level module initialization check `if (!url || !anonKey) throw new Error(...)`. When deployed to Cloudflare Pages without legacy Supabase environment variables, this top-level exception was thrown during JavaScript evaluation before React could call `createRoot().render()`.
- **Resolution**: Removed the top-level error throw in `supabase.ts`, replaced Supabase PostgREST calls with clean REST API calls ([src/lib/api.ts](file:///d:/antigravity/ai-study-companion-web/src/lib/api.ts)), and wrapped root rendering in an ErrorBoundary.

### 2. Cloudflare Worker Edge Database Adapter & CORS Preflight (`Failed to Fetch`)
- **Phase**: Auth Handler Setup (Phase 4 & 5)
- **Struggle**: Sign-up attempts failed immediately with browser error `TypeError: Failed to fetch`.
- **Root Cause**: 
  1. `betterAuth` inside Cloudflare Worker required a database connection pool adapter (`Pool` from `@neondatabase/serverless`). Passing unpooled connection handles threw internal exceptions that dropped requests before headers were written.
  2. Browser CORS preflight requests (`OPTIONS /api/auth/sign-up/email`) sent custom headers (e.g. `better-auth-client-id`) that were rejected because preflight `Access-Control-Allow-Headers` did not dynamically echo requested headers.
- **Resolution**: Instantiated `betterAuth({ database: new Pool({ connectionString: env.DATABASE_URL }) })` and updated `getCorsHeaders(request)` to dynamically reflect `Access-Control-Request-Headers`.

### 3. PostgreSQL Column Case Sensitivity (`Failed to create user`)
- **Phase**: Database User Creation (Phase 5)
- **Struggle**: Submitting sign-up form returned error message `Failed to create user` (HTTP 422).
- **Root Cause**: Better Auth's default ORM generates queries with quoted camelCase column names (`"emailVerified"`, `"createdAt"`, `"updatedAt"`, `"userId"`, `"expiresAt"`). The initial SQL schema created unquoted snake_case columns (`email_verified`), causing PostgreSQL to reject column insertion.
- **Resolution**: Rewrote [better_auth_neon_schema.sql](file:///d:/antigravity/ai-study-companion-web/supabase/migrations/better_auth_neon_schema.sql) with exact quoted camelCase column definitions for `"user"`, `"session"`, `"account"`, and `"verification"` tables.

### 4. Cross-Domain 3rd-Party Cookie Blocking
- **Phase**: User Dashboard Navigation (Phase 5)
- **Struggle**: User accounts were created successfully in Neon, but signing in kept the user stuck on the Auth screen instead of entering the Dashboard.
- **Root Cause**: Frontend hosted on `pages.dev` and backend hosted on `workers.dev` form cross-site domains. Modern browsers block 3rd-party cross-site cookies, causing `useSession()` cookie checks to return `session: null`.
- **Resolution**: Integrated the `bearer()` plugin in Better Auth client & server. Stored `token` in `localStorage` upon login and attached `Authorization: Bearer <token>` in [AuthContext.tsx](file:///d:/antigravity/ai-study-companion-web/src/context/AuthContext.tsx) to resolve session status 100% reliably.

### 5. Unauthenticated REST Requests for Notebook Creation (`401 Unauthorized`)
- **Phase**: Dashboard Notebook Creation (Phase 6)
- **Struggle**: Clicking "+ New Notebook" displayed error message `"Could not create the notebook. Please try again."`.
- **Root Cause**: `apiFetch` in `src/lib/api.ts` was executing HTTP requests to `/api/notebooks` without attaching the session Bearer token from `localStorage`, causing worker-side authorization checks to reject requests.
- **Resolution**: Updated `apiFetch` in [src/lib/api.ts](file:///d:/antigravity/ai-study-companion-web/src/lib/api.ts) to automatically inject `Authorization: Bearer <token>`, and updated worker to verify sessions natively via `auth.api.getSession({ headers: request.headers })`.

### 6. AI Proxy Missing Prompt Helper & Relative Target Path (`405 Method Not Allowed`)
- **Phase**: AI Chat Response (Phase 6)
- **Struggle**: Sending a message to the AI tutor displayed `⚠️ buildTurns is not defined` followed by `⚠️ Request failed (405)`.
- **Root Cause**:
  1. `buildTurns` helper function was missing from `src/lib/ai.ts`.
  2. `API_PROXY_URL` in `src/lib/ai.ts` evaluated to relative path `/api/ai-proxy` during Vite build. Sending POST to static host `pages.dev` returned `405 Method Not Allowed`.
- **Resolution**: Implemented `buildTurns` in `src/lib/ai.ts`, added explicit `WORKER_BASE_URL` fallback `https://ai-study-companion-backend.rifa-numis.workers.dev/api/ai-proxy`, and updated worker `handleAiProxy` to smartly handle provider base URLs (`manifest.build`).

---

## 4. Phase-by-Phase Implementation Walkthrough

### Phase 1: Foundation & Authentication Migration (Completed)
- **Actions Completed**:
  - Replaced Supabase Auth with Better Auth (`better-auth`).
  - Created Neon schema definition file with Better Auth tables ([better_auth_neon_schema.sql](file:///d:/antigravity/ai-study-companion-web/supabase/migrations/better_auth_neon_schema.sql)).
  - Created Cloudflare Worker API entrypoint ([worker/index.ts](file:///d:/antigravity/ai-study-companion-web/worker/index.ts)) and Wrangler configuration.
  - Successfully compiled production build via `npm run build`.
  - Initialized Git repository, connected remote `https://github.com/drhimam/ai-study-companion-web.git`, and pushed `main` branch.
- **Struggles & Fixes**: Moving from Supabase Auth to Better Auth with Neon DB required decoupling chat message persistence (moved to local browser `localStorage`) while enforcing serverless PostgreSQL for user auth.

### Phase 2: Server-Managed AI Generation Shift (Completed)
- **Actions Completed**:
  - Updated `wrangler.toml` and `worker/index.ts` to manage AI API key (`AI_API_KEY`), Base URL (`AI_BASE_URL`), Model (`AI_MODEL`), and fine-tuning parameters server-side.
  - Refactored [src/lib/ai.ts](file:///d:/antigravity/ai-study-companion-web/src/lib/ai.ts) to remove client-side API key requirements.
  - Updated [SettingsModal.tsx](file:///d:/antigravity/ai-study-companion-web/src/components/SettingsModal.tsx) to feature a Managed AI Gateway badge.
- **Struggles & Fixes**: Shifted AI execution from direct browser API calls to an authenticated edge proxy in Cloudflare Workers.

### Phase 3: Database & Secrets Configuration (Completed)
- **Actions Completed**:
  - Created [.env.example](file:///d:/antigravity/ai-study-companion-web/.env.example) detailing frontend environment variables and Cloudflare Worker secrets.
  - Executed [better_auth_neon_schema.sql](file:///d:/antigravity/ai-study-companion-web/supabase/migrations/better_auth_neon_schema.sql) on Neon PostgreSQL instance (`ep-round-glade-axup7g1g`).
  - Set Worker secrets (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `AI_API_KEY`).
- **Struggles & Fixes**: Handled initial Neon schema execution warnings by adding explicit `DROP TRIGGER IF EXISTS` statements.

### Phase 4: Backend & Frontend Live Deployment (Completed)
- **Actions Completed**:
  - Added `@neondatabase/serverless` and `nodejs_compat` flag for Better Auth edge runtime support.
  - Deployed Backend API & AI Gateway to Cloudflare Workers (`https://ai-study-companion-backend.rifa-numis.workers.dev`).
  - Created Cloudflare Pages project `ai-study-companion` and deployed Vite production bundle (`dist/`).
- **Struggles & Fixes**: Fixed static frontend black screen crash by removing top-level module throws in `supabase.ts`.

### Phase 5: Automated CI/CD GitHub Actions Workflow (Completed)
- **Actions Completed**:
  - Created GitHub Actions workflow [.github/workflows/deploy.yml](file:///d:/antigravity/ai-study-companion-web/.github/workflows/deploy.yml) to automate Cloudflare Worker & Pages deployments on every `git push` to `main`.
  - Linked GitHub repository `drhimam/ai-study-companion-web` to Cloudflare Pages.
- **Struggles & Fixes**: Configured build output directory `dist` and framework preset `None` in Cloudflare Pages dashboard.

### Phase 6: Full Authentication, Notebook & AI Proxy Integration (Completed)
- **Actions Completed**:
  - Resolved `Failed to create user` by adding quoted camelCase columns to Neon PostgreSQL schema.
  - Resolved session navigation locking by integrating `bearer()` token plugin in `AuthContext.tsx`.
  - Resolved notebook creation failure by attaching `Authorization: Bearer <token>` in `apiFetch` and using native `auth.api.getSession` in worker.
  - Resolved AI chat 405 error by implementing `buildTurns` and setting explicit Worker API proxy endpoint.
- **Struggles & Fixes**: Verified end-to-end user registration, sign-in, notebook creation, and AI tutor streaming live on production URLs.

---

## 5. Verification & Live Deployment Checklist

- [x] **Live Frontend**: [https://ai-study-companion.pages.dev](https://ai-study-companion.pages.dev)
- [x] **Live Backend API**: `https://ai-study-companion-backend.rifa-numis.workers.dev`
- [x] **Live PostgreSQL**: Connected to Neon instance (`ep-round-glade-axup7g1g`)
- [x] **GitHub Repository**: [https://github.com/drhimam/ai-study-companion-web.git](https://github.com/drhimam/ai-study-companion-web.git)
- [x] **User Auth & Registration**: Working 100%
- [x] **Notebook Management**: Working 100%
- [x] **AI Study Tutor Proxy**: Working 100%
