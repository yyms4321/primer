import { NextResponse } from 'next/server';
import { getCachedSession } from '@/lib/getCachedSession';
import { getEffectiveUserEmail } from '@/lib/devAuth';
import { hasMergedPermission } from '@/config/user-storage';
import { Permission } from '@/config/auth';
import { canAccessExperience } from '@/app/lib/classAuth';
import { env } from '@/config/env';

export const runtime = 'nodejs';

type ChatMessage = { role: 'user' | 'assistant'; content: string };
const MODEL = 'gpt-4.1-mini';
const MAX_TURNS = 14;
const MAX_MESSAGE = 2200;

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ error: '텍스트 모드는 Preview에서만 사용할 수 있습니다.' }, { status: 404 });
  }
  const session = await getCachedSession();
  const userEmail = getEffectiveUserEmail(session?.user?.email);
  if (!userEmail) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: '허용되지 않은 요청입니다.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const experienceId = body?.experienceId;
    if (typeof experienceId !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(experienceId)) {
      return NextResponse.json({ error: '올바르지 않은 학습 활동입니다.' }, { status: 400 });
    }
    const allowed = await canAccessExperience(
      experienceId,
      userEmail,
      hasMergedPermission(userEmail, Permission.PLAY_EXPERIENCE),
    );
    if (!allowed.canAccess) {
      return NextResponse.json({ error: '이 활동에 접근할 수 없습니다.' }, { status: 403 });
    }
    if (!Array.isArray(body?.messages) || body.messages.length < 1 || body.messages.length > MAX_TURNS) {
      return NextResponse.json({ error: '대화가 너무 깁니다. 새로 시작해 주세요.' }, { status: 400 });
    }
    const messages: ChatMessage[] = [];
    for (const message of body.messages) {
      if (!message || (message.role !== 'user' && message.role !== 'assistant') ||
        typeof message.content !== 'string' || message.content.trim().length < 1 ||
        message.content.length > MAX_MESSAGE) {
        return NextResponse.json({ error: '메시지 형식이 올바르지 않습니다.' }, { status: 400 });
      }
      messages.push({ role: message.role, content: message.content });
    }
    if (messages[messages.length - 1].role !== 'user') {
      return NextResponse.json({ error: '마지막 메시지는 사용자 질문이어야 합니다.' }, { status: 400 });
    }

    const creator = experienceId === 'experience-creator-with-workflows';
    const task = creator
      ? `당신은 중학교 교사를 위한 AI 학습활동 설계 도우미다. 교사의 목적을 파악하고 Teachback(학생이 자신의 말로 개념 설명) 또는 Roleplay(상황 속 역할 수행)를 한국어로 설계한다. 필요한 정보는 학년, 교과, 학습목표, 활동 방식 등 한 번에 1~2개만 질문한다. 사용자가 활동을 만들어 달라고 요청하면 반드시 구체적인 초안을 제공한다: 활동 제목, 대상, 목표, 학생 안내, AI 역할과 첫 발화, 단계별 진행, 질문 3~5개, 피드백 기준, 종료 조건. 교과 내용이 정확해야 한다. 학생 질문에 정답부터 제시하기보다 힌트를 제공하도록 AI 지침을 작성한다. 이 화면은 활동 초안을 생성할 뿐, 원본 Primer의 도구 호출로 활동 ZIP 설치/등록/공유를 자동 수행할 수 없다. 만들었다거나 저장했다고 거짓 주장하지 말고 복사해 사용할 수 있는 초안이라고 명시한다.`
      : `당신은 중학교 학생을 위한 한국어 상호작용형 학습활동 AI다. 활동 아이디는 ${experienceId}이다. teachback 유형이면 학생이 자기 말로 설명하게 하며, roleplay 유형이면 관련 역할을 맡아 자연스러운 대화를 진행한다. 학생 응답을 구체적으로 반영하며 한 번에 질문 한 개. 답을 무조건 제공하지 않고 학생의 사고와 수정 기회를 존중한다. 음성이나 마이크를 요구하지 않는다.`;

    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.5,
        max_completion_tokens: 650,
        messages: [
          { role: 'system', content: `모든 응답을 자연스러운 한국어로 작성한다. 이 대화는 비용을 절약하는 텍스트 전용 Preview 테스트다. 음성 출력과 오디오 생성은 하지 않는다. ${task}` },
          ...messages,
        ],
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
    });

    if (!upstream.ok) {
      let detail = 'OpenAI 텍스트 모델 요청이 실패했습니다.';
      try {
        const data = await upstream.json();
        if (typeof data?.error?.message === 'string') detail = data.error.message.slice(0, 200);
      } catch {}
      return NextResponse.json({ error: detail, status: upstream.status }, { status: 502 });
    }
    const data = await upstream.json();
    const answer = data?.choices?.[0]?.message?.content;
    if (typeof answer !== 'string' || !answer.trim()) {
      return NextResponse.json({ error: 'AI가 빈 응답을 반환했습니다.' }, { status: 502 });
    }
    return NextResponse.json({
      answer,
      model: MODEL,
      usage: {
        inputTokens: data?.usage?.prompt_tokens ?? null,
        outputTokens: data?.usage?.completion_tokens ?? null,
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: '응답을 생성하지 못했습니다. 다시 시도해 주세요.' }, { status: 500 });
  }
}
