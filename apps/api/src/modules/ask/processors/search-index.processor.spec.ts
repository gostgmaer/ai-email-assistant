import { BadGatewayException, HttpException, HttpStatus } from '@nestjs/common';
import { Job } from 'bullmq';

import { SearchIndexProcessor } from './search-index.processor';

describe('SearchIndexProcessor', () => {
  function build(results: (number | Error)[]) {
    const indexPending = jest.fn();
    for (const result of results) {
      if (result instanceof Error) {
        indexPending.mockRejectedValueOnce(result);
      } else {
        indexPending.mockResolvedValueOnce(result);
      }
    }
    const processor = new SearchIndexProcessor({ indexPending } as never);
    return { processor, indexPending };
  }

  const scan = { name: 'search-index-scan' } as Job;

  it('keeps indexing batches until it has caught up', async () => {
    const { processor, indexPending } = build([50, 50, 12, 0]);

    await processor.process(scan);

    expect(indexPending).toHaveBeenCalledTimes(4);
  });

  it('stops quietly at the provider rate limit, leaving the rest for the next scan', async () => {
    const { processor, indexPending } = build([
      50,
      new HttpException('rate limited', HttpStatus.TOO_MANY_REQUESTS),
    ]);

    await expect(processor.process(scan)).resolves.toBeUndefined();
    expect(indexPending).toHaveBeenCalledTimes(2);
  });

  it('fails the job on any other error, so BullMQ retries it', async () => {
    const { processor } = build([new BadGatewayException('AI service down')]);

    await expect(processor.process(scan)).rejects.toThrow('AI service down');
  });

  it('ignores jobs it does not know', async () => {
    const { processor, indexPending } = build([]);

    await processor.process({ name: 'something-else' } as Job);

    expect(indexPending).not.toHaveBeenCalled();
  });
});
