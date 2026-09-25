import CryptoJS from "crypto-js";
import { gzip } from "pako";

const encoder = new TextEncoder();

function exactBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function bytesToWordArray(bytes: Uint8Array): CryptoJS.lib.WordArray {
  const words: number[] = [];
  for (let i = 0; i < bytes.length; i += 4) {
    words[i >>> 2] =
      ((bytes[i] ?? 0) << 24) |
      ((bytes[i + 1] ?? 0) << 16) |
      ((bytes[i + 2] ?? 0) << 8) |
      (bytes[i + 3] ?? 0);
  }
  return CryptoJS.lib.WordArray.create(words, bytes.length);
}

function wordArrayToBytes(wordArray: CryptoJS.lib.WordArray): Uint8Array {
  const out = new Uint8Array(wordArray.sigBytes);
  for (let i = 0; i < wordArray.sigBytes; i++) {
    out[i] = (wordArray.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return out;
}

export function base64(bytes: Uint8Array): string {
  let result = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    result += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(result);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export async function md5Hex(value: string | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "MD5",
    exactBuffer(typeof value === "string" ? encoder.encode(value) : value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function hmacSha256Hex(key: string, value: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", cryptoKey, exactBuffer(encoder.encode(value)));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function rsaPkcs1v15(publicKeyBase64: string, value: Uint8Array): Promise<Uint8Array> {
  // Workers Web Crypto only supports RSA-OAEP for encryption. The upstream
  // protocol requires the older RSAES-PKCS1-v1_5 encoding, so perform the
  // public-key operation here instead of asking SubtleCrypto to import it.
  const { modulus, exponent, size } = parseRsaSpki(base64ToBytes(publicKeyBase64));
  if (value.length > size - 11) throw new Error("RSA 明文过长");

  const paddingLength = size - value.length - 3;
  const encoded = new Uint8Array(size);
  encoded[0] = 0;
  encoded[1] = 2;
  fillNonZeroRandom(encoded.subarray(2, 2 + paddingLength));
  encoded[2 + paddingLength] = 0;
  encoded.set(value, 3 + paddingLength);

  return bigIntToBytes(modPow(bytesToBigInt(encoded), exponent, modulus), size);
}

function readDerLength(bytes: Uint8Array, offset: number): { length: number; offset: number } {
  const first = bytes[offset++];
  if (first === undefined) throw new Error("无效的 RSA 公钥");
  if ((first & 0x80) === 0) return { length: first, offset };
  const count = first & 0x7f;
  if (count === 0 || count > 4 || offset + count > bytes.length) throw new Error("无效的 RSA 公钥长度");
  let length = 0;
  for (let i = 0; i < count; i++) length = length * 256 + bytes[offset++];
  return { length, offset };
}

function readDerValue(bytes: Uint8Array, offset: number, tag: number): { value: Uint8Array; offset: number } {
  if (bytes[offset++] !== tag) throw new Error("无效的 RSA 公钥结构");
  const lengthInfo = readDerLength(bytes, offset);
  const end = lengthInfo.offset + lengthInfo.length;
  if (end > bytes.length) throw new Error("RSA 公钥数据不完整");
  return { value: bytes.subarray(lengthInfo.offset, end), offset: end };
}

function parseRsaSpki(spki: Uint8Array): { modulus: bigint; exponent: bigint; size: number } {
  const outer = readDerValue(spki, 0, 0x30).value;
  const algorithm = readDerValue(outer, 0, 0x30);
  const bitString = readDerValue(outer, algorithm.offset, 0x03).value;
  if (bitString[0] !== 0) throw new Error("不支持的 RSA BIT STRING");
  const rsaSequence = readDerValue(bitString.subarray(1), 0, 0x30).value;
  const modulusDer = readDerValue(rsaSequence, 0, 0x02);
  const exponentDer = readDerValue(rsaSequence, modulusDer.offset, 0x02);
  const modulusBytes = modulusDer.value[0] === 0 ? modulusDer.value.subarray(1) : modulusDer.value;
  return {
    modulus: bytesToBigInt(modulusBytes),
    exponent: bytesToBigInt(exponentDer.value),
    size: modulusBytes.length,
  };
}

function fillNonZeroRandom(target: Uint8Array): void {
  const random = new Uint8Array(target.length);
  crypto.getRandomValues(random);
  for (let i = 0; i < target.length; i++) {
    while (random[i] === 0) crypto.getRandomValues(random.subarray(i, i + 1));
    target[i] = random[i];
  }
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

function bigIntToBytes(value: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = length - 1; i >= 0; i--) {
    bytes[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  if (value !== 0n) throw new Error("RSA 密文长度溢出");
  return bytes;
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  base %= modulus;
  while (exponent > 0n) {
    if (exponent & 1n) result = (result * base) % modulus;
    exponent >>= 1n;
    base = (base * base) % modulus;
  }
  return result;
}

export function tripleDesEcbZeroPadded(value: string, key: string): string {
  const bytes = encoder.encode(value);
  // Python's encryptor.update(value + 8 zero bytes) emits complete blocks
  // only: this is equivalent to zero-padding to the next 8-byte boundary,
  // including a complete padding block when already aligned.
  const padded = new Uint8Array(bytes.length + (8 - (bytes.length % 8)));
  padded.set(bytes);
  const keyBytes = encoder.encode(key);
  const tripleKey = new Uint8Array(24);
  tripleKey.set(keyBytes, 0);
  tripleKey.set(keyBytes, 8);
  tripleKey.set(keyBytes, 16);
  const encrypted = CryptoJS.TripleDES.encrypt(
    bytesToWordArray(padded),
    bytesToWordArray(tripleKey),
    { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.NoPadding },
  ).ciphertext;
  return base64(wordArrayToBytes(encrypted));
}

export function aesCbcZeroPadded(value: Uint8Array, key: string): string {
  // The Python implementation always appends at least one zero byte, so an
  // already aligned input receives a complete 16-byte padding block.
  const paddedLength = value.length + (16 - (value.length % 16));
  const padded = new Uint8Array(paddedLength);
  padded.set(value);
  const encrypted = CryptoJS.AES.encrypt(
    bytesToWordArray(padded),
    CryptoJS.enc.Utf8.parse(key),
    {
      iv: CryptoJS.enc.Utf8.parse("0102030405060708"),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.NoPadding,
    },
  ).ciphertext;
  return [...wordArrayToBytes(encrypted)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function gzipBase64(value: string): Uint8Array {
  return encoder.encode(base64(gzip(value, { level: 2 })));
}
