const textEncoder = new TextEncoder();

export function base64UrlEncode(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export function base64UrlDecode(input: string): Uint8Array {
  const padded = input
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(input.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export async function sha256(input: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", textEncoder.encode(input));
}

export async function hmacSha256(input: {
  key: ArrayBuffer | Uint8Array;
  data: string;
}): Promise<ArrayBuffer> {
  let rawKey: ArrayBuffer;

  if (input.key instanceof Uint8Array) {
    const copy = new Uint8Array(input.key.byteLength);
    copy.set(input.key);
    rawKey = copy.buffer;
  } else {
    rawKey = input.key;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  return crypto.subtle.sign("HMAC", key, textEncoder.encode(input.data));
}

export function toHex(input: ArrayBuffer): string {
  return Array.from(new Uint8Array(input))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;

  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return diff === 0;
}
