import {
  BadGatewayException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EmailMessageDto } from '../dto';

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
}

export interface ClassifyResponse {
  classification: ClassificationResult;
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
}

interface RawClassifyResponse {
  classification: RawClassificationResult;
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
}

export interface EmbedQueryResponse {
  embedding: number[];
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
  ): Promise<GenerateReplyResponse> {
    const res = await this.post<RawReplyResponse>('/email/reply', {
      subject,
      thread,
      instruction,
      system_prompt_override: systemPromptOverride,
    });

    return {
      reply: res.draft,
      provider: res.provider,
      model: res.model,
      usage: mapUsage(res.usage),
    };
  }

  async rewrite(draft: string, instruction?: string): Promise<RewriteResponse> {
    const res = await this.post<RawRewriteResponse>('/email/rewrite', {
      draft,
      instruction,
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

    let response: Response;

    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
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
