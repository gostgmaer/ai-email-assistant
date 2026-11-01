/**
 * "Ask your inbox" evaluation (docs/ai-features-implementation-plan.md,
 * Phase 1e). Seeds a made-up mailbox under a throwaway user, runs the real
 * search + answer code against the AI service, and reports correct answers,
 * correct citations and correct "not found". The throwaway user is removed
 * afterwards, whatever happens. Exits non-zero below the dataset's passRate.
 *
 * Run it before and after changing the answer prompt or retrieval.
 *
 * Usage (from apps/api, with Postgres and the AI service running):
 *   npm run ask:eval
 *   ASK_EVAL_DELAY_MS=3000 npm run ask:eval   # gentler on the LLM quota
 *
 * Uses DATABASE_URL, AI_SERVICE_URL and AI_SERVICE_API_KEY from apps/api/.env
 * or the environment. AI_SERVICE_URL may need to be http://localhost:8000.
 */
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

import { Prisma, PrismaClient } from '../src/generated/prisma/client';
import { AiClientService } from '../src/modules/ai/services/ai-client.service';
import { AskService } from '../src/modules/ask/services/ask.service';
import { EmailSearchService } from '../src/modules/ask/services/email-search.service';
import { buildEmailChunks } from '../src/modules/ask/utils/email-chunks.util';

dotenv.config({ path: resolve(__dirname, '../.env'), quiet: true });

interface EvalEmail {
  id: string;
  from: string;
  subject: string;
  date: string;
  body: string;
}

interface EvalCase {
  id: string;
  question: string;
  /** false: the mailbox doesn't answer it. Default true. */
  foundExpected?: boolean;
  /** Every inner list must have one entry in the answer. */
  answerContains?: string[][];
  answerExcludes?: string[];
  sources?: string[];
}

interface EvalDataset {
  passRate: number;
  emails: EvalEmail[];
  cases: EvalCase[];
}

interface CaseResult {
  id: string;
  passed: boolean;
  answerCorrect: boolean;
  citationsCorrect: boolean;
  foundCorrect: boolean;
  answer: string;
  cited: string[];
}

const EMBED_BATCH = 20;
const OWNER_ADDRESS = 'owner@ask-eval.invalid';

function parseFrom(from: string): { name: string; address: string } {
  const match = /^(.*) <(.+)>$/.exec(from);
  return match
    ? { name: match[1], address: match[2] }
    : { name: from, address: from };
}

async function seed(
  prisma: PrismaClient,
  ai: AiClientService,
  emails: EvalEmail[],
): Promise<{ userId: string; subjectToId: Map<string, string> }> {
  const user = await prisma.user.create({
    data: {
      email: `ask-eval-${randomUUID()}@ask-eval.invalid`,
      displayName: 'Ask Eval',
    },
  });
  const account = await prisma.emailAccount.create({
    data: {
      userId: user.id,
      provider: 'IMAP',
      email: OWNER_ADDRESS,
      syncEnabled: false,
      members: { create: { userId: user.id, role: 'OWNER' } },
    },
  });
  const folder = await prisma.mailFolder.create({
    data: { accountId: account.id, name: 'Inbox', type: 'INBOX' },
  });

  const chunks: {
    messageId: string;
    chunkIndex: number;
    content: string;
  }[] = [];
  const subjectToId = new Map<string, string>();
  for (const email of emails) {
    const receivedAt = new Date(email.date);
    const from = [parseFrom(email.from)];
    const to = [{ address: OWNER_ADDRESS }];
    const thread = await prisma.emailThread.create({
      data: {
        accountId: account.id,
        folderId: folder.id,
        providerThreadId: `eval-${email.id}`,
        subject: email.subject,
        lastMessageAt: receivedAt,
      },
    });
    const message = await prisma.emailMessage.create({
      data: {
        threadId: thread.id,
        providerMessageId: `eval-${email.id}`,
        from,
        to,
        subject: email.subject,
        bodyText: email.body,
        receivedAt,
        // The index scan must leave these alone.
        searchIndexedAt: new Date(),
      },
    });
    subjectToId.set(email.subject, email.id);
    buildEmailChunks({
      subject: email.subject,
      from,
      to,
      receivedAt,
      bodyText: email.body,
      bodyHtml: null,
    }).forEach((content, chunkIndex) =>
      chunks.push({ messageId: message.id, chunkIndex, content }),
    );
  }

  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH);
    const { embeddings, model } = await ai.embedBatch(
      batch.map((chunk) => chunk.content),
    );
    const rows = batch.map(
      (chunk, index) => Prisma.sql`(
        ${randomUUID()}, ${chunk.messageId}, ${account.id},
        ${chunk.chunkIndex}, ${chunk.content},
        ${`[${embeddings[index].join(',')}]`}::vector, ${model}, now()
      )`,
    );
    await prisma.$executeRaw`
      INSERT INTO "EmailChunk"
        ("id", "messageId", "accountId", "chunkIndex", "content",
         "embedding", "embeddingModel", "createdAt")
      VALUES ${Prisma.join(rows)}
    `;
  }

  return { userId: user.id, subjectToId };
}

function score(
  evalCase: EvalCase,
  result: { answer: string; found: boolean; cited: string[] },
): CaseResult {
  const expectFound = evalCase.foundExpected !== false;
  const answer = result.answer.toLowerCase();

  const foundCorrect = result.found === expectFound;
  const answerCorrect =
    (evalCase.answerContains ?? []).every((anyOf) =>
      anyOf.some((text) => answer.includes(text.toLowerCase())),
    ) &&
    (evalCase.answerExcludes ?? []).every(
      (text) => !answer.includes(text.toLowerCase()),
    );
  const citationsCorrect = expectFound
    ? (evalCase.sources ?? []).every((id) => result.cited.includes(id))
    : result.cited.length === 0;

  return {
    id: evalCase.id,
    passed: foundCorrect && answerCorrect && citationsCorrect,
    answerCorrect,
    citationsCorrect,
    foundCorrect,
    answer: result.answer,
    cited: result.cited,
  };
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set (apps/api/.env)');
  }
  const dataset = JSON.parse(
    readFileSync(resolve(__dirname, 'ask-eval.dataset.json'), 'utf8'),
  ) as EvalDataset;
  const delayMs = Number(process.env.ASK_EVAL_DELAY_MS ?? 0);

  const prisma = new PrismaClient({ adapter: new PrismaPg(connectionString) });
  const ai = new AiClientService(new ConfigService());
  const search = new EmailSearchService(prisma as never, ai);
  const ask = new AskService(prisma as never, search, ai);

  let userId: string | undefined;
  const results: CaseResult[] = [];
  try {
    const seeded = await seed(prisma, ai, dataset.emails);
    userId = seeded.userId;

    for (const evalCase of dataset.cases) {
      try {
        const answer = await ask.ask(seeded.userId, evalCase.question);
        const cited = answer.sources.map(
          (source) =>
            seeded.subjectToId.get(source.subject ?? '') ?? '(unknown)',
        );
        results.push(
          score(evalCase, { answer: answer.answer, found: answer.found, cited }),
        );
      } catch (error) {
        results.push({
          id: evalCase.id,
          passed: false,
          answerCorrect: false,
          citationsCorrect: false,
          foundCorrect: false,
          answer: `ERROR: ${error instanceof Error ? error.message : String(error)}`,
          cited: [],
        });
      }
      const last = results[results.length - 1];
      console.log(`${last.passed ? 'PASS' : 'FAIL'}  ${last.id}`);
      if (!last.passed) {
        console.log(`      answer: ${last.answer.replace(/\s+/g, ' ')}`);
        console.log(
          `      answer ok: ${last.answerCorrect}, citations ok: ${last.citationsCorrect} [${last.cited.join(', ')}], found ok: ${last.foundCorrect}`,
        );
      }
      if (delayMs) {
        await new Promise((done) => setTimeout(done, delayMs));
      }
    }
  } finally {
    if (userId) {
      // Cascades to the account, its mail and its chunks.
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma.$disconnect();
  }

  const count = (test: (result: CaseResult) => boolean) =>
    results.filter(test).length;
  const notFoundCases = dataset.cases.filter(
    (evalCase) => evalCase.foundExpected === false,
  );
  const passRate = count((r) => r.passed) / results.length;

  console.log('');
  console.log(`Passed:           ${count((r) => r.passed)}/${results.length}`);
  console.log(`Answer correct:   ${count((r) => r.answerCorrect)}/${results.length}`);
  console.log(`Citations right:  ${count((r) => r.citationsCorrect)}/${results.length}`);
  console.log(
    `"Not found" right: ${
      results.filter(
        (r) => r.foundCorrect && notFoundCases.some((c) => c.id === r.id),
      ).length
    }/${notFoundCases.length}`,
  );
  console.log(
    `Pass rate ${(passRate * 100).toFixed(0)}% (needs ${(dataset.passRate * 100).toFixed(0)}%)`,
  );

  if (passRate < dataset.passRate) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
