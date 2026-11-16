import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { canManageClasses } from '@/app/lib/classAuth';
import { EXPERIENCE_ID_RE } from '@/app/server-actions/_validation';
import { createStudentInvite } from '@/app/lib/student-invites';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Teacher-only ticket creation. Does not grant a student session; joining
 * requires a separate admission flow and backend access changes.
 */
export async function POST(request: NextRequest) {
  const token = await getToken({ req: request });
  const email = token?.email;
  if (!email) {
    return NextResponse.json({ error: 'Teacher sign-in required' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  const { experienceId } = payload as Record<string, unknown>;
  if (typeof experienceId !== 'string' || !EXPERIENCE_ID_RE.test(experienceId)) {
    return NextResponse.json({ error: 'Invalid experience ID' }, { status: 400 });
  }

  if (!(await canManageClasses(experienceId, email))) {
    return NextResponse.json({ error: 'Not allowed to share this experience' }, { status: 403 });
  }

  try {
    const ticket = createStudentInvite(experienceId);
    return NextResponse.json(
      { ticket, expiresInSeconds: 3600, experienceId },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    // Do not leak signing configuration through an API response.
    return NextResponse.json({ error: 'Student invitations are not configured' }, { status: 503 });
  }
}
