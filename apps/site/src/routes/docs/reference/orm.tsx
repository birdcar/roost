import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';

export const Route = createFileRoute('/docs/reference/orm')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/orm" subtitle="Laravel-inspired ORM built on Drizzle for D1 databases. Model classes, query builder, relationships, lifecycle hooks, migrations, factories, and seeders.">

      <h2>Installation</h2>
      <CodeBlock title="terminal">{`bun add @roost/orm`}</CodeBlock>

      <h2>Model API</h2>
      <p>
        Extend <code>Model</code> to define a database table mapping. All queries operate
        on the subclass statically. Results are instances of the subclass with attributes
        accessible via the <code>attributes</code> property.
      </p>

      <h3>Static Configuration Properties</h3>

      <h4><code>static tableName: string</code></h4>
      <p>The database table name. Required.</p>

      <h4><code>static primaryKey: string</code></h4>
      <p>The primary key column name. Defaults to <code>'id'</code>.</p>

      <h4><code>static timestamps: boolean</code></h4>
      <p>
        When <code>true</code>, automatically writes <code>created_at</code> on insert and
        <code>updated_at</code> on update. Defaults to <code>true</code>.
      </p>

      <h4><code>static softDeletes: boolean</code></h4>
      <p>
        When <code>true</code>, <code>delete()</code> sets <code>deleted_at</code> instead of
        removing the row. All queries automatically exclude soft-deleted records.
        Defaults to <code>false</code>.
      </p>

      <h3>Static Query Methods</h3>

      <h4><code>static async find(id: unknown): Promise&lt;T | null&gt;</code></h4>
      <p>Find a record by primary key. Returns <code>null</code> if not found.</p>

      <h4><code>static async findOrFail(id: unknown): Promise&lt;T&gt;</code></h4>
      <p>Find a record by primary key. Throws <code>ModelNotFoundError</code> if not found.</p>

      <h4><code>static async all(): Promise&lt;T[]&gt;</code></h4>
      <p>Retrieve all records from the table. Returns a <code>QueryBuilder</code> for chaining.</p>

      <h4><code>static async create(attributes: Record&lt;string, unknown&gt;): Promise&lt;T&gt;</code></h4>
      <p>Insert a new record and return the created model instance. Fires <code>creating</code> and <code>created</code> hooks.</p>

      <h4><code>static where(column: string, value: unknown): QueryBuilder&lt;T&gt;</code></h4>
      <h4><code>static where(column: string, op: Operator, value: unknown): QueryBuilder&lt;T&gt;</code></h4>
      <p>Begin a query with a WHERE constraint. Returns a <code>QueryBuilder</code>.</p>

      <h4><code>static on(event: LifecycleEvent, callback: (model: T) =&gt; boolean | void): void</code></h4>
      <p>Register a lifecycle hook callback. Return <code>false</code> from a pre-event hook to abort the operation.</p>

      <h3>Instance Methods</h3>

      <h4><code>async save(): Promise&lt;void&gt;</code></h4>
      <p>Persist changes to <code>this.attributes</code>. Fires <code>updating</code> and <code>updated</code> hooks.</p>

      <h4><code>async delete(): Promise&lt;void&gt;</code></h4>
      <p>Delete the record (or soft-delete if <code>softDeletes = true</code>). Fires <code>deleting</code> and <code>deleted</code> hooks.</p>

      <h4><code>attributes: Record&lt;string, unknown&gt;</code></h4>
      <p>The raw column values for this record. Mutate these before calling <code>save()</code>.</p>

      <h2>QueryBuilder API</h2>
      <p>
        All static model query methods return a <code>QueryBuilder</code> that is chainable.
        The query is not executed until a terminal method is called.
      </p>

      <h4><code>where(column: string, value: unknown): this</code></h4>
      <h4><code>where(column: string, op: Operator, value: unknown): this</code></h4>
      <p>Add an AND WHERE clause. Supported operators: <code>=</code>, <code>!=</code>, <code>&gt;</code>, <code>&lt;</code>, <code>&gt;=</code>, <code>&lt;=</code>, <code>like</code>.</p>

      <h4><code>orWhere(column: string, value: unknown): this</code></h4>
      <p>Add an OR WHERE clause.</p>

      <h4><code>whereIn(column: string, values: unknown[]): this</code></h4>
      <p>Add a WHERE IN clause.</p>

      <h4><code>whereNull(column: string): this</code></h4>
      <p>Add a WHERE IS NULL clause.</p>

      <h4><code>whereNotNull(column: string): this</code></h4>
      <p>Add a WHERE IS NOT NULL clause.</p>

      <h4><code>orderBy(column: string, direction: 'asc' | 'desc'): this</code></h4>
      <p>Add an ORDER BY clause. Chainable for multiple sort columns.</p>

      <h4><code>limit(n: number): this</code></h4>
      <p>Limit the number of results.</p>

      <h4><code>offset(n: number): this</code></h4>
      <p>Skip the first <code>n</code> results.</p>

      <h4><code>first(): Promise&lt;T | null&gt;</code></h4>
      <p>Execute the query and return the first result, or <code>null</code>.</p>

      <h4><code>firstOrFail(): Promise&lt;T&gt;</code></h4>
      <p>Execute the query and return the first result. Throws <code>ModelNotFoundError</code> if no result.</p>

      <h4><code>all(): Promise&lt;T[]&gt;</code></h4>
      <p>Execute the query and return all matching records.</p>

      <h4><code>count(): Promise&lt;number&gt;</code></h4>
      <p>Execute a COUNT query and return the number of matching records.</p>

      <h4><code>paginate(page: number, perPage: number): Promise&lt;PaginationResult&lt;T&gt;&gt;</code></h4>
      <p>
        Execute the query with pagination. Returns a <code>PaginationResult</code> with
        <code>data</code>, <code>total</code>, <code>perPage</code>, <code>currentPage</code>,
        and <code>lastPage</code>.
      </p>

      <h2>Relationships</h2>
      <p>
        Define relationships as static calls during class definition. All relationships are lazy-loaded:
        call the method on an instance to fetch the related records.
      </p>

      <h4><code>static hasOne(RelatedModel: typeof Model, foreignKey: string, localKey: string): void</code></h4>
      <p>
        One-to-one ownership: this model has one related record. Adds an instance method named
        after the related model (camelCased) that returns <code>Promise&lt;RelatedModel | null&gt;</code>.
      </p>

      <h4><code>static hasMany(RelatedModel: typeof Model, foreignKey: string, localKey: string): void</code></h4>
      <p>
        One-to-many ownership. Adds an instance method that returns <code>Promise&lt;RelatedModel[]&gt;</code>.
      </p>

      <h4><code>static belongsTo(RelatedModel: typeof Model, foreignKey: string, ownerKey: string): void</code></h4>
      <p>
        Inverse of <code>hasOne</code> or <code>hasMany</code>. Adds an instance method that
        returns <code>Promise&lt;RelatedModel | null&gt;</code>.
      </p>

      <h4><code>static belongsToMany(RelatedModel: typeof Model, pivotTable: string, foreignKey: string, localKey: string, relatedKey: string, relatedModelKey: string): void</code></h4>
      <p>
        Many-to-many via a pivot table. Adds an instance method that returns
        <code>Promise&lt;RelatedModel[]&gt;</code>.
      </p>

      <h2>Lifecycle Hooks</h2>
      <p>Hooks fire in the order they are registered. Pre-event hooks abort the operation if any returns <code>false</code>.</p>

      <CodeBlock>{`// Pre-event hooks (can abort by returning false)
Model.on('creating', (instance) => { ... });
Model.on('updating', (instance) => { ... });
Model.on('deleting', (instance) => { ... });

// Post-event hooks
Model.on('created', (instance) => { ... });
Model.on('updated', (instance) => { ... });
Model.on('deleted', (instance) => { ... });`}</CodeBlock>

      <h2>Factory API</h2>
      <p>
        <code>Factory</code> generates model instances with fake data for seeding and testing.
      </p>

      <h4><code>abstract define(): Record&lt;string, unknown&gt;</code></h4>
      <p>Return the default attribute map. Called once per instance.</p>

      <h4><code>async create(overrides?: Record&lt;string, unknown&gt;): Promise&lt;T&gt;</code></h4>
      <p>Create and persist a model instance. Merges <code>overrides</code> over the defined defaults.</p>

      <h4><code>make(overrides?: Record&lt;string, unknown&gt;): T</code></h4>
      <p>Build an unsaved model instance without persisting.</p>

      <h2>Seeder API</h2>

      <h4><code>abstract async run(): Promise&lt;void&gt;</code></h4>
      <p>Implement to seed the database. Called by <code>roost db:seed</code>.</p>

      <h2>Types</h2>
      <CodeBlock>{`type Operator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'like';
type LifecycleEvent = 'creating' | 'created' | 'updating' | 'updated' | 'deleting' | 'deleted';

interface PaginationResult<T> {
  data: T[];
  total: number;
  perPage: number;
  currentPage: number;
  lastPage: number;
}`}</CodeBlock>

      <h2>Errors</h2>

      <h4><code>ModelNotFoundError</code></h4>
      <p>Thrown by <code>findOrFail()</code> and <code>firstOrFail()</code> when no record matches.</p>

    </DocLayout>
  );
}
