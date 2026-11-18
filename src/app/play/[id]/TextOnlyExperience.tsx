'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import PrimerBackground from '@/app/components/PrimerBackground';
import ExperienceTitle from '@/app/components/ExperienceTitle';

type Message = { role: 'user' | 'assistant'; content: string };
type Usage = { inputTokens: number | null; outputTokens: number | null };

const MAX_MESSAGES = 14;

/** Keep Markdown paragraph spacing controlled by CSS; never combine pre-wrap
 * with Markdown (it doubles line breaks and produces huge gaps). */
function RichText({ text }: { text: string }) {
  return (
    <div className="prose prose-sm max-w-none break-words text-foreground prose-headings:mb-2 prose-headings:mt-4 prose-headings:font-semibold prose-p:my-2 prose-p:leading-7 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-hr:my-4 prose-pre:overflow-x-auto">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

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
  const [truncated, setTruncated] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const busyRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, busy]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busyRef.current) return;
    if (content.length > 2200) {
      setError('메시지는 2,200자 이하로 입력해 주세요.');
      return;
    }
    const next: Message[] = [...messagesRef.current, { role: 'user', content }];
    if (next.length > MAX_MESSAGES) {
      setError('테스트 비용 관리를 위해 대화 길이를 제한했습니다. 새 대화를 시작해 주세요.');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setTruncated(false);
    setDraft('');
    setMessages(next);
    messagesRef.current = next;

    try {
      const response = await fetch('/api/text-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ experienceId, messages: next }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'AI 응답을 받지 못했습니다.');
      const completed: Message[] = [...next, { role: 'assistant', content: payload.answer }];
      messagesRef.current = completed;
      setMessages(completed);
      setTruncated(Boolean(payload.truncated));
      setUsage(payload.usage ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '요청에 실패했습니다.');
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
    setTruncated(false);
    setUsage(null);
  }

  const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant')?.content;
  const copyDraft = () => {
    if (lastAssistant) void navigator.clipboard.writeText(lastAssistant);
  };
  const latestAssistantIndex = messages.findLastIndex((message) => message.role === 'assistant');

  return (
    <PrimerBackground footerType="builder" runningSubject={creator ? 'Experience Creator' : title} useInitialBackdrop={false}>
      <div className="mx-auto flex h-full min-h-[500px] w-full max-w-[1440px] flex-col gap-3 px-4 pb-4 pt-5 md:px-8">
        <div className="shrink-0 text-center">
          <ExperienceTitle title={creator ? 'Experience Creator' : title} />
          <p className="mt-1 text-xs text-muted-foreground">한국어 텍스트 대화 · 오디오 및 마이크 사용 안 함 · gpt-4.1-mini</p>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-[minmax(320px,1fr)_minmax(380px,1.2fr)]">
          <section className="flex min-h-[320px] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-lg">
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted px-5 py-3">
              <h2 className="text-base font-medium">대화 내용 <span className="ml-2 text-xs font-normal text-muted-foreground">Interview Transcript</span></h2>
              <button type="button" onClick={reset} disabled={busy} className="rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-accent disabled:opacity-40">
                새 대화
              </button>
            </div>
            <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {messages.length === 0 && (
                <div className="space-y-4 py-4 text-sm leading-7">
                  <p className="font-medium">{creator ? '어떤 학습 활동을 만들고 싶으신가요?' : '한국어로 학습 활동을 시작해 주세요.'}</p>
                  <p className="text-muted-foreground">{creator ? '학년과 교과, 학습목표를 입력하면 Teachback·Roleplay 활동을 함께 설계할 수 있습니다.' : '입력창에 답변을 입력하면 AI가 한국어로 대화를 이어갑니다.'}</p>
                  <button type="button" onClick={() => void send(creator ? '중학교 1학년 과학 수업에서 태양계 행성의 특징을 설명하는 Teachback 활동을 설계해 줘.' : '안녕하세요. 활동을 시작하겠습니다.')} className="rounded-lg border border-border bg-muted px-3 py-2 text-left text-sm hover:bg-accent">
                    {creator ? '예시: 행성의 특징 Teachback 활동' : '활동 시작하기'}
                  </button>
                </div>
              )}
              {messages.map((message, index) => (
                <div key={index} className={message.role === 'user' ? 'ml-8 rounded-xl bg-accent p-3' : 'mr-3 rounded-xl bg-muted p-3'}>
                  <div className="mb-2 text-xs font-semibold text-muted-foreground">
                    {message.role === 'user' ? '나' : 'AI 설계 도우미'}
                  </div>
                  {message.role === 'assistant' && creator ? (
                    <p className="text-sm leading-6">
                      {index === latestAssistantIndex
                        ? '오른쪽 문서 패널에 최신 답변이 표시됐습니다. 내용을 확인하고 필요한 부분을 수정하도록 요청해 주세요.'
                        : '이전 AI 답변 · 오른쪽 패널에는 가장 최근 답변이 표시됩니다.'}
                    </p>
                  ) : (
                    <RichText text={message.content} />
                  )}
                </div>
              ))}
              {busy && <div className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">AI가 답변을 작성하고 있습니다…</div>}
            </div>
            <form onSubmit={(event) => { event.preventDefault(); void send(draft); }} className="shrink-0 border-t border-border bg-background p-4">
              {error && <p role="alert" className="mb-2 rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
              <label htmlFor="primer-text-input" className="mb-2 block text-sm font-medium">메시지 입력</label>
              <textarea
                id="primer-text-input" rows={3} maxLength={2200}
                value={draft} onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void send(draft);
                  }
                }}
                placeholder="한국어로 입력하세요. Enter: 전송 / Shift+Enter: 줄바꿈"
                className="w-full resize-none rounded-lg border border-input bg-background p-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{draft.length}/2200자</span>
                <button type="submit" disabled={busy || !draft.trim() || messages.length >= MAX_MESSAGES}
                  className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40">
                  {busy ? '작성 중…' : '전송'}
                </button>
              </div>
            </form>
          </section>

          <section className="flex min-h-[320px] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-lg">
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted px-5 py-3">
              <h2 className="text-base font-medium">{creator ? '학습 활동 설계 문서' : 'AI 응답'}</h2>
              <button type="button" onClick={copyDraft} disabled={!lastAssistant} className="rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-accent disabled:opacity-40">문서 복사</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {lastAssistant ? (
                <RichText text={lastAssistant} />
              ) : (
                <div className="py-8 text-sm leading-7 text-muted-foreground">
                  {creator ? '교사와 AI가 대화하며 만드는 활동 설계 내용이 이곳에 표시됩니다.' : 'AI 응답이 이곳에 표시됩니다.'}
                </div>
              )}
              {truncated && (
                <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  답변이 출력 한도에 도달했습니다. 아래 버튼을 눌러 이어서 작성할 수 있습니다.
                  <button type="button" disabled={busy || messages.length >= MAX_MESSAGES} onClick={() => void send('바로 위 답변이 끊긴 부분부터 이어 작성해 줘. 이미 작성한 문장은 반복하지 말고 마지막 항목까지 완성해 줘.')}
                    className="mt-2 block rounded-md border border-amber-400 bg-white px-3 py-1.5 text-sm disabled:opacity-50">
                    이어서 작성
                  </button>
                </div>
              )}
            </div>
            <div className="shrink-0 border-t border-border bg-muted px-5 py-2 text-xs leading-5 text-muted-foreground">
              {creator ? '현재 텍스트 모드는 문서 초안 작성·복사까지 지원하며, Primer 활동 자동 등록 기능은 아직 연결되지 않았습니다.' : '텍스트 전용 테스트 모드'}
              {usage && <span className="ml-2">최근 사용량: 입력 {usage.inputTokens ?? '—'} / 출력 {usage.outputTokens ?? '—'} 토큰</span>}
            </div>
          </section>
        </div>
      </div>
    </PrimerBackground>
  );
}
