const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function randomBase64Url(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes);
}

export async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(value)),
  );
}

export async function pkceChallenge(verifier: string): Promise<string> {
  return encodeBase64Url(await sha256(verifier));
}

export async function stableInternalId(
  prefix: "usr" | "wsp",
  value: string,
): Promise<string> {
  const digest = await sha256(value);
  return `${prefix}_${encodeBase64Url(digest.slice(0, 18))}`;
}

export async function sealJson(
  value: unknown,
  secret: string,
  purpose: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey(secret, purpose);
  const plaintext = encoder.encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(purpose) },
    key,
    plaintext,
  );

  // AES-GCM authenticates the ciphertext in addition to encrypting it.
  return `v1.${encodeBase64Url(iv)}.${encodeBase64Url(new Uint8Array(ciphertext))}`;
}

export async function openJson<T>(
  value: string,
  secret: string,
  purpose: string,
): Promise<T | null> {
  try {
    const [version, encodedIv, encodedCiphertext, extra] = value.split(".");
    if (version !== "v1" || !encodedIv || !encodedCiphertext || extra) {
      return null;
    }
    const key = await encryptionKey(secret, purpose);
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(decodeBase64Url(encodedIv)),
        additionalData: encoder.encode(purpose),
      },
      key,
      toArrayBuffer(decodeBase64Url(encodedCiphertext)),
    );
    return JSON.parse(decoder.decode(plaintext)) as T;
  } catch {
    // Authentication failures and malformed cookies are intentionally identical.
    return null;
  }
}

export function encodeBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

export function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error("Invalid base64url value.");
  }
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function decodeBase64UrlJson<T>(value: string): T {
  return JSON.parse(decoder.decode(decodeBase64Url(value))) as T;
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |=
      (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

async function encryptionKey(
  secret: string,
  purpose: string,
): Promise<CryptoKey> {
  const material = await sha256(`${purpose}\0${secret}`);
  return crypto.subtle.importKey(
    "raw",
    toArrayBuffer(material),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}

export function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.slice().buffer as ArrayBuffer;
}
