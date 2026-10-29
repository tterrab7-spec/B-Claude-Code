import { SignJWT, jwtVerify } from 'jose';

export interface JwtClaims { sub: string; sid: string; roles: string[] }

export async function signJwt(claims: JwtClaims, secret: string, ttlSeconds = 60 * 60 * 24 * 30): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ sid: claims.sid, roles: claims.roles })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(key);
}

export async function verifyJwt(token: string, secret: string): Promise<JwtClaims | null> {
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key);
    if (!payload.sub) return null;
    return { sub: payload.sub, sid: String(payload.sid ?? ''), roles: Array.isArray(payload.roles) ? (payload.roles as string[]) : [] };
  } catch {
    return null;
  }
}
