/**
 * RAG retrieval evaluation harness.
 *
 * Runs a golden query set against the live GET /documents/search endpoint
 * (the same code path a real client hits, including MMR re-ranking) and
 * reports Recall@K, MRR, and Precision@K. Purely a retrieval-quality check —
 * it says nothing about the generation step downstream.
 *
 * Usage:
 *   RAG_EVAL_USER_ID=<uuid> RAG_EVAL_USER_EMAIL=<email> npm run rag:eval
 *
 * Env vars:
 *   RAG_EVAL_USER_ID     (required) — id of the user whose documents the
 *                        dataset's expectedFilenames refer to. Search is
 *                        scoped per-user, so this must match the account
 *                        that owns the corpus being evaluated.
 *   RAG_EVAL_USER_EMAIL  (required) — email for the same user.
 *   API_BASE_URL         (default http://localhost:3000)
 *   JWT_SECRET           (default: read from apps/api/.env) — used to mint
 *                        a short-lived dev token; never touches the DB.
 *   RAG_EVAL_DATASET     (default: scripts/rag-eval.dataset.json)
 */
import { createHmac } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import * as dotenv from 'dotenv';

dotenv.config({ path: resolve(__dirname, '../.env'), quiet: true });

interface EvalCase {
  id: string;
  query: string;
  expectedFilenames: string[];
  notes?: string;
}

interface EvalDataset {
  description: string;
  k: number;
  cases: EvalCase[];
}

interface SearchMatch {
  filename: string;
  distance: number;
  documentId: string;
}

interface CaseResult {
  id: string;
  query: string;
  hit: boolean;
  reciprocalRank: number;
  precisionAtK: number;
  latencyMs: number;
  topMatches: SearchMatch[];
}

function signDevJwt(
  payload: Record<string, unknown>,
  secret: string,
  expiresInSeconds: number,
): string {
  const base64url = (obj: object): string =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { ...payload, iat: now, exp: now + expiresInSeconds };
  const unsigned = `${base64url(header)}.${base64url(body)}`;
  const signature = createHmac('sha256', secret)
    .update(unsigned)
    .digest('base64url');
  return `${unsigned}.${signature}`;
}

async function runCase(
  baseUrl: string,
  token: string,
  k: number,
  evalCase: EvalCase,
): Promise<CaseResult> {
  const params = new URLSearchParams({
    q: evalCase.query,
    limit: String(k),
  });

  const start = Date.now();
  const response = await fetch(`${baseUrl}/documents/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const latencyMs = Date.now() - start;

  if (!response.ok) {
    throw new Error(
      `Search failed for case "${evalCase.id}": HTTP ${response.status} ${await response.text()}`,
    );
  }

  const matches = (await response.json()) as SearchMatch[];
  const expected = new Set(evalCase.expectedFilenames);

  let firstHitRank = -1;
  let hitCount = 0;
  matches.forEach((match, index) => {
    if (expected.has(match.filename)) {
      hitCount += 1;
      if (firstHitRank === -1) firstHitRank = index + 1;
    }
  });

  return {
    id: evalCase.id,
    query: evalCase.query,
    hit: firstHitRank !== -1,
    reciprocalRank: firstHitRank === -1 ? 0 : 1 / firstHitRank,
    precisionAtK: matches.length === 0 ? 0 : hitCount / matches.length,
    latencyMs,
    topMatches: matches.map((m) => ({
      filename: m.filename,
      distance: m.distance,
      documentId: m.documentId,
    })),
  };
}

async function main(): Promise<void> {
  const userId = process.env.RAG_EVAL_USER_ID;
  const userEmail = process.env.RAG_EVAL_USER_EMAIL;
  if (!userId || !userEmail) {
    console.error(
      'RAG_EVAL_USER_ID and RAG_EVAL_USER_EMAIL are required — search is ' +
        "scoped per-user, and must match whoever owns the dataset's documents.",
    );
    process.exitCode = 1;
    return;
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error('JWT_SECRET is not set (checked apps/api/.env).');
    process.exitCode = 1;
    return;
  }

  const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:3000';
  const datasetPath = resolve(
    __dirname,
    process.env.RAG_EVAL_DATASET ?? 'rag-eval.dataset.json',
  );
  const dataset = JSON.parse(readFileSync(datasetPath, 'utf-8')) as EvalDataset;

  const token = signDevJwt({ sub: userId, email: userEmail }, jwtSecret, 300);

  const results: CaseResult[] = [];
  for (const evalCase of dataset.cases) {
    results.push(await runCase(baseUrl, token, dataset.k, evalCase));
  }

  const recallAtK = results.filter((r) => r.hit).length / results.length;
  const mrr =
    results.reduce((sum, r) => sum + r.reciprocalRank, 0) / results.length;
  const meanPrecisionAtK =
    results.reduce((sum, r) => sum + r.precisionAtK, 0) / results.length;
  const meanLatencyMs =
    results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length;

  console.log(
    `\nRAG retrieval eval — ${dataset.cases.length} cases, K=${dataset.k}\n`,
  );
  for (const r of results) {
    const status = r.hit ? 'HIT ' : 'MISS';
    console.log(
      `[${status}] ${r.id.padEnd(20)} rank=${r.reciprocalRank === 0 ? '-' : (1 / r.reciprocalRank).toFixed(0)} ` +
        `precision@K=${r.precisionAtK.toFixed(2)} latency=${r.latencyMs}ms`,
    );
    console.log(`         query: ${r.query}`);
    console.log(
      `         top matches: ${r.topMatches.map((m) => `${m.filename} (d=${m.distance.toFixed(3)})`).join(', ') || '(none)'}`,
    );
  }

  console.log('\n--- summary ---');
  console.log(`Recall@${dataset.k}:        ${(recallAtK * 100).toFixed(1)}%`);
  console.log(`MRR:               ${mrr.toFixed(3)}`);
  console.log(
    `Mean Precision@${dataset.k}: ${(meanPrecisionAtK * 100).toFixed(1)}%`,
  );
  console.log(`Mean latency:      ${meanLatencyMs.toFixed(0)}ms`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
