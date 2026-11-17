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
    // Submit SDP/session as multipart text fields. If the configured voice model
    // is unavailable to this API project, try one lower-cost current model once.
    // This preview-only fallback does not change the experience's persisted config.
    async function negotiate(requestedModel: string) {
      const candidate = { ...session, model: requestedModel };
      // Reasoning settings are model-specific; avoid applying them to a
      // fallback unless the experience explicitly requested a supported effort.
      const form = new FormData();
      form.set('sdp', body.sdp as string);
      form.set('session', JSON.stringify(candidate));
      const response = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        cache: 'no-store',
        redirect: 'manual',
        signal: AbortSignal.timeout(25000),
      });
      const text = await response.text();
      let errorCode = 'upstream_error';
      let errorMessage = `OpenAI Realtime call failed (HTTP ${response.status})`;
      if (!response.ok) {
        try {
          const parsed = JSON.parse(text);
          if (typeof parsed.error?.code === 'string') errorCode = parsed.error.code.slice(0, 80);
          if (typeof parsed.error?.message === 'string') errorMessage = parsed.error.message.slice(0, 350);
        } catch {
          // Non-JSON error.
        }
      }
      return { response, text, errorCode, errorMessage };
    }

    let result = await negotiate(model);
    let fallbackUsed = false;
    if (!result.response.ok &&
        result.errorCode === 'model_not_found' &&
        model === 'gpt-realtime-1.5' &&
        process.env.VERCEL_ENV === 'preview') {
      fallbackUsed = true;
      result = await negotiate('gpt-realtime-2.1-mini');
    }

    if (!result.response.ok) {
      return NextResponse.json({
        error: result.errorMessage,
        code: result.errorCode,
        status: result.response.status,
        ...(fallbackUsed ? { attemptedFallback: 'gpt-realtime-2.1-mini' } : {}),
      }, { status: 502 });
    }

    const answer = result.text;
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
