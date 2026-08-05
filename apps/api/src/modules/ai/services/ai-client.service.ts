import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
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
}
