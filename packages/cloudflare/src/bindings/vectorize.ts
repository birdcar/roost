export class VectorStore {
  constructor(private index: VectorizeIndex) {}

  async insert(vectors: VectorizeVector[]): Promise<VectorizeVectorMutation> {
    return this.index.insert(vectors);
  }

  async query(
    vector: number[] | Float32Array | Float64Array,
    options?: VectorizeQueryOptions
  ): Promise<VectorizeMatches> {
    return this.index.query(vector, options);
  }

  async getByIds(ids: string[]): Promise<VectorizeVector[]> {
    return this.index.getByIds(ids);
  }

  async deleteByIds(ids: string[]): Promise<VectorizeVectorMutation> {
    return this.index.deleteByIds(ids);
  }
}
