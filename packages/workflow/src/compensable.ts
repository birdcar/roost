type CompensationFn = () => Promise<void> | void;

export class Compensable {
  private compensations: CompensationFn[] = [];

  register(compensation: CompensationFn): void {
    this.compensations.push(compensation);
  }

  async compensate(): Promise<void> {
    const toRun = [...this.compensations].reverse();
    this.compensations = [];
    for (const fn of toRun) {
      try {
        await fn();
      } catch {
        // best-effort; log but continue
      }
    }
  }
}
