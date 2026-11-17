import { NextResponse } from 'next/server';
import { getCachedSession } from '@/lib/getCachedSession';
import { env } from '@/config/env';

// Temporary diagnostic endpoint for the teacher-owned Vercel Preview only.
// It uses the SAME server-side API key as the Realtime call route, never
// returns secrets, and reports only model identifiers relevant to voice.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const headers = { 'Cache-Control': 'no-store' };
  if (process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ error: 'Unavailable outside Preview' }, { status: 404, headers });
  }
  const session = await getCachedSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Sign-in required' }, { status: 401, headers });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });

    // Do not forward arbitrary upstream data, which could contain secrets.
    if (!response.ok) {
      return NextResponse.json({
        error: 'Model listing request was rejected',
        upstreamStatus: response.status,
      }, { status: 502, headers });
    }

    const raw: unknown = await response.json();
    const models = raw && typeof raw === 'object' && 'data' in raw && Array.isArray(raw.data)
      ? raw.data : [];
    const ids = models
      .map((m: unknown) => m && typeof m === 'object' && 'id' in m ? m.id : null)
      .filter((id: unknown): id is string => typeof id === 'string')
      .filter((id: string) => /realtime|live/i.test(id))
      .sort();
    return NextResponse.json({
      source: 'GET /v1/models using the Vercel Preview OPENAI_API_KEY',
      listedModelCount: models.length,
      voiceModelIds: ids,
      note: 'Listed models are candidates; a successful Realtime call still requires a compatible endpoint and project permissions.',
    }, { headers });
  } catch {
    return NextResponse.json({ error: 'Unable to query model listing' }, { status: 502, headers });
  }
}
