import React, { useEffect, useRef } from 'react';
import type { ChatMessage } from '../../../shared/types';
import { Send } from 'lucide-react';
import { renderInlineMarkdown } from '../utils/formatting';

interface PatientChatProps {
  patientName: string;
  chatMessages: ChatMessage[];
  chatInput: string;
  onChatInputChange: (value: string) => void;
  chatLoading: boolean;
  chatLongWait?: boolean;
  onSendChat: () => void;
}

export const PatientChat: React.FC<PatientChatProps> = ({
  patientName, chatMessages, chatInput, onChatInputChange, chatLoading, chatLongWait, onSendChat,
}) => {
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-slate-200/80 bg-white">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 md:px-4 md:py-3">
        {chatMessages.length === 0 && !chatLoading && (
          <div className="flex h-full min-h-[8rem] flex-col justify-center text-center">
            <p className="text-xs text-slate-500">
              Ask HALO about <span className="font-semibold text-slate-700">{patientName}</span>&apos;s files and notes.
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {['Summarize recent notes', 'Any abnormal labs?', 'Listed medications?'].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => onChatInputChange(q)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-slate-600 transition-colors hover:border-teal-200 hover:bg-teal-50/80 hover:text-teal-800"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2.5">
          {chatMessages.map((msg, idx) => {
            const isLastAssistantStreaming = chatLoading && idx === chatMessages.length - 1 && msg.role === 'assistant';
            return (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                  msg.role === 'user'
                    ? 'rounded-br-md bg-teal-600 text-white'
                    : 'rounded-bl-md border border-slate-200 bg-slate-50 text-slate-800'
                }`}>
                  {msg.role === 'assistant' && (
                    <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-teal-600">HALO</span>
                  )}
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">
                    {msg.content.split('\n').map((line, li) => (
                      <span key={li}>{li > 0 && <br />}{renderInlineMarkdown(line)}</span>
                    ))}
                    {isLastAssistantStreaming && <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-teal-500" />}
                  </div>
                  {!isLastAssistantStreaming && (
                    <span className={`mt-1 block text-[9px] ${msg.role === 'user' ? 'text-teal-200' : 'text-slate-400'}`}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {chatLoading && !(chatMessages.length > 0 && chatMessages[chatMessages.length - 1]?.role === 'assistant' && chatMessages[chatMessages.length - 1]?.content) && (
          <div className="mt-2 flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-teal-600">HALO</span>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs italic text-slate-500">Thinking…</span>
                  <span className="flex gap-0.5">
                    <span className="h-1 w-1 animate-bounce rounded-full bg-teal-400" style={{ animationDelay: '0ms' }} />
                    <span className="h-1 w-1 animate-bounce rounded-full bg-teal-400" style={{ animationDelay: '150ms' }} />
                    <span className="h-1 w-1 animate-bounce rounded-full bg-teal-400" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
                {chatLongWait ? (
                  <span className="text-[10px] text-slate-400">Complex questions may take 15–60 seconds.</span>
                ) : null}
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      <div className="shrink-0 border-t border-slate-100 bg-slate-50/90 px-2 py-2 md:px-3">
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => onChatInputChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSendChat(); } }}
            placeholder="Ask about this patient…"
            className="min-h-[40px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            disabled={chatLoading}
          />
          <button
            type="button"
            onClick={onSendChat}
            disabled={!chatInput.trim() || chatLoading}
            className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg bg-teal-600 p-2 text-white shadow-sm transition-all hover:bg-teal-700 disabled:opacity-40"
            aria-label="Send message"
          >
            <Send size={17} />
          </button>
        </div>
      </div>
    </div>
  );
};
