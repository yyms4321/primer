import { NextRequest, NextResponse } from 'next/server';
import { getCachedSession } from '@/lib/getCachedSession';
import { env } from '@/config/env';
import { isValidVoice, DEFAULT_VOICE } from '@/app/lib/voices';

export const runtime = 'nodejs';

const MAX_SDP_BYTES = 128 * 1024;
const MODEL_RE = /^gpt-realtime(?:-[a-z0-9.-]+)?$/;

export async function POST(request: NextRequest) {
  // Realtime calls are billable. Never expose the regular API key to clients.
  const userSession = await getCachedSession();
  if (!userSession?.user?.email) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Same-origin POST guard: browsers cannot make cross-site authenticated calls.
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 });
  }

  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Realtime API is not configured' }, { status: 503 });
  }

  try {
    const body = await request.json() as {
      sdp?: unknown;
      model?: unknown;
      modalities?: unknown;
      voice?: unknown;
      reasoningEffort?: unknown;
    };

    if (typeof body.sdp !== 'string' ||
        !body.sdp.startsWith('v=0') ||
        Buffer.byteLength(body.sdp, 'utf8') > MAX_SDP_BYTES) {
      return NextResponse.json({ error: 'Invalid SDP offer' }, { status: 400 });
    }

    const model = typeof body.model === 'string' ? body.model : 'gpt-realtime';
    if (!MODEL_RE.test(model)) {
      return NextResponse.json({ error: 'Unsupported realtime model' }, { status: 400 });
    }

    const wantsAudio = !Array.isArray(body.modalities) || body.modalities.includes('audio');
    const voice = isValidVoice(body.voice) ? body.voice : DEFAULT_VOICE;
    const session: Record<string, unknown> = {
      type: 'realtime',
      model,
      output_modalities: wantsAudio ? ['audio'] : ['text'],
      ...(wantsAudio ? { audio: { output: { voice } } } : {}),
    };

    if (['none', 'minimal', 'low', 'medium', 'high'].includes(String(body.reasoningEffort))) {
      session.reasoning = { effort: body.reasoningEffort };
    }

    // Official unified WebRTC interface: form-data containing SDP and session
    // authenticated only on the server. Do not manually set multipart Content-Type.
    const form = new FormData();
    // OpenAI expects multipart *text fields*, not uploaded file parts.
    // Passing Blob adds a filename and causes 'field sdp is required' (400).
    form.set('sdp', body.sdp);
    form.set('session', JSON.stringify(session));

    const upstream = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(25000),
    });

    const answer = await upstream.text();
    if (!upstream.ok) {
      // Do not log upstream response or tokens; return only sanitized, useful diagnostics.
      let message = `OpenAI Realtime call failed (HTTP ${upstream.status})`;
      let code = 'upstream_error';
      try {
        const parsed = JSON.parse(answer);
        if (typeof parsed.error?.message === 'string') message = parsed.error.message.slice(0, 350);
        if (typeof parsed.error?.code === 'string') code = parsed.error.code.slice(0, 80);
      } catch {
        // Non-JSON upstream failure.
      }
      return NextResponse.json({ error: message, code, status: upstream.status }, { status: 502 });
    }

    if (!answer.startsWith('v=0')) {
      return NextResponse.json({ error: 'OpenAI returned an invalid SDP answer' }, { status: 502 });
    }

    return new NextResponse(answer, {
      status: 200,
      headers: {
        'Content-Type': 'application/sdp',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const timeout = error instanceof Error && error.name === 'TimeoutError';
    return NextResponse.json(
      { error: timeout ? 'OpenAI connection timed out' : 'Realtime connection could not be initialized' },
      { status: timeout ? 504 : 500 },
    );
  }
}
