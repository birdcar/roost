export class OrmNotBootedError extends Error {
  constructor(modelName: string) {
    super(
      `Model "${modelName}" has not been booted. ` +
      'Register OrmServiceProvider and call app.boot() before querying.'
    );
    this.name = 'OrmNotBootedError';
  }
}

export class ModelNotFoundError extends Error {
  constructor(modelName: string, id: unknown) {
    super(`${modelName} with ID ${id} not found.`);
    this.name = 'ModelNotFoundError';
  }
}

export class InvalidRelationError extends Error {
  constructor(modelName: string, relation: string) {
    super(`Relation "${relation}" is not defined on model "${modelName}".`);
    this.name = 'InvalidRelationError';
  }
}
