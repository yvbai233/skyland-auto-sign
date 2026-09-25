import { getDId } from "./security-sm";
import { hmacSha256Hex, md5Hex } from "./crypto";

export interface Env {
  TOKEN?: string;
  SC3_SENDKEY?: string;
  SC3_UID?: string;
  QMSG_KEY?: string;
  PUSHPLUS_KEY?: string;
  WORKER_AUTH?: string;
}

const APP_CODE = "4ca99fa6b56cc2ba";
const BINDING_URL = "https://zonai.skland.com/api/v1/game/player/binding";
const GRANT_URL = "https://as.hypergryph.com/user/oauth2/v2/grant";
const CRED_URL = "https://zonai.skland.com/web/v1/user/auth/generate_cred_by_code";
const SIGN_URL = {
  arknights: "https://zonai.skland.com/api/v1/game/attendance",
  endfield: "https://zonai.skland.com/web/v1/game/endfield/attendance",
};

type Json = Record<string, any>;
type Cred = { token: string; cred: string };
type TokenOverrideResult = { token?: string; error?: Response };
type CloudflareSubtleCrypto = SubtleCrypto & {
  timingSafeEqual(a: ArrayBuffer | ArrayBufferView, b: ArrayBuffer | ArrayBufferView): boolean;
};

const MAX_TOKEN_LENGTH = 64 * 1024;
const textEncoder = new TextEncoder();

function parseToken(value: string): string {
  try {
    const parsed = JSON.parse(value) as Json;
    return parsed.data?.content ?? value;
  } catch {
    return value;
  }
}

function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}

async function getSignedHeaders(
  url: string,
  method: "GET" | "POST",
  body: unknown,
  cred: Cred,
  dId: string,
): Promise<Headers> {
  const parsed = new URL(url);
  const timestamp = String(Math.floor(Date.now() / 1000) - 2);
  const signHeader = { platform: "3", timestamp, dId, vName: "1.0.0" };
  const bodyOrQuery = method === "GET" ? parsed.search.slice(1) : (body == null ? "" : jsonBody(body));
  const text = `${parsed.pathname}${bodyOrQuery}${timestamp}${JSON.stringify(signHeader)}`;
  const hmac = await hmacSha256Hex(cred.token, text);
  const sign = await md5Hex(hmac);
  const headers = new Headers({
    cred: cred.cred,
    sign,
    platform: signHeader.platform,
    timestamp: signHeader.timestamp,
    dId: signHeader.dId,
    vName: signHeader.vName,
    "User-Agent": "Mozilla/5.0 (Linux; Android 12; SM-A5560 Build/V417IR; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/101.0.4951.61 Safari/537.36; SKLand/1.52.1",
    "X-Requested-With": "com.hypergryph.skland",
    "content-type": "application/json",
  });
  return headers;
}

async function requestJson<T>(url: string, init: RequestInit): Promise<{ response: Response; data: T }> {
  const response = await fetch(url, init);
  const data = await response.json<T>();
  return { response, data };
}

async function getCred(token: string, dId: string): Promise<Cred> {
  const loginHeaders = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 12; SM-A5560 Build/V417IR; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/101.0.4951.61 Safari/537.36; SKLand/1.52.1",
    "X-Requested-With": "com.hypergryph.skland",
    dId,
    "content-type": "application/json",
  };
  const grant = await requestJson<Json>(GRANT_URL, {
    method: "POST", headers: loginHeaders,
    body: jsonBody({ appCode: APP_CODE, token, type: 0 }),
  });
  if (grant.response.status !== 200 || grant.data.status !== 0) {
    throw new Error(`获得认证代码失败：${grant.data.msg ?? JSON.stringify(grant.data)}`);
  }
  const cred = await requestJson<Json>(CRED_URL, {
    method: "POST", headers: loginHeaders,
    body: jsonBody({ code: grant.data.data.code, kind: 1 }),
  });
  if (cred.data.code !== 0) throw new Error(`获得 cred 失败：${cred.data.message ?? JSON.stringify(cred.data)}`);
  return cred.data.data as Cred;
}

async function getRoles(cred: Cred, dId: string): Promise<Json[]> {
  const headers = await getSignedHeaders(BINDING_URL, "GET", undefined, cred, dId);
  const result = await requestJson<Json>(BINDING_URL, { headers });
  if (result.data.code !== 0) throw new Error(`获取角色失败：${result.data.message ?? "未知错误"}`);
  const roles: Json[] = [];
  for (const game of result.data.data?.list ?? []) {
    if (!(["arknights", "endfield"] as string[]).includes(game.appCode)) continue;
    for (const role of game.bindingList ?? []) roles.push({ ...role, appCode: game.appCode });
  }
  return roles;
}

async function signArknights(role: Json, cred: Cred, dId: string): Promise<string> {
  const body = { gameId: role.gameId ?? 1, uid: role.uid };
  const headers = await getSignedHeaders(SIGN_URL.arknights, "POST", body, cred, dId);
  const result = await requestJson<Json>(SIGN_URL.arknights, { method: "POST", headers, body: jsonBody(body) });
  const prefix = `[${role.gameName}]角色${role.nickName ?? ""}(${role.channelName})`;
  if (result.data.code !== 0) return `${prefix}签到失败了！原因：${result.data.message}`;
  const awards = (result.data.data?.awards ?? []).map((item: Json) => `${item.resource.name}×${item.count || 1}`);
  return `${prefix}签到成功，获得了${awards.join("")}`;
}

async function signEndfield(role: Json, cred: Cred, dId: string): Promise<string[]> {
  const headers = await getSignedHeaders(SIGN_URL.endfield, "POST", undefined, cred, dId);
  headers.set("sk-game-role", `3_${role.roleId}_${role.serverId}`);
  headers.set("referer", "https://game.skland.com/");
  headers.set("origin", "https://game.skland.com/");
  const response = await fetch(SIGN_URL.endfield, { method: "POST", headers });
  const result = await response.json<Json>();
  const prefix = `[${role.gameName}]角色${role.nickname ?? ""}(${role.channelName})`;
  if (result.code !== 0) return [`${prefix}签到失败了！原因：${result.message}`];
  const map = result.data.resourceInfoMap as Record<string, Json>;
  const awards = (result.data.awardIds ?? []).map((item: Json) => {
    const award = map[item.id];
    return `${award.name}×${award.count}`;
  });
  return [`${prefix}签到成功，获得了:${awards.join(",")}`];
}

async function signAccount(token: string, dId: string): Promise<string[]> {
  const cred = await getCred(parseToken(token), dId);
  const roles = await getRoles(cred, dId);
  const logs: string[] = [];
  for (const role of roles) {
    if (role.appCode === "arknights") logs.push(await signArknights(role, cred, dId));
    if (role.appCode === "endfield") logs.push(...await signEndfield(role, cred, dId));
  }
  return logs;
}

async function pushResult(env: Env, logs: string[]): Promise<void> {
  const chinaDate = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const title = `森空岛自动签到结果 - ${chinaDate}`;
  const content = logs.join("\n") || "今日无可用账号或无输出";
  if (env.SC3_SENDKEY) {
    const uid = env.SC3_UID || env.SC3_SENDKEY.match(/^sctp(\d+)t/)?.[1];
    if (uid) await sendPush("Server酱³", () => fetch(`https://${uid}.push.ft07.com/send/${env.SC3_SENDKEY}.send`, {
      method: "POST", headers: { "content-type": "application/json" }, body: jsonBody({ title, desp: content }),
    }));
  }
  if (env.QMSG_KEY) await sendPush("Qmsg", () => fetch(`https://qmsg.zendee.cn/jsend/${env.QMSG_KEY}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: jsonBody({ msg: `${title}\n${content}`, qq: "", bot: "" }),
  }));
  if (env.PUSHPLUS_KEY) await sendPush("PushPlus", () => fetch("https://www.pushplus.plus/send", {
    method: "POST", headers: { "content-type": "application/json" }, body: jsonBody({ token: env.PUSHPLUS_KEY, title, content, template: "html" }),
  }));
}

async function sendPush(name: string, request: () => Promise<Response>): Promise<void> {
  try {
    const response = await request();
    if (!response.ok) console.error(`${name} 推送失败：HTTP ${response.status}`);
  } catch (error) {
    console.error(`${name} 推送异常：${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readTokenOverride(request: Request): Promise<TokenOverrideResult> {
  if (request.body === null) return {};

  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return { error: Response.json({ ok: false, error: "Request body must be application/json" }, { status: 415 }) };
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_TOKEN_LENGTH) {
    return { error: Response.json({ ok: false, error: "Request body is too large" }, { status: 413 }) };
  }

  let body: unknown;
  try {
    body = await request.json<unknown>();
  } catch {
    return { error: Response.json({ ok: false, error: "Invalid JSON request body" }, { status: 400 }) };
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { error: Response.json({ ok: false, error: "JSON body must be an object" }, { status: 400 }) };
  }

  const token = (body as Record<string, unknown>).token;
  if (token === undefined) return {};
  if (typeof token !== "string" || !token.trim()) {
    return { error: Response.json({ ok: false, error: "token must be a non-empty string" }, { status: 400 }) };
  }
  if (token.length > MAX_TOKEN_LENGTH) {
    return { error: Response.json({ ok: false, error: "token is too large" }, { status: 413 }) };
  }
  return { token: token.trim() };
}

function isAuthorized(request: Request, secret: string): boolean {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return false;

  const provided = textEncoder.encode(authorization.slice("Bearer ".length));
  const expected = textEncoder.encode(secret);
  const subtle = crypto.subtle as CloudflareSubtleCrypto;
  return provided.byteLength === expected.byteLength && subtle.timingSafeEqual(provided, expected);
}

async function run(env: Env, tokenValue = env.TOKEN): Promise<string[]> {
  if (!tokenValue?.trim()) throw new Error("未提供 Token，且未设置 TOKEN Secret");
  const dId = await getDId();
  const logs: string[] = [];
  const tokens = tokenValue.split(/[\n,]/).map((token) => token.trim()).filter(Boolean);
  for (const token of tokens) {
    try { logs.push(...await signAccount(token, dId)); }
    catch (error) { logs.push(`签到失败，原因：${error instanceof Error ? error.message : String(error)}`); }
  }
  await pushResult(env, logs);
  return logs;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
    if (!env.WORKER_AUTH) return new Response("WORKER_AUTH is not configured", { status: 503 });
    if (!isAuthorized(request, env.WORKER_AUTH)) {
      return new Response("Unauthorized", { status: 401 });
    }

    const tokenOverride = await readTokenOverride(request);
    if (tokenOverride.error) return tokenOverride.error;

    try {
      const logs = await run(env, tokenOverride.token);
      console.log(logs.join("\n"));
      return Response.json({ ok: true, logs });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`手动触发失败：${message}`);
      return Response.json({ ok: false, error: message }, { status: 500 });
    }
  },

  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const logs = await run(env);
    console.log(logs.join("\n"));
  },
};
