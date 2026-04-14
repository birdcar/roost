export interface FakeWorkflowRecord {
  id: string;
  params: unknown;
  createdAt: Date;
}

export class WorkflowFake {
  public created: FakeWorkflowRecord[] = [];

  recordCreate(id: string, params: unknown): void {
    this.created.push({ id, params, createdAt: new Date() });
  }

  assertCreated(id?: string): void {
    if (id) {
      const found = this.created.some((r) => r.id === id);
      if (!found) {
        throw new Error(
          `Expected workflow to be created with id "${id}", but it was not. Created: ${JSON.stringify(this.created.map((r) => r.id))}`
        );
      }
    } else {
      if (this.created.length === 0) {
        throw new Error('Expected at least one workflow to be created, but none were');
      }
    }
  }

  assertNotCreated(): void {
    if (this.created.length > 0) {
      throw new Error(
        `Expected no workflows to be created, but ${this.created.length} were created`
      );
    }
  }
}
