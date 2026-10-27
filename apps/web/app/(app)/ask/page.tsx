"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Fragment,
  Suspense,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { SparklesIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
import { ApiError } from "@/lib/api/client";
import {
  askInbox,
  getAskStatus,
  type AskResult,
  type AskSource,
} from "@/lib/services/ask.service";
import { formatRelativeDate, participantListLabel } from "@/lib/utils/format";

const EXAMPLES = [
  "When is my next meeting?",
  "What did the recruiter say about the interview?",
  "Did anyone send me an invoice this month?",
];

interface Exchange {
  id: number;
  question: string;
  result: AskResult;
}

/** The answer text with each [n] turned into a link to its source card. */
function AnswerText({ id, text }: { id: number; text: string }) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <p className="text-sm leading-relaxed whitespace-pre-line text-zinc-800">
      {parts.map((part, index) => {
        const match = /^\[(\d+)\]$/.exec(part);
        if (!match) {
          return <Fragment key={index}>{part}</Fragment>;
        }
        return (
          <a
            key={index}
            href={`#source-${id}-${match[1]}`}
            className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-indigo-100 px-1 align-super text-[10px] font-semibold text-indigo-700 no-underline hover:bg-indigo-200"
            aria-label={`Source ${match[1]}`}
          >
            {match[1]}
          </a>
        );
      })}
    </p>
  );
}

function SourceCard({ exchangeId, source }: { exchangeId: number; source: AskSource }) {
  return (
    <li
      id={`source-${exchangeId}-${source.n}`}
      className="flex gap-3 rounded-lg border border-zinc-200 bg-white p-3 target:ring-2 target:ring-indigo-300"
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-indigo-100 text-[11px] font-semibold text-indigo-700">
        {source.n}
      </span>
      <div className="min-w-0 flex-1">
        <Link
          href={`/inbox/${source.threadId}`}
          className="block truncate text-sm font-medium text-zinc-800 hover:text-indigo-600 hover:underline"
        >
          {source.subject || "(no subject)"}
        </Link>
        <p className="truncate text-xs text-zinc-500">
          {participantListLabel(source.from ?? [])} ·{" "}
          {formatRelativeDate(source.receivedAt)}
        </p>
        {source.excerpt && (
          <p className="mt-1 line-clamp-3 text-xs text-zinc-600">
            {source.excerpt}
          </p>
        )}
      </div>
    </li>
  );
}

function ExchangeView({ exchange }: { exchange: Exchange }) {
  const { id, question, result } = exchange;
  return (
    <section className="space-y-3">
      <p className="text-sm font-medium text-zinc-900">{question}</p>
      <div
        className={
          result.found
            ? "rounded-xl border border-indigo-100 bg-indigo-50/40 p-4"
            : "rounded-xl border border-zinc-200 bg-zinc-50 p-4"
        }
      >
        <AnswerText id={id} text={result.answer} />
        {!result.found && (
          <p className="mt-2 text-xs text-zinc-500">
            Try other words — a name, a company or a subject line usually
            works best.
          </p>
        )}
      </div>
      {result.sources.length > 0 && (
        <ul className="space-y-2" aria-label="Sources">
          {result.sources.map((source) => (
            <SourceCard key={source.n} exchangeId={id} source={source} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AskView() {
  const initialQuestion = useSearchParams().get("q") ?? "";
  const [question, setQuestion] = useState(initialQuestion);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const nextId = useRef(1);

  const { data: status } = useQuery({
    queryKey: ["ask-status"],
    queryFn: getAskStatus,
    // Poll only while the first backfill is still running.
    refetchInterval: (query) => {
      const data = query.state.data;
      return data && data.indexed < data.total ? 15_000 : false;
    },
  });

  const askMutation = useMutation({
    mutationFn: (text: string) => askInbox(text),
    onSuccess: (result, text) => {
      setExchanges((previous) => [
        { id: nextId.current++, question: text, result },
        ...previous,
      ]);
      setQuestion("");
    },
  });

  function submit(text: string) {
    const trimmed = text.trim();
    if (trimmed.length < 2 || askMutation.isPending) return;
    askMutation.mutate(trimmed);
  }

  // A question handed over from the top-bar search box (/ask?q=…).
  const askInitial = useEffectEvent(() => submit(initialQuestion));
  const initialAsked = useRef(false);
  useEffect(() => {
    if (!initialQuestion || initialAsked.current) return;
    initialAsked.current = true;
    askInitial();
  }, [initialQuestion]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit(question);
  }

  const stillIndexing = status && status.indexed < status.total;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-4">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
          <SparklesIcon className="h-5 w-5 text-indigo-600" />
          Ask your inbox
        </h1>
        <p className="text-sm text-zinc-500">
          Ask a question and get an answer from your own email, with links to
          the emails it came from.
        </p>
      </div>

      {stillIndexing && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200 ring-inset">
          Still reading your email: {status.indexed.toLocaleString()} of{" "}
          {status.total.toLocaleString()} messages so far. Answers may miss
          what isn&apos;t read yet.
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={500}
          placeholder="e.g. When is my flight to Pune?"
          aria-label="Your question"
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        />
        <Button
          type="submit"
          loading={askMutation.isPending}
          disabled={question.trim().length < 2}
        >
          Ask
        </Button>
      </form>

      {askMutation.isPending && (
        <p className="flex items-center gap-2 text-sm text-zinc-500">
          <Spinner className="h-4 w-4" />
          Searching your email…
        </p>
      )}
      {askMutation.isError && (
        <p className="text-sm text-red-600">
          {askMutation.error instanceof ApiError
            ? askMutation.error.message
            : "Could not answer that. Try again."}
        </p>
      )}

      {exchanges.length === 0 && !askMutation.isPending && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-zinc-500">Try asking</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => submit(example)}
                className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-200"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-8">
        {exchanges.map((exchange) => (
          <ExchangeView key={exchange.id} exchange={exchange} />
        ))}
      </div>
    </div>
  );
}

export default function AskPage() {
  // useSearchParams() needs a Suspense boundary on a prerendered route.
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <AskView />
    </Suspense>
  );
}
