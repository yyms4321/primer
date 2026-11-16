/**
 * Signed, experience-scoped student admission tickets for the school access flow.
 *
 * Not a NextAuth credential: these tickets MUST NEVER confer educator/admin roles.
 * The ticket alone does not bypass existing middleware or API authorization.
 *
 * Production must use a separate, high-entropy STUDENT_INVITE_SECRET.
 * Rotate it to revoke all outstanding tickets. Per-invite revocation and
 * usage counts will require a durable database before student rollout.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { EXPERIENCE_ID_RE } from '@/app/server-actions/_validation';

const TOKEN_VERSION = 'v1';
const MAX_LIFETIME_SECONDS = 24 * 60 * 60;
const MIN_LIFETIME_SECONDS = 60;
const CLOCK_SKEW_SECONDS = 60;

interface TicketClaims {
  v: 1;
  aud: 'primer-student-join';
  experienceId: string;
  iat: number;
  exp: number;
  nonce: string;
}

function getInviteSecret(): string {
  const secret = process.env.STUDENT_INVITE_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('STUDENT_INVITE_SECRET must be at least 32 bytes');
  }
  return secret;
}

function encode(data: string): string {
  return Buffer.from(data, 'utf8').toString('base64url');
}

function signature(headerAndBody: string, secret: string): string {
  return createHmac('sha256', secret).update(headerAndBody).digest('base64url');
}

/** Only trusted, authenticated teacher API routes may call this. */
export function createStudentInvite(
  experienceId: string,
  lifetimeSeconds = 3600,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  if (!EXPERIENCE_ID_RE.test(experienceId)) {
    throw new Error('Invalid experience ID');
  }
  if (!Number.isSafeInteger(lifetimeSeconds)
      || lifetimeSeconds < MIN_LIFETIME_SECONDS
      || lifetimeSeconds > MAX_LIFETIME_SECONDS) {
    throw new Error('Invalid invite lifetime');
  }
  const claims: TicketClaims = {
    v: 1,
    aud: 'primer-student-join',
    experienceId,
    iat: nowSeconds,
    exp: nowSeconds + lifetimeSeconds,
    nonce: randomBytes(16).toString('base64url'),
  };
  const unsigned = `${TOKEN_VERSION}.${encode(JSON.stringify(claims))}`;
  return `${unsigned}.${signature(unsigned, getInviteSecret())}`;
}

/** Verify before exchanging the ticket for a separately scoped student session. */
export function verifyStudentInvite(
  ticket: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): { experienceId: string; expiresAt: number } | null {
  if (typeof ticket !== 'string' || ticket.length > 2048) return null;
  const parts = ticket.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION
      || !/^[A-Za-z0-9_-]+$/.test(parts[1])
      || !/^[A-Za-z0-9_-]+$/.test(parts[2])) return null;

  const unsigned = `${parts[0]}.${parts[1]}`;
  const actual = Buffer.from(parts[2], 'base64url');
  const expected = Buffer.from(signature(unsigned, getInviteSecret()), 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!claims || typeof claims !== 'object') return null;
  const c = claims as Partial<TicketClaims>;
  if (c.v !== 1 || c.aud !== 'primer-student-join'
      || typeof c.experienceId !== 'string' || !EXPERIENCE_ID_RE.test(c.experienceId)
      || typeof c.iat !== 'number' || !Number.isSafeInteger(c.iat)
      || typeof c.exp !== 'number' || !Number.isSafeInteger(c.exp)
      || typeof c.nonce !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(c.nonce)
      || c.exp <= nowSeconds || c.iat > nowSeconds + CLOCK_SKEW_SECONDS
      || c.exp - c.iat < MIN_LIFETIME_SECONDS
      || c.exp - c.iat > MAX_LIFETIME_SECONDS) return null;

  return { experienceId: c.experienceId, expiresAt: c.exp };
}
