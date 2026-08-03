import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PROVIDER_BASE: Record<string, string> = {
  deepseek: "https://api.deepseek.com/v1",
  openai: "https://api.openai.com/v1",
  groq: "https://api.groq.com/openai/v1",
  mistral: "https://api.mistral.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  claude: "https://api.anthropic.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
};

type Turn = { role: string; content: string };

/**
 * An error whose message was written by this function for the end user and
 * therefore contains no internal detail. Anything else is logged and replaced
 * with a generic message before it leaves the server.
 */
class UserFacingError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "UserFacingError";
    this.status = status;
  }
}

// --- SSRF protection -------------------------------------------------------

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
  "instance-data",
]);

function isBlockedIpLiteral(host: string): boolean {
  // IPv6 (URL.hostname strips the surrounding brackets)
  if (host.includes(":")) {
    const h = host.toLowerCase();
    if (h === "::" || h === "::1") return true;
    if (h.startsWith("fe80") || h.startsWith("fc") || h.startsWith("fd")) return true;
    // IPv4-mapped IPv6, e.g. ::ffff:127.0.0.1
    const mapped = h.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedIpLiteral(mapped[1]);
    return false;
  }

  const parts = host.split(".");
  if (parts.length !== 4) return false;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = nums;

  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

function assertSafeUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new UserFacingError("That does not look like a valid web address.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UserFacingError("Only http and https addresses are supported.");
  }
  if (parsed.username || parsed.password) {
    throw new UserFacingError("Web addresses with embedded credentials are not allowed.");
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) throw new UserFacingError("That web address has no host.");
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new UserFacingError("That web address is not allowed.");
  }
  if (isBlockedIpLiteral(host)) {
    throw new UserFacingError("That web address is not allowed.");
  }
  return parsed;
}

/**
 * fetch() with the redirect chain resolved by hand so that every hop is
 * re-validated against assertSafeUrl. Without this a public URL can 302 to
 * an internal address and bypass the check above.
 */
async function safeFetch(rawUrl: string, init: RequestInit = {}): Promise<Response> {
  let current = assertSafeUrl(rawUrl).toString();
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(current, { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return res;
      const next = new URL(location, current).toString();
      assertSafeUrl(next);
      current = next;
      continue;
    }
    return res;
  }
  throw new UserFacingError("Too many redirects while loading that web address.");
}

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Turns a provider HTTP status into a message that is useful to the user but
 * carries none of the provider's internal response body.
 */
function providerMessage(label: string, status: number): string {
  if (status === 401 || status === 403) {
    return `${label} rejected your API key. Check the key in Settings.`;
  }
  if (status === 404) {
    return `${label} does not recognise the selected model. Pick a different model in Settings.`;
  }
  if (status === 429) {
    return `${label} is rate limiting your key, or the key is out of credit. Wait a moment and try again.`;
  }
  if (status === 400 || status === 422) {
    return `${label} rejected the request. Try a shorter message or a different model.`;
  }
  if (status >= 500) {
    return `${label} is temporarily unavailable. Please try again shortly.`;
  }
  return `${label} could not complete the request.`;
}

const EMPTY_REPLY_MESSAGE =
  "The AI returned an empty reply. This often happens with reasoning models " +
  "or a very long conversation. Try a standard model, or start a new notebook.";

async function callOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  turns: Turn[],
  extraHeaders: Record<string, string>,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    signal,
    body: JSON.stringify({
      model,
      messages: turns,
      temperature: 0.4,
      stream: false,
      max_tokens: 8192,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`Provider error (${res.status}):`, text.slice(0, 1000));
    throw new UserFacingError(providerMessage("The AI provider", res.status), 502);
  }
  const json = await res.json();
  if (json.error) {
    console.error("Provider error payload:", JSON.stringify(json.error).slice(0, 1000));
    throw new UserFacingError("The AI provider could not complete the request.", 502);
  }
  const msg = json.choices?.[0]?.message;
  if (!msg) {
    console.error("Provider returned no message:", JSON.stringify(json).slice(0, 1000));
    throw new UserFacingError(EMPTY_REPLY_MESSAGE, 502);
  }
  const content = msg.content ?? msg.reasoning_content ?? "";
  if (!content || !content.trim()) {
    console.error(
      "Provider returned empty content. finish_reason:",
      json.choices?.[0]?.finish_reason ?? "unknown",
      JSON.stringify(msg).slice(0, 1000),
    );
    throw new UserFacingError(EMPTY_REPLY_MESSAGE, 502);
  }
  return content;
}

async function callAnthropic(
  apiKey: string,
  model: string,
  turns: Turn[],
  signal?: AbortSignal,
): Promise<string> {
  const system = turns.filter((t) => t.role === "system").map((t) => t.content).join("\n\n");
  const messages = turns.filter((t) => t.role !== "system").map((t) => ({ role: t.role, content: t.content }));

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    signal,
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system,
      messages,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`Claude error (${res.status}):`, text.slice(0, 1000));
    throw new UserFacingError(providerMessage("Claude", res.status), 502);
  }
  const json = await res.json();
  const text = json.content?.map((c: { text?: string }) => c.text).filter(Boolean).join("") ?? "";
  if (!text.trim()) {
    throw new UserFacingError(EMPTY_REPLY_MESSAGE, 502);
  }
  return text;
}

async function callGemini(
  apiKey: string,
  model: string,
  turns: Turn[],
  signal?: AbortSignal,
): Promise<string> {
  const contents = turns
    .filter((t) => t.role !== "system")
    .map((t) => ({
      role: t.role === "assistant" ? "model" : "user",
      parts: [{ text: t.content }],
    }));
  const systemText = turns.find((t) => t.role === "system")?.content;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        contents,
        ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
        generationConfig: { temperature: 0.4 },
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`Gemini error (${res.status}):`, text.slice(0, 1000));
    throw new UserFacingError(providerMessage("Gemini", res.status), 502);
  }
  const json = await res.json();
  if (json.error) {
    console.error("Gemini error payload:", JSON.stringify(json.error).slice(0, 1000));
    throw new UserFacingError("Gemini could not complete the request.", 502);
  }
  const parts = json.candidates?.[0]?.content?.parts;
  const text = parts?.map((p: { text?: string }) => p.text).filter(Boolean).join("") ?? "";
  if (!text.trim()) {
    throw new UserFacingError(EMPTY_REPLY_MESSAGE, 502);
  }
  return text;
}

async function fetchUrlContent(url: string): Promise<{ title: string; content: string }> {
  const res = await safeFetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; AICompanionBot/1.0)" },
    redirect: "follow",
  });
  if (!res.ok) throw new UserFacingError(`That web address could not be loaded (${res.status}).`);
  const html = await res.text();
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : url;
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let body = bodyMatch ? bodyMatch[1] : html;
  body = body
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return { title, content: body.slice(0, 100000) };
}

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/,
    /(?:youtube\.com\/shorts\/)([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  if (/^[\w-]{11}$/.test(url)) return url;
  return null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

const INNERTUBE_CLIENT_VERSION = "2.20240501.00.00";
const INNERTUBE_API_KEY = "AIzaSyAO_FJ2SlqU8Q4STEhlGC_3td7q3z4iCD0";

function extractBalancedJson(html: string, marker: string): any | null {
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const eqIdx = html.indexOf("=", idx);
  if (eqIdx === -1) return null;
  let i = eqIdx + 1;
  while (i < html.length && html[i] === " ") i++;
  if (html[i] !== "{") return null;
  let depth = 0;
  let inStr = false;
  let escape = false;
  const start = i;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(html.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

async function fetchYoutubeTranscript(url: string): Promise<{ title: string; content: string }> {
  const videoId = extractVideoId(url);
  if (!videoId) throw new UserFacingError("Could not extract a YouTube video ID from that URL.");

  // Primary: use youtube-transcript.ai free API (no key, CORS-open, works from cloud IPs)
  try {
    const apiRes = await fetch(`https://youtube-transcript.ai/transcript/${videoId}.txt?lang=en`, {
      headers: { "Accept": "text/markdown, text/plain, */*" },
      redirect: "follow",
    });
    if (apiRes.ok) {
      const text = await apiRes.text();
      if (text && text.length > 20 && !/no captions|not available|unable to fetch/i.test(text.slice(0, 200))) {
        // Extract title from the markdown header if present
        const titleMatch = text.match(/^#\s+Transcript:\s*(.+?)(?:\s+Source video:|\s*$)/m);
        const title = titleMatch ? titleMatch[1].trim() : `YouTube ${videoId}`;
        return { title, content: text.slice(0, 100000) };
      }
    }
  } catch { /* fall through to direct method */ }

  // Fallback: direct YouTube fetch (works from residential IPs, often blocked from cloud)
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const res = await fetch(watchUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new UserFacingError(`Failed to fetch YouTube transcript. The video may have no captions, or the transcript service is temporarily unavailable.`);
  const html = await res.text();

  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()).replace(/\s*-\s*YouTube\s*$/i, "") : `YouTube ${videoId}`;

  let playerData: any = extractBalancedJson(html, "ytInitialPlayerResponse");
  if (!playerData) playerData = extractBalancedJson(html, '"playerResponse"');

  if (!playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
    try {
      const innerRes = await fetch("https://www.youtube.com/youtubei/v1/player?key=" + INNERTUBE_API_KEY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: { client: { clientName: "ANDROID", clientVersion: INNERTUBE_CLIENT_VERSION, hl: "en", gl: "US" } },
          videoId,
        }),
      });
      if (innerRes.ok) playerData = await innerRes.json();
    } catch { /* fall through */ }
  }

  const captionTracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!captionTracks || captionTracks.length === 0) {
    throw new UserFacingError("This video has no captions/subtitles available.");
  }

  const enTrack = captionTracks.find((t: any) => t.languageCode?.startsWith("en")) || captionTracks[0];
  let transcriptUrl: string = enTrack.baseUrl;
  if (!transcriptUrl) throw new UserFacingError("Could not find transcript URL.");
  transcriptUrl = decodeHtmlEntities(transcriptUrl);
  transcriptUrl = transcriptUrl.replace(/&fmt=srv3/, "") + "&fmt=srv3";

  const trRes = await fetch(transcriptUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; AICompanionBot/1.0)" },
    redirect: "follow",
  });
  if (!trRes.ok) throw new UserFacingError(`Failed to fetch transcript (${trRes.status}).`);
  const xml = await trRes.text();

  const segments: string[] = [];
  const re = /<text[^>]*start="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const start = parseFloat(m[1]);
    const text = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, "")).replace(/\n/g, " ").trim();
    if (text) {
      const mins = Math.floor(start / 60);
      const secs = Math.floor(start % 60);
      segments.push(`[${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}] ${text}`);
    }
  }

  if (segments.length === 0) throw new UserFacingError("Transcript was empty or could not be parsed.");
  return { title, content: segments.join("\n").slice(0, 100000) };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Every action below reaches outbound network from the server, so the caller
  // must prove they hold a real session. The anon key is public and is not a
  // credential for this purpose.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!token) return errorResponse(401, "Sign in to use this feature.");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  );
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user) {
    return errorResponse(401, "Sign in to use this feature.");
  }

  try {
    const body = await req.json();
    const action = body.action as string;

    if (action === "fetch-url") {
      const url = body.url as string;
      if (!url) return errorResponse(400, "Missing url.");
      try {
        const result = await fetchUrlContent(url);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return errorResponse(502, err instanceof Error ? err.message : "Fetch failed.");
      }
    }

    if (action === "fetch-youtube") {
      const url = body.url as string;
      if (!url) return errorResponse(400, "Missing url.");
      try {
        const result = await fetchYoutubeTranscript(url);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return errorResponse(502, err instanceof Error ? err.message : "YouTube transcript fetch failed.");
      }
    }

    if (action === "chat") {
      const { provider, model, apiKey, customBaseUrl, turns } = body as {
        provider: string;
        model: string;
        apiKey: string;
        customBaseUrl?: string;
        turns: Turn[];
      };

      if (!apiKey && provider !== "custom") {
        return errorResponse(400, "No API key provided.");
      }
      if (!turns || turns.length === 0) {
        return errorResponse(400, "No messages provided.");
      }

      let responseText: string;
      const signal = AbortSignal.timeout(180000);

      if (provider === "claude") {
        responseText = await callAnthropic(apiKey, model, turns, signal);
      } else if (provider === "gemini") {
        responseText = await callGemini(apiKey, model, turns, signal);
      } else {
        let baseUrl = customBaseUrl || PROVIDER_BASE[provider];
        if (!baseUrl) return errorResponse(400, "Unknown provider.");
        baseUrl = baseUrl.replace(/\/$/, "");
        if (customBaseUrl) {
          // A caller-supplied endpoint must not be able to reach internal hosts.
          try {
            assertSafeUrl(baseUrl);
          } catch (e) {
            return errorResponse(400, e instanceof Error ? e.message : "That endpoint address is not allowed.");
          }
        }
        const extraHeaders: Record<string, string> = {};
        if (provider === "openrouter") {
          extraHeaders["HTTP-Referer"] = "https://bolt.new";
          extraHeaders["X-Title"] = "AI Web Companion";
        }
        responseText = await callOpenAICompatible(baseUrl, apiKey, model, turns, extraHeaders, signal);
      }

      return new Response(JSON.stringify({ content: responseText }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return errorResponse(400, "Unknown action. Use 'chat', 'fetch-url', or 'fetch-youtube'.");
  } catch (err) {
    // Keep the detail in the function log; never hand internals to the caller.
    console.error("ai-proxy failure:", err);
    if (err instanceof UserFacingError) {
      return errorResponse(err.status, err.message);
    }
    return errorResponse(500, "Something went wrong handling that request. Please try again.");
  }
});
