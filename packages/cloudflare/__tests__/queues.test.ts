import { describe, test, expect } from 'bun:test';
import { QueueSender } from '../src/bindings/queues';

function createMockQueue<T>(): { queue: Queue<T>; messages: T[] } {
  const messages: T[] = [];

  const queue = {
    send(message: T) {
      messages.push(message);
      return Promise.resolve();
    },
    sendBatch(batch: Iterable<{ body: T }>) {
      for (const item of batch) {
        messages.push(item.body);
      }
      return Promise.resolve();
    },
  } as unknown as Queue<T>;

  return { queue, messages };
}

describe('QueueSender', () => {
  test('send enqueues a message', async () => {
    const { queue, messages } = createMockQueue<{ type: string }>();
    const sender = new QueueSender(queue);

    await sender.send({ type: 'welcome' });

    expect(messages).toEqual([{ type: 'welcome' }]);
  });

  test('sendBatch enqueues multiple messages', async () => {
    const { queue, messages } = createMockQueue<string>();
    const sender = new QueueSender(queue);

    await sender.sendBatch([
      { body: 'first' },
      { body: 'second' },
    ] as any);

    expect(messages).toEqual(['first', 'second']);
  });
});
