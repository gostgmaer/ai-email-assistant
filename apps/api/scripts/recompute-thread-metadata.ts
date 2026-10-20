/**
 * One-off repair for docs/email-automation-gaps.md G-14: before the fix in
 * EmailSyncService.persistMessage, every synced message overwrote its
 * thread's lastMessageAt/subject/snippet, so a thread could end up
 * describing an OLDER message than its newest one (wrong inbox order,
 * follow-ups, digests). This resets each thread's metadata from its newest
 * message. Idempotent — safe to run more than once.
 *
 * Usage (from apps/api):
 *   npx ts-node scripts/recompute-thread-metadata.ts            # dry run
 *   npx ts-node scripts/recompute-thread-metadata.ts --apply
 */
import { resolve } from 'path';

import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

import { PrismaClient } from '../src/generated/prisma/client';

dotenv.config({ path: resolve(__dirname, '../.env'), quiet: true });

const BATCH_SIZE = 500;

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set (apps/api/.env)');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg(connectionString),
  });

  let cursor: string | undefined;
  let examined = 0;
  let fixed = 0;

  try {
    for (;;) {
      const threads = await prisma.emailThread.findMany({
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
        select: {
          id: true,
          subject: true,
          snippet: true,
          lastMessageAt: true,
          messages: {
            orderBy: { receivedAt: 'desc' },
            take: 1,
            select: {
              subject: true,
              bodyText: true,
              receivedAt: true,
            },
          },
        },
      });

      if (threads.length === 0) {
        break;
      }

      for (const thread of threads) {
        examined++;
        const newest = thread.messages[0];
        if (
          !newest ||
          thread.lastMessageAt?.getTime() === newest.receivedAt.getTime()
        ) {
          continue;
        }

        fixed++;
        console.log(
          `${apply ? 'Fixing' : 'Would fix'} thread ${thread.id}: lastMessageAt ${thread.lastMessageAt?.toISOString() ?? 'null'} -> ${newest.receivedAt.toISOString()}`,
        );

        if (apply) {
          await prisma.emailThread.update({
            where: { id: thread.id },
            data: {
              lastMessageAt: newest.receivedAt,
              subject: newest.subject ?? thread.subject,
              // The provider snippet isn't stored per message; the body's
              // opening is the closest equivalent.
              snippet: newest.bodyText?.slice(0, 200) ?? thread.snippet,
            },
          });
        }
      }

      cursor = threads[threads.length - 1].id;
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(
    `${examined} thread(s) examined, ${fixed} ${apply ? 'fixed' : 'would be fixed (re-run with --apply)'}.`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
