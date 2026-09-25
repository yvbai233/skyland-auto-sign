import { aesCbcZeroPadded, base64, base64ToBytes, gzipBase64, md5Hex, rsaPkcs1v15, tripleDesEcbZeroPadded } from "./crypto";

const publicKey = "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCmxMNr7n8ZeT0tE1R9j/mPixoinPkeM+k4VGIn/s0k7N5rJAfnZ0eMER+QhwFvshzo0LNmeUkpR8uIlU/GEVr8mN28sKmwd2gpygqj0ePnBmOW4v0ZVwbSYK+izkhVFk2V/doLoMbWy6b+UnA8mkjvg0iYWRByfRsK2gdl7llqCwIDAQAB";
const organization = "UWXspnCCJN4sfYlNfqps";

const browserEnv: Record<string, string | number> = {
  plugins: "MicrosoftEdgePDFPluginPortableDocumentFormatinternal-pdf-viewer1,MicrosoftEdgePDFViewermhjfbmdgcfjbbpaeojofohoefgiehjai1",
  ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
  canvas: "259ffe69",
  timezone: -480,
  platform: "Win32",
  url: "https://www.skland.com/",
  referer: "",
  res: "1920_1080_24_1.25",
  clientSize: "0_0_1080_1920_1920_1080_1920_1080",
  status: "0011",
};

const desRules: Record<string, { key?: string; encrypted: boolean; name: string }> = {
  appId: { key: "uy7mzc4h", encrypted: true, name: "xx" }, box: { encrypted: false, name: "jf" },
  canvas: { key: "snrn887t", encrypted: true, name: "yk" }, clientSize: { key: "cpmjjgsu", encrypted: true, name: "zx" },
  organization: { key: "78moqjfc", encrypted: true, name: "dp" }, os: { key: "je6vk6t4", encrypted: true, name: "pj" },
  platform: { key: "pakxhcd2", encrypted: true, name: "gm" }, plugins: { key: "v51m3pzl", encrypted: true, name: "kq" },
  pmf: { key: "2mdeslu3", encrypted: true, name: "vw" }, protocol: { encrypted: false, name: "protocol" },
  referer: { key: "y7bmrjlc", encrypted: true, name: "ab" }, res: { key: "whxqm2a7", encrypted: true, name: "hf" },
  rtype: { key: "x8o2h2bl", encrypted: true, name: "lo" }, sdkver: { key: "9q3dcxp2", encrypted: true, name: "sc" },
  status: { key: "2jbrxxw4", encrypted: true, name: "an" }, subVersion: { key: "eo3i2puh", encrypted: true, name: "ns" },
  svm: { key: "fzj3kaeh", encrypted: true, name: "qr" }, time: { key: "q2t3odsk", encrypted: true, name: "nb" },
  timezone: { key: "1uv05lj5", encrypted: true, name: "as" }, tn: { key: "x9nzj1bp", encrypted: true, name: "py" },
  trees: { key: "acfs0xo4", encrypted: true, name: "pi" }, ua: { key: "k92crp1t", encrypted: true, name: "bj" },
  url: { key: "y95hjkoo", encrypted: true, name: "cf" }, version: { encrypted: false, name: "version" },
  vpw: { key: "r9924ab5", encrypted: true, name: "ca" },
};

function getTn(value: Record<string, unknown>): string {
  return Object.keys(value).sort().map((key) => {
    const item = value[key];
    if (typeof item === "number") return String(item * 10000);
    if (item && typeof item === "object") return getTn(item as Record<string, unknown>);
    return String(item ?? "");
  }).join("");
}

function chinaTimeParts(): [number, number, number, number, number, number] {
  const date = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return [
    date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(),
    date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(),
  ];
}

async function smid(): Promise<string> {
  const stamp = chinaTimeParts().map((part, index) => index === 0 ? String(part) : String(part).padStart(2, "0")).join("");
  const uuid = crypto.randomUUID();
  const uuidMd5 = await md5Hex(uuid);
  const v = `${stamp}${uuidMd5}00`;
  return `${v}${(await md5Hex(`smsk_web_${v}`)).slice(0, 14)}0`;
}

export async function getDId(): Promise<string> {
  const uid = new TextEncoder().encode(crypto.randomUUID());
  const priId = (await md5Hex(uid)).slice(0, 16);
  const ep = base64(await rsaPkcs1v15(publicKey, uid));
  const now = Date.now();
  const target: Record<string, unknown> = {
    ...browserEnv, vpw: crypto.randomUUID(), svm: now, trees: crypto.randomUUID(), pmf: now,
    protocol: 102, organization, appId: "default", os: "web", version: "3.0.0", sdkver: "3.0.0",
    box: "", rtype: "all", smid: await smid(), subVersion: "1.0.0", time: 0,
  };
  target.tn = await md5Hex(getTn(target));
  const obfuscated: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(target)) {
    const rule = desRules[key];
    if (!rule) { obfuscated[key] = value; continue; }
    obfuscated[rule.name] = rule.encrypted ? tripleDesEcbZeroPadded(String(value), rule.key!) : value;
  }
  const compressed = gzipBase64(JSON.stringify(obfuscated));
  const data = aesCbcZeroPadded(compressed, priId);
  const response = await fetch("https://fp-it.portal101.cn/deviceprofile/v4", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ appId: "default", compress: 2, data, encode: 5, ep, organization, os: "web" }),
  });
  const result = await response.json<{ code: number; detail?: { deviceId: string } }>();
  if (result.code !== 1100 || !result.detail?.deviceId) throw new Error("dId 计算失败");
  return `B${result.detail.deviceId}`;
}
