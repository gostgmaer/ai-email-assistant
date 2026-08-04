import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SummarizeResponse {
  summary: string;
}

export interface GenerateReplyResponse {
  reply: string;
}

export interface RewriteResponse {
  text: string;
}

export interface ClassifyResponse {
  category: string;
  confidence?: number;
}

@Injectable()
export class AiClientService {
  private readonly logger = new Logger(AiClientService.name);

  constructor(private readonly configService: ConfigService) {}

  async summarize(text: string): Promise<SummarizeResponse> {
    return this.post<SummarizeResponse>('/v1/email/summarize', { text });
  }

  async generateReply(
    threadContext: string,
    instructions?: string,
  ): Promise<GenerateReplyResponse> {
    return this.post<GenerateReplyResponse>('/v1/email/reply', {
      threadContext,
      instructions,
    });
  }

  async rewrite(text: string, instructions?: string): Promise<RewriteResponse> {
    return this.post<RewriteResponse>('/v1/email/rewrite', {
      text,
      instructions,
    });
  }

  async classify(text: string): Promise<ClassifyResponse> {
    return this.post<ClassifyResponse>('/v1/email/classify', { text });
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
