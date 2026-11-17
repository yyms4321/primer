'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Message = { role: 'user' | 'assistant'; content: string };

export default function TextOnlyExperience({
  experienceId,
  title,
}: {
  experienceId: string;
  title: string;
}) {
  const creator = experienceId === 'experience-creator-with-workflows';
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUsage, setLastUsage] = useState<{ inputTokens: number | null; outputTokens: number | null } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Message[]>([]);
  const busyRef = useRef(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  async function submit(text: string) {
    const content = text.trim();
    if (!content || busyRef.current) return;
    if (content.length > 2200) {
      setError('한 번에 2,200자까지만 보낼 수 있습니다.');
      return;
    }
    const next = [...messagesRef.current, { role: 'user' as const, content }];
    if (next.length > 14) {
      setError('비용 관리를 위해 대화가 14개 메시지에 도달했습니다. 새 대화를 시작해 주세요.');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setDraft('');
    setMessages(next);
    messagesRef.current = next;
    try {
      const response = await fetch('/api/text-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ experienceId, messages: next }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || '연결에 실패했습니다.');
      const complete: Message[] = [...next, { role: 'assistant', content: data.answer }];
      setMessages(complete);
      messagesRef.current = complete;
      setLastUsage(data.usage ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '잠시 후 다시 시도해 주세요.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function reset() {
    if (busyRef.current) return;
    setMessages([]);
    messagesRef.current = [];
    setDraft('');
    setError(null);
    setLastUsage(null);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white px-5 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <Link href="/" className="text-sm text-slate-600 hover:underline">← 학습 활동 목록</Link>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">한국어 · 텍스트 전용</span>
        </div>
      </header>
      <div className="mx-auto flex max-w-4xl flex-col px-4 py-7">
        <div className="mb-4">
          <h1 className="text-2xl font-bold">{creator ? 'AI 학습 활동 만들기' : title}</h1>
          <p className="mt-2 text-sm text-slate-600">
            음성·마이크·Realtime API를 사용하지 않습니다. 일반 텍스트 모델(gpt-4.1-mini)로 응답합니다.
          </p>
          {creator && <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            현재는 학습 활동 <strong>초안 작성</strong> 테스트입니다. 원본 Primer의 활동 설치·자동 등록·학생 공유는 이 텍스트 모드에서 아직 연결되지 않았습니다.
          </p>}
          <p className="mt-2 text-xs text-slate-500">응답당 최대 650 출력 토큰 · 최대 14개 메시지 · 저장/재접속 보장 없음</p>
        </div>

        <section aria-label="채팅 대화" className="min-h-[360px] max-h-[55vh] space-y-4 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {messages.length === 0 && (
            <div className="space-y-3 text-sm text-slate-700">
              <p className="font-semibold">안녕하세요! 무엇을 도와드릴까요?</p>
              <p>{creator
                ? '학년, 교과, 학습 목표를 알려주시면 Teachback 또는 Roleplay 학습 활동을 한국어로 함께 설계할 수 있습니다.'
                : '이 학습 활동을 한국어 텍스트로 진행합니다. 아래에 답변을 입력해 주세요.'}</p>
              <button type="button" onClick={() => submit(creator
                ? '중학교 1학년 과학 수업에서 학생들이 행성의 특징을 설명하는 Teachback 활동을 만들어 줘.'
                : '안녕하세요. 학습 활동을 시작하고 싶어요.')} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-left text-blue-800 hover:bg-blue-100">
                {creator ? '예시: 행성 특징 Teachback 활동 만들기' : '한국어로 활동 시작하기'}
              </button>
            </div>
          )}
          {messages.map((message, index) => (
            <div key={index} className={message.role === 'user' ? 'ml-auto max-w-[85%] rounded-xl bg-blue-50 px-4 py-3' : 'mr-auto max-w-[95%] rounded-xl bg-slate-100 px-4 py-3'}>
              <p className="mb-1 text-xs font-semibold text-slate-500">{message.role === 'user' ? '나' : 'AI 도우미'}</p>
              <div className="prose prose-sm max-w-none whitespace-pre-wrap break-words prose-p:my-1 prose-ul:my-2 prose-ol:my-2">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
              </div>
            </div>
          ))}
          {busy && <p className="text-sm text-slate-500">AI가 답변을 작성하고 있습니다…</p>}
          <div ref={endRef} />
        </section>

        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
        <form onSubmit={(event) => { event.preventDefault(); void submit(draft); }} className="mt-3 space-y-2">
          <label htmlFor="korean-chat" className="block text-sm font-semibold">메시지 입력</label>
          <textarea id="korean-chat" value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(draft); } }}
            rows={3} maxLength={2200} placeholder="한국어로 입력하세요. Enter: 전송 / Shift+Enter: 줄바꿈"
            className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm outline-none focus:border-blue-500" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={reset} disabled={busy} className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-100 disabled:opacity-50">새 대화</button>
            <div className="flex items-center gap-2">
              {lastUsage && <span className="text-xs text-slate-500">최근 사용량: 입력 {lastUsage.inputTokens ?? '—'} / 출력 {lastUsage.outputTokens ?? '—'} 토큰</span>}
              <button type="submit" disabled={busy || !draft.trim() || messages.length >= 14}
                className="rounded-lg bg-blue-700 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:bg-slate-300">
                {busy ? '응답 중…' : '전송'}
              </button>
            </div>
          </div>
        </form>
        {creator && messages.some(m => m.role === 'assistant') && <button type="button"
          onClick={() => {
            const answer = [...messages].reverse().find(m => m.role === 'assistant')?.content;
            if (answer) void navigator.clipboard.writeText(answer);
          }} className="mt-3 self-end rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100">
          마지막 AI 답변 복사
        </button>}
      </div>
    </main>
  );
}
