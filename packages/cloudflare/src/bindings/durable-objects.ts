export class DurableObjectClient {
  constructor(private namespace: DurableObjectNamespace) {}

  get(id: DurableObjectId): DurableObjectStub;
  get(name: string): DurableObjectStub;
  get(idOrName: DurableObjectId | string): DurableObjectStub {
    if (typeof idOrName === 'string') {
      const id = this.namespace.idFromName(idOrName);
      return this.namespace.get(id);
    }
    return this.namespace.get(idOrName);
  }

  idFromName(name: string): DurableObjectId {
    return this.namespace.idFromName(name);
  }

  idFromString(hex: string): DurableObjectId {
    return this.namespace.idFromString(hex);
  }

  newUniqueId(): DurableObjectId {
    return this.namespace.newUniqueId();
  }
}
