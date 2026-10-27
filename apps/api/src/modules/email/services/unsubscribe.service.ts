import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';

import { PrismaService } from '../../../database';
import {
  isPrivateAddress,
  parseListUnsubscribe,
  UnsubscribeOptions,
} from '../utils/list-unsubscribe.util';

const ONE_CLICK_TIMEOUT_MS = 10_000;

/**
 * The Unsubscribe button on newsletter threads. Only a one-click sender
 * (RFC 8058) is unsubscribed by the server itself; a link is opened by the
 * user, and a mailto: becomes a prefilled compose the user sends. Nothing
 * here runs without an explicit request from the user.
 */
@Injectable()
export class UnsubscribeService {
  private readonly logger = new Logger(UnsubscribeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** How this thread's newsletter can be unsubscribed from (from its
   * newest message that carries the header); empty if it can't. */
  async getOptions(
    userId: string,
    threadId: string,
  ): Promise<UnsubscribeOptions> {
    const thread = await this.prisma.emailThread.findFirst({
      where: { id: threadId, account: { members: { some: { userId } } } },
      select: {
        messages: {
          where: { listUnsubscribe: { not: null } },
          orderBy: { receivedAt: 'desc' },
          take: 1,
          select: { listUnsubscribe: true, listUnsubscribePost: true },
        },
      },
    });
    if (!thread) {
      throw new NotFoundException('Thread not found');
    }
    const latest = thread.messages[0];
    return parseListUnsubscribe(
      latest?.listUnsubscribe,
      latest?.listUnsubscribePost,
    );
  }

  /** Sends the RFC 8058 one-click POST. Throws 400 when the sender doesn't
   * support one-click, 502 when its server refuses. */
  async unsubscribeOneClick(userId: string, threadId: string): Promise<void> {
    const { oneClickUrl } = await this.getOptions(userId, threadId);
    if (!oneClickUrl) {
      throw new BadRequestException(
        "This sender doesn't support one-click unsubscribe.",
      );
    }

    // The URL comes from an email header, i.e. from whoever sent the mail:
    // never let it point the server at its own network. (A DNS answer
    // could still change between this check and the request; redirects
    // are not followed, which closes the easier route.)
    const { hostname } = new URL(oneClickUrl);
    const addresses: LookupAddress[] = await lookup(hostname, {
      all: true,
    }).catch(() => []);
    if (
      addresses.length === 0 ||
      addresses.some(({ address }) => isPrivateAddress(address))
    ) {
      throw new BadRequestException(
        "This sender's unsubscribe address can't be reached.",
      );
    }

    let status: number;
    try {
      const response = await fetch(oneClickUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
        redirect: 'manual',
        signal: AbortSignal.timeout(ONE_CLICK_TIMEOUT_MS),
      });
      status = response.status;
    } catch (error: unknown) {
      this.logger.warn(
        { err: error },
        `One-click unsubscribe request failed for thread ${threadId}`,
      );
      throw new BadGatewayException(
        "The sender's unsubscribe service didn't respond. Try the link instead.",
      );
    }

    if (status >= 400) {
      throw new BadGatewayException(
        `The sender's unsubscribe service refused the request (HTTP ${status}). Try the link instead.`,
      );
    }
    this.logger.log(`One-click unsubscribe sent for thread ${threadId}.`);
  }
}
