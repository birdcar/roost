export interface JsonSchemaOutput {
  type: string;
  description?: string;
  default?: unknown;
  required?: string[];
  properties?: Record<string, JsonSchemaOutput>;
  items?: JsonSchemaOutput;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
}

class SchemaBuilder<TOutput extends JsonSchemaOutput = JsonSchemaOutput> {
  protected _schema: TOutput;

  constructor(initial: TOutput) {
    this._schema = { ...initial };
  }

  description(text: string): this {
    const c = this.clone();
    c._schema.description = text;
    return c;
  }

  default(value: unknown): this {
    const c = this.clone();
    c._schema.default = value;
    return c;
  }

  build(): TOutput {
    return { ...this._schema };
  }

  protected clone(): this {
    const instance = Object.create(Object.getPrototypeOf(this)) as this;
    instance._schema = { ...this._schema };
    return instance;
  }
}

class StringSchemaBuilder extends SchemaBuilder<JsonSchemaOutput & { type: 'string' }> {
  constructor() { super({ type: 'string' }); }
  minLength(n: number): this { const c = this.clone(); c._schema.minLength = n; return c; }
  maxLength(n: number): this { const c = this.clone(); c._schema.maxLength = n; return c; }
}

class IntegerSchemaBuilder extends SchemaBuilder<JsonSchemaOutput & { type: 'integer' }> {
  constructor() { super({ type: 'integer' }); }
  min(n: number): this { const c = this.clone(); c._schema.minimum = n; return c; }
  max(n: number): this { const c = this.clone(); c._schema.maximum = n; return c; }
}

class NumberSchemaBuilder extends SchemaBuilder<JsonSchemaOutput & { type: 'number' }> {
  constructor() { super({ type: 'number' }); }
  min(n: number): this { const c = this.clone(); c._schema.minimum = n; return c; }
  max(n: number): this { const c = this.clone(); c._schema.maximum = n; return c; }
}

class BooleanSchemaBuilder extends SchemaBuilder<JsonSchemaOutput & { type: 'boolean' }> {
  constructor() { super({ type: 'boolean' }); }
}

class ObjectSchemaBuilder extends SchemaBuilder<JsonSchemaOutput & { type: 'object' }> {
  constructor() { super({ type: 'object', properties: {}, required: [] }); }

  property(name: string, propSchema: SchemaBuilder, required = false): this {
    const c = this.clone();
    c._schema.properties = { ...c._schema.properties, [name]: propSchema.build() };
    if (required) {
      c._schema.required = [...(c._schema.required ?? []), name];
    }
    return c;
  }
}

class ArraySchemaBuilder extends SchemaBuilder<JsonSchemaOutput & { type: 'array' }> {
  constructor() { super({ type: 'array' }); }
  items(itemSchema: SchemaBuilder): this { const c = this.clone(); c._schema.items = itemSchema.build(); return c; }
  minItems(n: number): this { const c = this.clone(); c._schema.minItems = n; return c; }
  maxItems(n: number): this { const c = this.clone(); c._schema.maxItems = n; return c; }
}

export const schema = {
  string: () => new StringSchemaBuilder(),
  integer: () => new IntegerSchemaBuilder(),
  number: () => new NumberSchemaBuilder(),
  boolean: () => new BooleanSchemaBuilder(),
  object: () => new ObjectSchemaBuilder(),
  array: () => new ArraySchemaBuilder(),
  enum: (values: unknown[]) => new SchemaBuilder({ type: 'string', enum: values }),
};

export { SchemaBuilder };
