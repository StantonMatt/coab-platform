import crypto from 'crypto';
import { SignJWT, jwtVerify, JWTPayload } from 'jose';
import { env } from '../config/env.js';

/**
 * JWT payload for authenticated users
 */
export interface TokenPayload extends JWTPayload {
  userId: string;
  tipo: 'cliente' | 'admin';
  rut?: string;
  email?: string;
}

// Encode secret once
const secret = new TextEncoder().encode(env.JWT_SECRET);

/**
 * Generate an access token (short-lived)
 * @param payload - User data to include in token
 * @param expiresIn - Expiration time (default: 24h for customers, 8h for admin)
 */
export async function generateAccessToken(
  payload: Omit<TokenPayload, 'iat' | 'exp'>,
  expiresIn: string = payload.tipo === 'cliente' ? '24h' : '8h'
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

/**
 * Verify and decode an access token
 * @param token - JWT to verify
 * @returns Decoded payload or throws error
 */
export async function verifyAccessToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, secret);
  return payload as TokenPayload;
}

/**
 * Generate a refresh token (random hex string)
 * Note: This is NOT a JWT - it's a random string stored as hash in DB
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a refresh token for storage
 * Never store refresh tokens in plain text
 */
export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
