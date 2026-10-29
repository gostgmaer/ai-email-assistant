import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EmailMessageDto } from '../dto';
import {
  resolveRewriteStyle,
  RewriteStyle,
} from '../utils/rewrite-styles.util';

const DEFAULT_AI_REQUEST_TIMEOUT_MS = 60_000;
// Calls that legitimately take longer than one LLM round-trip: reply
// generation chains several model calls, and document processing parses,
// chunks and embeds a whole file.
const TIMEOUT_MULTIPLIER: Record<string, number> = {
  '/email/reply': 2,
  '/documents/process': 10,
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface SummarizeResponse {
  summary: string;
  keyPoints: string[];
  provider: string;
  model: string;
  usage: TokenUsage;
}

export interface GenerateReplyResponse {
  reply: string;
  provider: string;
  model: string;
  usage: TokenUsage;
}

export interface SenderProfile {
  name?: string | null;
  jobTitle?: string | null;
  company?: string | null;
  hasSignature: boolean;
}

export interface RewriteResponse {
  text: string;
  provider: string;
  model: string;
  usage: TokenUsage;
}

export interface ClassificationResult {
  category: string;
  priority: string;
  sentiment: string;
  spam: boolean;
  language: string;
  containsPii: boolean;
  piiTypes: string[];
  needsReply: boolean;
  replyReason: string;
}

export interface ClassifyResponse {
  classification: ClassificationResult;
  provider: string;
  model: string;
  usage: TokenUsage;
}

export interface ReplyValidationResult {
  addressesThread: boolean;
  concerns: string[];
  unsupportedClaims: string[];
  grammarIssues: string[];
  toneAppropriate: boolean;
  toneNote: string;
  confidence: number;
}

export interface ValidateReplyResponse {
  validation: ReplyValidationResult;
  provider: string;
  model: string;
  usage: TokenUsage;
}

export interface ExtractionResult {
  people: string[];
  emails: string[];
  phones: string[];
  companies: string[];
  dates: string[];
  urls: string[];
  tasks: string[];
  meetingRequests: string[];
}

export interface ExtractResponse {
  extraction: ExtractionResult;
  provider: string;
  model: string;
  usage: TokenUsage;
}

export interface ContactFacts {
  role: string | null;
  company: string | null;
  summary: string;
  commitments: string[];
}

export interface ContactMemoryResponse {
  facts: ContactFacts;
  embedding: number[];
  provider: string;
  model: string;
  usage: TokenUsage;
}

interface RawUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

function mapUsage(usage: RawUsage): TokenUsage {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.total_tokens,
  };
}

interface RawAnswerResponse {
  answer: string;
  citations: number[];
  found: boolean;
  provider: string;
  model: string;
  usage: RawUsage;
}

interface RawCommitment {
  text: string;
  due_date: string | null;
  due_time: string | null;
  confidence: number;
}

interface RawCommitmentsResponse {
  commitments: RawCommitment[];
  provider: string;
  model: string;
  usage: RawUsage;
}

interface RawSummarizeResponse {
  summary: string;
  key_points: string[];
  provider: string;
  model: string;
  usage: RawUsage;
}

interface RawReplyResponse {
  draft: string;
  provider: string;
  model: string;
  usage: RawUsage;
}

interface RawRewriteResponse {
  rewritten_draft: string;
  provider: string;
  model: string;
  usage: RawUsage;
}

interface RawClassificationResult {
  category: string;
  priority: string;
  sentiment: string;
  spam: boolean;
  language: string;
  contains_pii: boolean;
  pii_types: string[];
  // Optional: an AI service predating needs_reply doesn't send it.
  needs_reply?: boolean;
  reply_reason?: string;
}

interface RawClassifyResponse {
  classification: RawClassificationResult;
  provider: string;
  model: string;
  usage: RawUsage;
}

interface RawReplyValidationResult {
  addresses_thread: boolean;
  concerns: string[];
  unsupported_claims: string[];
  grammar_issues: string[];
  tone_appropriate: boolean;
  tone_note: string;
  confidence: number;
}

interface RawValidateReplyResponse {
  validation: RawReplyValidationResult;
  provider: string;
  model: string;
  usage: RawUsage;
}

interface RawExtractionResult {
  people: string[];
  emails: string[];
  phones: string[];
  companies: string[];
  dates: string[];
  urls: string[];
  tasks: string[];
  meeting_requests: string[];
}

interface RawExtractResponse {
  extraction: RawExtractionResult;
  provider: string;
  model: string;
  usage: RawUsage;
}

interface RawContactMemoryResponse {
  facts: ContactFacts;
  embedding: number[];
  provider: string;
  model: string;
  usage: RawUsage;
}

export interface ProcessedDocumentChunk {
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  page: number | null;
  section: string | null;
  chunkType: string;
  tokenCount: number;
  wordCount: number;
  characterCount: number;
  startChar: number;
  endChar: number;
  lineStart: number;
  lineEnd: number;
}

export interface ProcessDocumentFileRef {
  /** file-upload-service's file id — this service downloads the file
   * itself, apps/api never touches the bytes. */
  fileId: string;
  filename: string;
  contentType: string;
  uploadedBy: string;
  userEmail: string;
  userRole: string;
  tenantId: string;
}

export interface ProcessDocumentResponse {
  chunks: ProcessedDocumentChunk[];
  provider: string;
  model: string;
  parser: string | null;
  splitter: string | null;
  chunkSize: number | null;
  chunkOverlap: number | null;
  pageCount: number | null;
  language: string | null;
}

interface RawProcessedDocumentChunk {
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  page: number | null;
  section: string | null;
  chunk_type: string;
  token_count: number;
  word_count: number;
  character_count: number;
  start_char: number;
  end_char: number;
  line_start: number;
  line_end: number;
}

interface RawProcessDocumentResponse {
  chunks: RawProcessedDocumentChunk[];
  provider: string;
  model: string;
  parser: string | null;
  splitter: string | null;
  chunk_size: number | null;
  chunk_overlap: number | null;
  page_count: number | null;
  language: string | null;
}

export interface EmbedQueryResponse {
  embedding: number[];
  provider: string;
  model: string;
}

export interface AnswerSource {
  n: number;
  subject: string;
  sender: string;
  /** YYYY-MM-DD */
  date: string;
  content: string;
}

export interface AnswerResponse {
  answer: string;
  citations: number[];
  found: boolean;
  provider: string;
  model: string;
  usage: TokenUsage;
}

export interface CommitmentsInput {
  subject: string;
  senderName: string;
  /** The user's own text, quoted history already stripped. */
  content: string;
  /** e.g. "Tuesday 2026-10-27 14:05", on the user's clock. */
  sentAt: string;
  /** YYYY-MM-DD of the same moment. */
  sentDate: string;
  timezone: string;
}

export interface Commitment {
  text: string;
  /** YYYY-MM-DD, never before sentDate; null when no deadline was named. */
  dueDate: string | null;
  /** HH:MM, only with a dueDate. */
  dueTime: string | null;
  /** 0..1 */
  confidence: number;
}

export interface CommitmentsResponse {
  commitments: Commitment[];
  provider: string;
  model: string;
  usage: TokenUsage;
}

export interface EmbedBatchResponse {
  embeddings: number[][];
  provider: string;
  model: string;
}

export interface BusyIntervalInput {
  start: string;
  end: string;
}

export interface MeetingTimeSuggestion {
  start: string;
  end: string;
  title: string;
}

export interface SuggestMeetingTimeResponse {
  suggestion: MeetingTimeSuggestion;
  provider: string;
  model: string;
  usage: TokenUsage;
}

interface RawSuggestMeetingTimeResponse {
  suggestion: MeetingTimeSuggestion;
  provider: string;
  model: string;
  usage: RawUsage;
}

@Injectable()
export class AiClientService {
  private readonly logger = new Logger(AiClientService.name);

  constructor(private readonly configService: ConfigService) {}

  async summarize(
    subject: string,
    thread: EmailMessageDto[],
  ): Promise<SummarizeResponse> {
    const res = await this.post<RawSummarizeResponse>('/email/summarize', {
      subject,
      thread,
    });

    return {
      summary: res.summary,
      keyPoints: res.key_points,
      provider: res.provider,
      model: res.model,
      usage: mapUsage(res.usage),
    };
  }

  async generateReply(
    subject: string,
    thread: EmailMessageDto[],
    instruction?: string,
    // AI Agents (v2.0 §4): when set, replaces apps/ai's default reply.md
    // prompt entirely for this call — see ReplyRequest.system_prompt_override.
    systemPromptOverride?: string,
    // Who the reply is written as (the mailbox owner's profile), and
    // whether a signature will be appended afterwards — see
    // ReplyRequest.sender_profile.
    senderProfile?: SenderProfile,
  ): Promise<GenerateReplyResponse> {
    const res = await this.post<RawReplyResponse>('/email/reply', {
      subject,
      thread,
      instruction,
      system_prompt_override: systemPromptOverride,
      sender_profile: senderProfile
        ? {
            name: senderProfile.name ?? undefined,
            job_title: senderProfile.jobTitle ?? undefined,
            company: senderProfile.company ?? undefined,
            has_signature: senderProfile.hasSignature,
          }
        : undefined,
    });

    return {
      reply: res.draft,
      provider: res.provider,
      model: res.model,
      usage: mapUsage(res.usage),
    };
  }

  async rewrite(
    draft: string,
    instruction?: string,
    style?: RewriteStyle,
  ): Promise<RewriteResponse> {
    const res = await this.post<RawRewriteResponse>('/email/rewrite', {
      draft,
      ...resolveRewriteStyle(style, instruction),
    });

    return {
      text: res.rewritten_draft,
      provider: res.provider,
      model: res.model,
      usage: mapUsage(res.usage),
    };
  }

  async classify(
    subject: string,
    thread: EmailMessageDto[],
  ): Promise<ClassifyResponse> {
    const res = await this.post<RawClassifyResponse>('/email/classify', {
      subject,
      thread,
    });

    return {
      classification: {
        category: res.classification.category,
        priority: res.classification.priority,
        sentiment: res.classification.sentiment,
        spam: res.classification.spam,
        language: res.classification.language,
        containsPii: res.classification.contains_pii,
        piiTypes: res.classification.pii_types,
        // Absent means "unknown" — treated as needing a reply, so a missing
        // field can never silently suppress replies.
        needsReply: res.classification.needs_reply ?? true,
        replyReason: res.classification.reply_reason ?? '',
      },
      provider: res.provider,
      model: res.model,
      usage: mapUsage(res.usage),
    };
  }

  /** Output validation (v2.0+ pipeline hardening — see
   * docs/enterprise-ai-pipeline-plan.md §6): checks a drafted reply
   * against its own thread before AiProcessingProcessor allows it to
   * auto-send. */
  async validateReply(
    subject: string,
    thread: EmailMessageDto[],
    draftReply: string,
  ): Promise<ValidateReplyResponse> {
    const res = await this.post<RawValidateReplyResponse>(
      '/email/validate-reply',
      { subject, thread, draft_reply: draftReply },
    );

    return {
      validation: {
        addressesThread: res.validation.addresses_thread,
        concerns: res.validation.concerns,
        unsupportedClaims: res.validation.unsupported_claims,
        grammarIssues: res.validation.grammar_issues,
        toneAppropriate: res.validation.tone_appropriate,
        toneNote: res.validation.tone_note,
        confidence: res.validation.confidence,
      },
      provider: res.provider,
      model: res.model,
      usage: mapUsage(res.usage),
    };
  }

  async extract(
    subject: string,
    thread: EmailMessageDto[],
  ): Promise<ExtractResponse> {
    const res = await this.post<RawExtractResponse>('/email/extract', {
      subject,
      thread,
    });

    return {
      extraction: {
        people: res.extraction.people,
        emails: res.extraction.emails,
        phones: res.extraction.phones,
        companies: res.extraction.companies,
        dates: res.extraction.dates,
        urls: res.extraction.urls,
        tasks: res.extraction.tasks,
        meetingRequests: res.extraction.meeting_requests,
      },
      provider: res.provider,
      model: res.model,
      usage: mapUsage(res.usage),
    };
  }

  async contactMemory(
    subject: string,
    thread: EmailMessageDto[],
  ): Promise<ContactMemoryResponse> {
    const res = await this.post<RawContactMemoryResponse>(
      '/email/contact-memory',
      { subject, thread },
    );

    return {
      facts: res.facts,
      embedding: res.embedding,
      provider: res.provider,
      model: res.model,
      usage: mapUsage(res.usage),
    };
  }

  async processDocument(
    fileRef: ProcessDocumentFileRef,
  ): Promise<ProcessDocumentResponse> {
    const res = await this.post<RawProcessDocumentResponse>(
      '/documents/process',
      {
        file_id: fileRef.fileId,
        filename: fileRef.filename,
        content_type: fileRef.contentType,
        uploaded_by: fileRef.uploadedBy,
        user_email: fileRef.userEmail,
        user_role: fileRef.userRole,
        tenant_id: fileRef.tenantId,
      },
    );

    return {
      provider: res.provider,
      model: res.model,
      parser: res.parser,
      splitter: res.splitter,
      chunkSize: res.chunk_size,
      chunkOverlap: res.chunk_overlap,
      pageCount: res.page_count,
      language: res.language,
      chunks: res.chunks.map((chunk) => ({
        content: chunk.content,
        embedding: chunk.embedding,
        metadata: chunk.metadata,
        page: chunk.page,
        section: chunk.section,
        chunkType: chunk.chunk_type,
        tokenCount: chunk.token_count,
        wordCount: chunk.word_count,
        characterCount: chunk.character_count,
        startChar: chunk.start_char,
        endChar: chunk.end_char,
        lineStart: chunk.line_start,
        lineEnd: chunk.line_end,
      })),
    };
  }

  async embedQuery(text: string): Promise<EmbedQueryResponse> {
    return this.post<EmbedQueryResponse>('/documents/embed', { text });
  }

  /** "Ask your inbox": answers `question` from numbered search hits,
   * citing them as [n]. */
  async answer(
    question: string,
    today: string,
    sources: AnswerSource[],
  ): Promise<AnswerResponse> {
    const res = await this.post<RawAnswerResponse>('/email/answer', {
      question,
      today,
      sources,
    });

    return { ...res, usage: mapUsage(res.usage) };
  }

  /** Promises the user makes in one sent message, with due dates resolved
   * against when it was sent. */
  async commitments(input: CommitmentsInput): Promise<CommitmentsResponse> {
    const res = await this.post<RawCommitmentsResponse>('/email/commitments', {
      subject: input.subject,
      sender_name: input.senderName,
      content: input.content,
      sent_at: input.sentAt,
      sent_date: input.sentDate,
      timezone: input.timezone,
    });

    return {
      commitments: res.commitments.map((commitment) => ({
        text: commitment.text,
        dueDate: commitment.due_date,
        dueTime: commitment.due_time,
        confidence: commitment.confidence,
      })),
      provider: res.provider,
      model: res.model,
      usage: mapUsage(res.usage),
    };
  }

  /** Several texts in one provider call (at most 100 — the AI service's
   * MAX_EMBED_BATCH); embeddings come back in the same order. */
  async embedBatch(texts: string[]): Promise<EmbedBatchResponse> {
    return this.post<EmbedBatchResponse>('/documents/embed-batch', { texts });
  }

  async suggestMeetingTime(
    description: string,
    referenceDate: string,
    busy: BusyIntervalInput[],
  ): Promise<SuggestMeetingTimeResponse> {
    const res = await this.post<RawSuggestMeetingTimeResponse>(
      '/calendar/suggest-meeting-time',
      { description, reference_date: referenceDate, busy },
    );

    return {
      suggestion: res.suggestion,
      provider: res.provider,
      model: res.model,
      usage: mapUsage(res.usage),
    };
  }

  private async post<T>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const baseUrl = this.configService.getOrThrow<string>('AI_SERVICE_URL');
    const apiKey = this.configService.get<string>('AI_SERVICE_API_KEY');

    // Without a timeout one hung LLM call held its worker slot forever,
    // stalling every AI job queued behind it. A timeout is retryable
    // (the AI job's own retries), so it fails the attempt, not the message.
    const configuredTimeout = Number(
      this.configService.get<string>('AI_REQUEST_TIMEOUT_MS') ??
        DEFAULT_AI_REQUEST_TIMEOUT_MS,
    );
    const timeoutMs =
      (Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : DEFAULT_AI_REQUEST_TIMEOUT_MS) * (TIMEOUT_MULTIPLIER[path] ?? 1);

    let response: Response;

    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      // AbortSignal.timeout() rejects with a DOMException named
      // TimeoutError; matched by name, since DOMException isn't
      // `instanceof Error` in every runtime (e.g. Jest's).
      if ((error as { name?: unknown } | null)?.name === 'TimeoutError') {
        this.logger.error(
          `AI service request to ${path} timed out after ${timeoutMs}ms`,
        );
        throw new GatewayTimeoutException(
          `AI service timed out after ${Math.round(timeoutMs / 1000)}s`,
        );
      }
      this.logger.error(
        `AI service request to ${path} failed: ${String(error)}`,
      );
      throw new BadGatewayException('AI service is unreachable');
    }

    // 422 means "well-formed request, semantically invalid" (e.g.
    // documents/process rejecting an unsupported file type) — surface that
    // distinctly instead of the generic 502 so callers can react to it.
    if (response.status === 422) {
      const errorBody = (await response.json().catch(() => null)) as {
        detail?: string;
      } | null;
      throw new UnprocessableEntityException(
        errorBody?.detail ?? 'Unprocessable request',
      );
    }

    // The LLM/embedding provider's quota, passed through as 429 rather than
    // a generic 502: callers that run in the background (search indexing)
    // back off until their next run instead of retrying into the limit, and
    // a user-facing call can say "try again shortly".
    if (response.status === 429) {
      this.logger.warn(`AI provider rate limit reached at ${path}`);
      throw new HttpException(
        'The AI provider is rate-limiting requests. Try again shortly.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (!response.ok) {
      const text = await response.text();
      this.logger.warn(
        `AI service error (${response.status}) at ${path}: ${text}`,
      );
      throw new BadGatewayException(`AI service error (${response.status})`);
    }

    return (await response.json()) as T;
  }
}
