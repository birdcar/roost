export class QueueSender<T = unknown> {
  constructor(private queue: Queue<T>) {}

  async send(message: T, options?: QueueSendOptions): Promise<void> {
    await this.queue.send(message, options);
  }

  async sendBatch(messages: Iterable<MessageSendRequest<T>>): Promise<void> {
    await this.queue.sendBatch(messages);
  }
}
