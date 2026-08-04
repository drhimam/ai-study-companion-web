import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { neon, Pool } from "@neondatabase/serverless";

export interface Env {
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
  AI_API_KEY?: string;
  AI_BASE_URL?: string;
  AI_MODEL?: string;
  AI_TEMPERATURE?: string;
  AI_SYSTEM_PROMPT?: string;
  OPENAI_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  GEMINI_API_KEY?: string;
}

function getCorsHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "*";
  const requestedHeaders = request.headers.get("Access-Control-Request-Headers") || "Content-Type, Authorization, X-Client-Info, Accept";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": requestedHeaders,
    "Access-Control-Allow-Credentials": "true",
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const cors = getCorsHeaders(request);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);

    // Build dynamic trusted origins list for custom domain support
    const reqOrigin = request.headers.get("Origin");
    const trustedOrigins = [
      "https://ai.qbanks.org",
      "http://ai.qbanks.org",
      "https://ai-study-companion.pages.dev",
      "http://localhost:5173",
      "http://localhost:3000",
      url.origin,
    ];
    if (reqOrigin && !trustedOrigins.includes(reqOrigin)) {
      trustedOrigins.push(reqOrigin);
    }

    // Healthcheck endpoint
    if (url.pathname === "/api/health") {
      try {
        const sql = neon(env.DATABASE_URL);
        const userCheck = await sql`SELECT count(*) FROM "user"`;
        return jsonResponse({
          status: "ok",
          dbConnected: true,
          userCount: userCheck[0]?.count || 0,
          databaseUrlSet: Boolean(env.DATABASE_URL),
        }, 200, cors);
      } catch (err: any) {
        return jsonResponse({
          status: "error",
          dbConnected: false,
          error: err.message,
          databaseUrlSet: Boolean(env.DATABASE_URL),
        }, 500, cors);
      }
    }

    // 1. Better Auth Routing
    if (url.pathname.startsWith("/api/auth")) {
      try {
        const pool = new Pool({ connectionString: env.DATABASE_URL });
        const auth = betterAuth({
          database: pool,
          secret: env.BETTER_AUTH_SECRET || "default_auth_secret_for_development_32chars",
          baseURL: env.BETTER_AUTH_URL || url.origin,
          emailAndPassword: { enabled: true },
          plugins: [bearer()],
          trustedOrigins,
        });

        const response = await auth.handler(request);
        const newHeaders = new Headers(response.headers);
        Object.entries(cors).forEach(([k, v]) => newHeaders.set(k, v));
        return new Response(response.body, {
          status: response.status,
          headers: newHeaders,
        });
      } catch (err: any) {
        console.error("Auth handler error:", err);
        return new Response(JSON.stringify({ error: err.message || "Authentication Service Error" }), {
          status: 500,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
    }

    // Authenticate user session for API routes
    let userId: string | null = null;
    try {
      const pool = new Pool({ connectionString: env.DATABASE_URL });
      const auth = betterAuth({
        database: pool,
        secret: env.BETTER_AUTH_SECRET || "default_auth_secret_for_development_32chars",
        baseURL: env.BETTER_AUTH_URL || url.origin,
        emailAndPassword: { enabled: true },
        plugins: [bearer()],
        trustedOrigins,
      });

      const sessionObj = await auth.api.getSession({
        headers: request.headers,
      });

      if (sessionObj?.user?.id) {
        userId = sessionObj.user.id;
      }
    } catch (err) {
      console.warn("Session check error:", err);
    }

    // 2. Application REST Endpoints
    if (url.pathname.startsWith("/api/notebooks")) {
      if (!userId) return jsonError("Unauthorized", 401, cors);
      const sql = neon(env.DATABASE_URL);

      if (request.method === "GET") {
        const notebooks = await sql`
          SELECT * FROM notebooks WHERE user_id = ${userId} ORDER BY updated_at DESC
        `;
        return jsonResponse(notebooks, 200, cors);
      }

      if (request.method === "POST") {
        const body = await request.json() as { title: string };
        const inserted = await sql`
          INSERT INTO notebooks (user_id, title) VALUES (${userId}, ${body.title})
          RETURNING *
        `;
        return jsonResponse(inserted[0], 200, cors);
      }

      const pathParts = url.pathname.split("/").filter(Boolean);
      const notebookId = pathParts[2];

      if (notebookId && request.method === "PATCH") {
        const body = await request.json() as { title?: string; pinned?: boolean };
        let updated;
        if (body.title !== undefined) {
          updated = await sql`
            UPDATE notebooks SET title = ${body.title}, updated_at = now()
            WHERE id = ${notebookId} AND user_id = ${userId} RETURNING *
          `;
        } else if (body.pinned !== undefined) {
          updated = await sql`
            UPDATE notebooks SET pinned = ${body.pinned}, updated_at = now()
            WHERE id = ${notebookId} AND user_id = ${userId} RETURNING *
          `;
        }
        return jsonResponse(updated ? updated[0] : null, 200, cors);
      }

      if (notebookId && request.method === "DELETE") {
        await sql`DELETE FROM notebooks WHERE id = ${notebookId} AND user_id = ${userId}`;
        return jsonResponse({ success: true }, 200, cors);
      }
    }

    // 3. Study Materials Endpoints
    if (url.pathname.startsWith("/api/materials")) {
      if (!userId) return jsonError("Unauthorized", 401, cors);
      const sql = neon(env.DATABASE_URL);

      if (request.method === "GET") {
        const notebookId = url.searchParams.get("notebook_id");
        if (notebookId) {
          const materials = await sql`
            SELECT * FROM study_materials WHERE notebook_id = ${notebookId} AND user_id = ${userId} ORDER BY created_at DESC
          `;
          return jsonResponse(materials, 200, cors);
        } else {
          const materials = await sql`
            SELECT * FROM study_materials WHERE user_id = ${userId} ORDER BY created_at DESC
          `;
          return jsonResponse(materials, 200, cors);
        }
      }

      if (request.method === "POST") {
        const body = await request.json() as { notebook_id: string; type: string; title: string; content: any };
        const inserted = await sql`
          INSERT INTO study_materials (notebook_id, user_id, type, title, content)
          VALUES (${body.notebook_id}, ${userId}, ${body.type}, ${body.title}, ${JSON.stringify(body.content)})
          RETURNING *
        `;
        return jsonResponse(inserted[0], 200, cors);
      }

      const pathParts = url.pathname.split("/").filter(Boolean);
      const materialId = pathParts[2];

      if (materialId && request.method === "PATCH") {
        const body = await request.json() as { title?: string; content?: any };
        let updated;
        if (body.title !== undefined && body.content !== undefined) {
          updated = await sql`
            UPDATE study_materials SET title = ${body.title}, content = ${JSON.stringify(body.content)}, updated_at = now()
            WHERE id = ${materialId} AND user_id = ${userId} RETURNING *
          `;
        } else if (body.title !== undefined) {
          updated = await sql`
            UPDATE study_materials SET title = ${body.title}, updated_at = now()
            WHERE id = ${materialId} AND user_id = ${userId} RETURNING *
          `;
        } else if (body.content !== undefined) {
          updated = await sql`
            UPDATE study_materials SET content = ${JSON.stringify(body.content)}, updated_at = now()
            WHERE id = ${materialId} AND user_id = ${userId} RETURNING *
          `;
        }
        return jsonResponse(updated ? updated[0] : null, 200, cors);
      }

      if (materialId && request.method === "DELETE") {
        await sql`DELETE FROM study_materials WHERE id = ${materialId} AND user_id = ${userId}`;
        return jsonResponse({ success: true }, 200, cors);
      }
    }

    // 4. AI Proxy Endpoint
    if (url.pathname === "/api/ai-proxy" && request.method === "POST") {
      if (!userId) return jsonError("Unauthorized", 401, cors);
      return handleAiProxy(request, env, cors);
    }

    return jsonError("Not Found", 404, cors);
  },
};

function jsonResponse(data: any, status = 200, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonError(message: string, status = 400, corsHeaders: Record<string, string>) {
  return jsonResponse({ error: message }, status, corsHeaders);
}

async function handleAiProxy(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const body = await request.json() as {
      turns?: Array<{ role: string; content: string }>;
      action?: string;
    };

    const apiKey = env.AI_API_KEY || env.OPENAI_API_KEY || env.DEEPSEEK_API_KEY || env.GEMINI_API_KEY;
    if (!apiKey) {
      return jsonError("Server AI API key is not configured in worker environment variables (AI_API_KEY).", 500, corsHeaders);
    }

    const rawBaseUrl = (env.AI_BASE_URL || "https://api.openai.com/v1").trim().replace(/\/$/, "");
    const model = env.AI_MODEL || "gpt-4o-mini";
    const temperature = parseFloat(env.AI_TEMPERATURE || "0.7");
    const systemPrompt = env.AI_SYSTEM_PROMPT || "You are an expert AI academic tutor.";

    let targetUrl = `${rawBaseUrl}/chat/completions`;
    if (rawBaseUrl.endsWith("/chat/completions")) {
      targetUrl = rawBaseUrl;
    }

    const turns = body.turns || [];
    const messages = turns.some((t) => t.role === "system")
      ? turns
      : [{ role: "system", content: systemPrompt }, ...turns];

    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature,
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return jsonError(`LLM Provider Error (${response.status} at ${targetUrl}): ${errorText.slice(0, 300)}`, response.status, corsHeaders);
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content || "";

    return jsonResponse({
      role: "assistant",
      content,
      model,
    }, 200, corsHeaders);
  } catch (err: any) {
    return jsonError(err.message || "Proxy Execution Failed", 500, corsHeaders);
  }
}
