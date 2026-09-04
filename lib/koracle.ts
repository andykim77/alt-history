// Server-side client for the K-Oracle LLM gateway (https://llm.koracle.me).
// Ported from the kit's llm-client.mjs. Auth is an Ed25519 challenge/response
// that yields a 2-hour session token; we cache it in memory (and on disk when
// the filesystem is writable, e.g. local dev).
//
// Credentials come from, in order:
//   1. KORACLE_CREDENTIALS_JSON  — the credentials.json contents as one env var (for hosts like Vercel)
//   2. LLM_KIT_DIR/credentials.json — the kit folder (defaults to the sibling kit checkout)

import { createPrivateKey, sign as edSign } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

type Credentials = { client_id: string; private_key: string; endpoint: string };

const DEFAULT_KIT_DIR = resolve(process.cwd(), "..", "llm-kit-andrewKim-secure_extracted", "llm-kit-andrewKim");

let cachedCreds: Credentials | null = null;
function credentials(): Credentials {
  if (cachedCreds) return cachedCreds;
  const inline = process.env.KORACLE_CREDENTIALS_JSON;
  if (inline) {
    cachedCreds = JSON.parse(inline) as Credentials;
    return cachedCreds;
  }
  const dir = process.env.LLM_KIT_DIR ? resolve(process.env.LLM_KIT_DIR) : DEFAULT_KIT_DIR;
  const path = join(dir, "credentials.json");
  if (!existsSync(path)) {
    throw new Error(
      `K-Oracle credentials not found at ${path}. Set LLM_KIT_DIR to the kit folder or KORACLE_CREDENTIALS_JSON.`
    );
  }
  cachedCreds = JSON.parse(readFileSync(path, "utf8")) as Credentials;
  return cachedCreds;
}

const endpoint = () => process.env.LLM_ENDPOINT ?? credentials().endpoint;
const SESSION_FILE = resolve(process.cwd(), ".session.json");

type GatewayResponse = {
  status: number;
  json: { success?: boolean; data?: { text?: string; model?: string }; error?: string } | null;
  raw: string;
  retryAfter: string | null;
};

async function post(path: string, body: unknown, headers: Record<string, string> = {}, signal?: AbortSignal): Promise<GatewayResponse> {
  const res = await fetch(endpoint() + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal,
  });
  const raw = await res.text();
  let json: GatewayResponse["json"] = null;
  try {
    json = JSON.parse(raw);
  } catch {
    // non-JSON (e.g. Cloudflare error page)
  }
  return { status: res.status, json, raw, retryAfter: res.headers.get("retry-after") };
}

// ---- session token ----

let memToken: { token: string; expiresAt: number } | null = null;
let inflightAuth: Promise<string> | null = null;

function readDiskToken(): { token: string; expiresAt: number } | null {
  try {
    if (!existsSync(SESSION_FILE)) return null;
    const s = JSON.parse(readFileSync(SESSION_FILE, "utf8"));
    return s?.token && typeof s.expiresAt === "number" ? s : null;
  } catch {
    return null;
  }
}

async function authenticate(): Promise<string> {
  const cred = credentials();
  const ch = await post("/llm/session/challenge", { client_id: cred.client_id });
  if (!ch.json?.success) throw new Error("K-Oracle challenge failed: " + (ch.json?.error ?? ch.raw.slice(0, 120)));
  const nonce = (ch.json.data as unknown as { nonce: string }).nonce;
  const signature = edSign(null, Buffer.from(nonce, "base64"), createPrivateKey(cred.private_key)).toString("base64");
  const vf = await post("/llm/session/verify", { client_id: cred.client_id, nonce, signature });
  if (!vf.json?.success) throw new Error("K-Oracle verify failed (check private key / client_id): " + (vf.json?.error ?? ""));
  const data = vf.json.data as unknown as { session_token: string; expires_in?: number };
  const token = data.session_token;
  const expiresAt = Date.now() + (data.expires_in ?? 7200) * 1000;
  memToken = { token, expiresAt };
  try {
    writeFileSync(SESSION_FILE, JSON.stringify(memToken), { mode: 0o600 });
  } catch {
    // read-only filesystem: memory cache is enough
  }
  return token;
}

async function getToken(force = false): Promise<string> {
  if (!force) {
    const fresh = (t: { token: string; expiresAt: number } | null) => t && t.expiresAt > Date.now() + 60_000;
    if (fresh(memToken)) return memToken!.token;
    const disk = readDiskToken();
    if (fresh(disk)) {
      memToken = disk;
      return disk!.token;
    }
  }
  if (!inflightAuth) inflightAuth = authenticate().finally(() => (inflightAuth = null));
  return inflightAuth;
}

// ---- public API ----

export type KoracleProvider = "anthropic" | "openai" | "google";

export type KoracleRequest = {
  prompt: string;
  system?: string;
  provider?: KoracleProvider;
  model?: string;
  max_tokens?: number;
  signal?: AbortSignal;
};

export class KoracleError extends Error {
  constructor(message: string, public status: number, public retryAfter: number | null = null) {
    super(message);
  }
}

/** One completion. Throws KoracleError with a user-facing message on failure. */
export async function koracleComplete(req: KoracleRequest): Promise<{ text: string; model: string }> {
  const { signal, ...body } = req;
  let token = await getToken();
  let r = await post("/llm", body, { authorization: "Bearer " + token }, signal);
  if (r.status === 401) {
    token = await getToken(true);
    r = await post("/llm", body, { authorization: "Bearer " + token }, signal);
  }
  if (r.status === 429) {
    const wait = Number(r.retryAfter) || null;
    throw new KoracleError(
      `K-Oracle rate limit reached (10/min, 200/day, resets at KST midnight)${wait ? `; retry in ${wait}s` : ""}.`,
      429,
      wait
    );
  }
  if (!r.json?.success) {
    const detail = r.json?.error ?? (/^\s*</.test(r.raw) ? "HTML error page (upstream provider unavailable)" : r.raw.slice(0, 160));
    throw new KoracleError(`K-Oracle gateway error ${r.status}: ${detail}`, r.status);
  }
  return { text: r.json.data?.text ?? "", model: r.json.data?.model ?? body.model ?? body.provider ?? "unknown" };
}
