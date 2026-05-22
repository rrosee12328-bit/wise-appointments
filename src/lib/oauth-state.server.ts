import { createHmac, timingSafeEqual } from "crypto";

const secret = process.env.SB_SERVICE_ROLE_KEY!;

function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}

export function signState(payload: { userId: string; nonce: string; ts: number }): string {
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyState(state: string): { userId: string; nonce: string; ts: number } | null {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const expected = b64url(createHmac("sha256", secret).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(body).toString());
    if (Date.now() - payload.ts > 10 * 60 * 1000) return null; // 10 min
    return payload;
  } catch {
    return null;
  }
}
