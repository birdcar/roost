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

export class TenantNotResolvedError extends Error {
  constructor(slug: string) {
    super(`Tenant "${slug}" could not be resolved to an organization.`);
    this.name = 'TenantNotResolvedError';
  }
}

export class TenantBindingNotFoundError extends Error {
  constructor(bindingName: string) {
    super(
      `No D1 binding found for "${bindingName}". ` +
      'Add it to wrangler.jsonc [[d1_databases]] or fall back to shared DB.'
    );
    this.name = 'TenantBindingNotFoundError';
  }
}
