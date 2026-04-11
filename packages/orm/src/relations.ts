import type { Model } from './model.js';

export interface Relation {
  type: 'hasOne' | 'hasMany' | 'belongsTo' | 'belongsToMany';
  relatedModel: typeof Model;
  foreignKey: string;
  localKey: string;
}

export class HasManyRelation implements Relation {
  type = 'hasMany' as const;

  constructor(
    public relatedModel: typeof Model,
    public foreignKey: string,
    public localKey: string = 'id'
  ) {}

  async load(parent: Model): Promise<Model[]> {
    return this.relatedModel
      .where(this.foreignKey, parent.attributes[this.localKey])
      .all();
  }

  async loadMany(parents: Model[]): Promise<void> {
    const parentIds = parents.map((p) => p.attributes[this.localKey]);
    const related = await this.relatedModel.whereIn(this.foreignKey, parentIds).all();

    const grouped = new Map<unknown, Model[]>();
    for (const item of related) {
      const key = item.attributes[this.foreignKey];
      const existing = grouped.get(key) ?? [];
      existing.push(item);
      grouped.set(key, existing);
    }

    const propName = this.relatedModel.name.toLowerCase() + 's';
    for (const parent of parents) {
      const key = parent.attributes[this.localKey];
      (parent as any)[propName] = grouped.get(key) ?? [];
    }
  }
}

export class HasOneRelation implements Relation {
  type = 'hasOne' as const;

  constructor(
    public relatedModel: typeof Model,
    public foreignKey: string,
    public localKey: string = 'id'
  ) {}

  async load(parent: Model): Promise<Model | null> {
    return this.relatedModel
      .where(this.foreignKey, parent.attributes[this.localKey])
      .first();
  }

  async loadMany(parents: Model[]): Promise<void> {
    const parentIds = parents.map((p) => p.attributes[this.localKey]);
    const related = await this.relatedModel.whereIn(this.foreignKey, parentIds).all();

    const mapped = new Map<unknown, Model>();
    for (const item of related) {
      mapped.set(item.attributes[this.foreignKey], item);
    }

    const propName = this.relatedModel.name.toLowerCase();
    for (const parent of parents) {
      const key = parent.attributes[this.localKey];
      (parent as any)[propName] = mapped.get(key) ?? null;
    }
  }
}

export class BelongsToRelation implements Relation {
  type = 'belongsTo' as const;

  constructor(
    public relatedModel: typeof Model,
    public foreignKey: string,
    public localKey: string = 'id'
  ) {}

  async load(parent: Model): Promise<Model | null> {
    const foreignKeyValue = parent.attributes[this.foreignKey];
    if (!foreignKeyValue) return null;
    return this.relatedModel.find(foreignKeyValue);
  }

  async loadMany(parents: Model[]): Promise<void> {
    const foreignKeyValues = parents
      .map((p) => p.attributes[this.foreignKey])
      .filter((v) => v != null);

    if (foreignKeyValues.length === 0) return;

    const related = await this.relatedModel.whereIn(this.localKey, foreignKeyValues).all();

    const mapped = new Map<unknown, Model>();
    for (const item of related) {
      mapped.set(item.attributes[this.localKey], item);
    }

    const propName = this.relatedModel.name.toLowerCase();
    for (const parent of parents) {
      const key = parent.attributes[this.foreignKey];
      (parent as any)[propName] = mapped.get(key) ?? null;
    }
  }
}
