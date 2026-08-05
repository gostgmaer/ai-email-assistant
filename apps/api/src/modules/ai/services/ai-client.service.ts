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
}

export interface ClassifyResponse {
  classification: ClassificationResult;
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

interface RawClassifyResponse {
  classification: ClassificationResult;
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
}

export interface ProcessDocumentResponse {
  chunks: ProcessedDocumentChunk[];
  provider: string;
  model: string;
}

export interface EmbedQueryResponse {
  embedding: number[];
  provider: string;
  model: string;
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
  ): Promise<GenerateReplyResponse> {
    const res = await this.post<RawReplyResponse>('/email/reply', {
      subject,
      thread,
      instruction,
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
      classification: res.classification,
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
    buffer: Buffer,
    filename: string,
    contentType: string,
  ): Promise<ProcessDocumentResponse> {
    const formData = new FormData();
    formData.append(
      'file',
      new Blob([new Uint8Array(buffer)], { type: contentType }),
      filename,
    );

    return this.postMultipart<ProcessDocumentResponse>(
      '/documents/process',
      formData,
    );
  }

  async embedQuery(text: string): Promise<EmbedQueryResponse> {
    return this.post<EmbedQueryResponse>('/documents/embed', { text });
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

    if (!response.ok) {
      const text = await response.text();
      this.logger.warn(
        `AI service error (${response.status}) at ${path}: ${text}`,
      );
      throw new BadGatewayException(`AI service error (${response.status})`);
    }

    return (await response.json()) as T;
  }

  private async postMultipart<T>(path: string, formData: FormData): Promise<T> {
    const baseUrl = this.configService.getOrThrow<string>('AI_SERVICE_URL');
    const apiKey = this.configService.get<string>('AI_SERVICE_API_KEY');

    let response: Response;

    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: formData,
      });
    } catch (error) {
      this.logger.error(
        `AI service request to ${path} failed: ${String(error)}`,
      );
      throw new BadGatewayException('AI service is unreachable');
    }

    // The document-processing endpoint uses 422 specifically to mean
    // "unsupported file type" — surface that distinctly instead of the
    // generic 502 so the frontend can show the AI service's own message.
    if (response.status === 422) {
      const body = (await response.json().catch(() => null)) as {
        detail?: string;
      } | null;
      throw new UnprocessableEntityException(
        body?.detail ?? 'Unsupported document',
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
