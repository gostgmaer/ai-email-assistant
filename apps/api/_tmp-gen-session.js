const { PrismaClient } = require('./dist/src/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

async function main() {
  const adapter = new PrismaPg('postgresql://postgres:postgres@127.0.0.1:5432/ai_email?schema=public');
  const prisma = new PrismaClient({ adapter });

  const email = `web-test-${Date.now()}@example.com`;
  const user = await prisma.user.create({
    data: { email, displayName: 'Web Test User', googleId: `web-test-${Date.now()}` },
  });

  const secret = '9d3f9d5b56b0b1ef8a6b1fd88e88e2df0c66fbc5cb87d84c5b1f0d92b1d4bbce4d2a0db7b8a1b3e5d3f4a9d8e7c6b5a4';
  const accessToken = jwt.sign({ sub: user.id, email: user.email }, secret, { expiresIn: '15m' });

  const refreshToken = crypto.randomBytes(48).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
  });

  // Also create a fake connected account + a synced thread/message so inbox/thread views have data.
  const account = await prisma.emailAccount.create({
    data: { userId: user.id, provider: 'IMAP', email: 'demo-inbox@example.com', isPrimary: true, syncStatus: 'IDLE' },
  });
  const folder = await prisma.mailFolder.create({
    data: { accountId: account.id, type: 'INBOX', name: 'Inbox', providerFolderId: 'INBOX' },
  });
  const thread = await prisma.emailThread.create({
    data: { folderId: folder.id, providerThreadId: 'demo-thread-1', subject: 'Welcome to your inbox', snippet: 'This is a demo message', lastMessageAt: new Date() },
  });
  await prisma.emailMessage.create({
    data: {
      threadId: thread.id,
      providerMessageId: 'demo-msg-1',
      from: [{ name: 'Demo Sender', address: 'sender@example.com' }],
      to: [{ address: user.email }],
      cc: [],
      bcc: [],
      subject: 'Welcome to your inbox',
      bodyText: 'Hello! This is a demo message body for browser testing.',
      bodyHtml: '<p>Hello! This is a <strong>demo</strong> message body for browser testing.</p>',
      receivedAt: new Date(),
      isRead: false,
    },
  });

  console.log(JSON.stringify({ userId: user.id, email, accessToken, refreshToken }));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
