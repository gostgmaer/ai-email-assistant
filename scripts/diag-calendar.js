const { PrismaClient } = require('/repo/dist/generated/prisma/client.js');
const { PrismaPg } = require('@prisma/adapter-pg');
const { createDecipheriv } = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function decrypt(payload, key) {
  const buffer = Buffer.from(payload, 'base64');
  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

async function main() {
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const accounts = await prisma.calendarAccount.findMany({
    include: { credential: true },
  });

  for (const acc of accounts) {
    console.log('---');
    console.log('CalendarAccount', {
      id: acc.id,
      email: acc.email,
      provider: acc.provider,
      isPrimary: acc.isPrimary,
      userId: acc.userId,
    });
    if (!acc.credential?.accessToken) {
      console.log('  no access token stored');
      continue;
    }
    const accessToken = decrypt(acc.credential.accessToken, key);

    const listRes = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?' +
        new URLSearchParams({
          timeMin: '2026-08-08T00:00:00Z',
          timeMax: '2026-08-11T23:59:59Z',
          singleEvents: 'true',
        }),
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const listBody = await listRes.json();
    console.log(`  events on PRIMARY calendar for ${acc.email} between Aug 8-11 2026 (status ${listRes.status}):`);
    if (Array.isArray(listBody.items)) {
      for (const ev of listBody.items) {
        console.log('   -', {
          id: ev.id,
          status: ev.status,
          summary: ev.summary,
          start: ev.start,
          end: ev.end,
          organizer: ev.organizer,
          creator: ev.creator,
          htmlLink: ev.htmlLink,
          visibility: ev.visibility,
        });
      }
    } else {
      console.log('   ', JSON.stringify(listBody));
    }

    // also list the user's calendarList to see which calendars exist / are hidden
    const calListRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const calListBody = await calListRes.json();
    console.log(`  calendarList (status ${calListRes.status}):`);
    if (Array.isArray(calListBody.items)) {
      for (const c of calListBody.items) {
        console.log('   -', { id: c.id, summary: c.summary, primary: c.primary, selected: c.selected, hidden: c.hidden });
      }
    } else {
      console.log('   ', JSON.stringify(calListBody));
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
