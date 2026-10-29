import { CommitmentService, dueDateOf, ownText } from './commitment.service';

describe('CommitmentService', () => {
  const now = new Date('2026-10-27T12:00:00Z');
  const sentAt = new Date('2026-10-27T08:35:00Z'); // 14:05 in Kolkata

  function pendingMessage(overrides: Record<string, unknown> = {}) {
    return {
      id: 'message-1',
      threadId: 'thread-1',
      subject: 'Deck',
      bodyText:
        "Hi Sam,\n\nI'll send the deck by Friday.\n\nOn Mon, Sam wrote:\n> Can you send it?",
      bodyHtml: null,
      receivedAt: sentAt,
      thread: {
        subject: 'Deck',
        account: {
          userId: 'user-1',
          user: { displayName: 'Kishor', timezone: 'Asia/Kolkata' },
        },
      },
      ...overrides,
    };
  }

  function buildDeps(
    options: {
      messages?: unknown[];
      claimCount?: number;
      existing?: { description: string }[];
      commitments?: unknown[];
      aiError?: Error;
    } = {},
  ) {
    const prisma = {
      emailMessage: {
        findMany: jest
          .fn()
          .mockResolvedValue(options.messages ?? [pendingMessage()]),
        updateMany: jest
          .fn()
          .mockResolvedValue({ count: options.claimCount ?? 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      task: {
        findMany: jest.fn().mockResolvedValue(options.existing ?? []),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const aiClientService = {
      commitments: options.aiError
        ? jest.fn().mockRejectedValue(options.aiError)
        : jest.fn().mockResolvedValue({
            commitments: options.commitments ?? [
              {
                text: 'Send the deck',
                dueDate: '2026-10-30',
                dueTime: null,
                confidence: 0.95,
              },
            ],
          }),
    };
    const service = new CommitmentService(
      prisma as never,
      aiClientService as never,
    );
    return { service, prisma, aiClientService };
  }

  const commitment = (text: string, confidence = 0.9) => ({
    text,
    dueDate: null,
    dueTime: null,
    confidence,
  });

  it('drops pending mail past the age limit before reading any', async () => {
    const { service, prisma } = buildDeps({ messages: [] });

    await service.scanPending(now);

    expect(prisma.emailMessage.updateMany).toHaveBeenCalledWith({
      where: {
        commitmentScanPending: true,
        receivedAt: { lt: new Date('2026-10-13T12:00:00Z') },
      },
      data: { commitmentScanPending: false },
    });
  });

  it("sends only the user's own words, with the sent time on their clock", async () => {
    const { service, aiClientService } = buildDeps();

    expect(await service.scanPending(now)).toBe(1);

    expect(aiClientService.commitments).toHaveBeenCalledWith({
      subject: 'Deck',
      senderName: 'Kishor',
      content: "Hi Sam,\n\nI'll send the deck by Friday.",
      sentAt: 'Tuesday 2026-10-27 14:05',
      sentDate: '2026-10-27',
      timezone: 'Asia/Kolkata',
    });
  });

  it('creates a COMMITMENT task due at the end of the working day', async () => {
    const { service, prisma } = buildDeps();

    await service.scanPending(now);

    expect(prisma.task.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        emailMessageId: 'message-1',
        threadId: 'thread-1',
        type: 'COMMITMENT',
        description: 'Send the deck',
        // 17:00 in Kolkata
        dueDate: new Date('2026-10-30T11:30:00Z'),
      },
    });
  });

  it('skips commitments below the confidence threshold', async () => {
    const { service, prisma } = buildDeps({
      commitments: [commitment('Catch up', 0.4)],
    });

    await service.scanPending(now);

    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('never duplicates a commitment the thread already has', async () => {
    const { service, prisma } = buildDeps({
      existing: [{ description: 'send the deck.' }],
      commitments: [
        commitment('Send the deck'),
        commitment('Send  the deck!'),
        commitment('Book the room'),
      ],
    });

    await service.scanPending(now);

    expect(prisma.task.create).toHaveBeenCalledTimes(1);
    expect(prisma.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: 'Book the room',
        dueDate: null,
      }) as unknown,
    });
  });

  it('leaves a message another scan already claimed', async () => {
    const { service, aiClientService } = buildDeps({ claimCount: 0 });

    expect(await service.scanPending(now)).toBe(0);
    expect(aiClientService.commitments).not.toHaveBeenCalled();
  });

  it('puts the message back and stops when the AI service fails', async () => {
    const { service, prisma, aiClientService } = buildDeps({
      messages: [pendingMessage(), pendingMessage({ id: 'message-2' })],
      aiError: new Error('429 quota'),
    });

    expect(await service.scanPending(now)).toBe(0);

    expect(aiClientService.commitments).toHaveBeenCalledTimes(1);
    expect(prisma.emailMessage.update).toHaveBeenCalledWith({
      where: { id: 'message-1' },
      data: { commitmentScanPending: true },
    });
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('skips the AI call for a message with no text of its own', async () => {
    const { service, aiClientService } = buildDeps({
      messages: [pendingMessage({ bodyText: '   ', bodyHtml: null })],
    });

    expect(await service.scanPending(now)).toBe(1);
    expect(aiClientService.commitments).not.toHaveBeenCalled();
  });
});

describe('ownText', () => {
  it('reads the HTML body when there is no text body', () => {
    expect(ownText(null, "<p>I'll call you <b>tomorrow</b>.</p>")).toBe(
      "I'll call you tomorrow.",
    );
  });
});

describe('dueDateOf', () => {
  const sentAt = new Date('2026-10-27T12:30:00Z'); // 18:00 in Kolkata

  it('is null without a due date', () => {
    expect(
      dueDateOf({ dueDate: null, dueTime: null }, sentAt, 'Asia/Kolkata'),
    ).toBeNull();
  });

  it("uses the named time on the user's clock", () => {
    expect(
      dueDateOf(
        { dueDate: '2026-10-28', dueTime: '10:00' },
        sentAt,
        'Asia/Kolkata',
      ),
    ).toEqual(new Date('2026-10-28T04:30:00Z'));
  });

  it('moves a same-day deadline that already passed to the end of that day', () => {
    expect(
      dueDateOf(
        { dueDate: '2026-10-27', dueTime: null },
        sentAt,
        'Asia/Kolkata',
      ),
    ).toEqual(new Date('2026-10-27T18:29:00Z'));
  });
});
