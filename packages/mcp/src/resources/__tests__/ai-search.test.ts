import { describe, test, expect, mock } from 'bun:test';
import { AiSearchResource } from '../ai-search.js';
import { createMcpRequest } from '../../request.js';

function makeBinding(result?: Record<string, unknown>, throws?: Error) {
  return {
    run: mock(async (req: Record<string, unknown>) => {
      if (throws) throw throws;
      return result ?? { answer: 'Test answer', sources: [] };
    }),
  };
}

describe('AiSearchResource', () => {
  test('uri() returns aisearch://{instanceName}', () => {
    const resource = new AiSearchResource(makeBinding(), 'my-index');
    expect(resource.uri()).toBe('aisearch://my-index');
  });

  test('mimeType() returns application/json', () => {
    const resource = new AiSearchResource(makeBinding(), 'my-index');
    expect(resource.mimeType()).toBe('application/json');
  });

  test('handle() returns error when query param is missing', async () => {
    const resource = new AiSearchResource(makeBinding(), 'my-index');
    const request = createMcpRequest({});

    const response = await resource.handle(request);
    const json = response.toJSON();

    expect(json.content[0].isError).toBe(true);
    expect(json.content[0].text).toBe('query is required');
  });

  test('handle() returns error when query param is empty string', async () => {
    const resource = new AiSearchResource(makeBinding(), 'my-index');
    const request = createMcpRequest({ query: '' });

    const response = await resource.handle(request);
    const json = response.toJSON();

    expect(json.content[0].isError).toBe(true);
    expect(json.content[0].text).toBe('query is required');
  });

  test('handle() calls binding with query and no filters when only query provided', async () => {
    const binding = makeBinding();
    const resource = new AiSearchResource(binding, 'my-index');
    const request = createMcpRequest({ query: 'how does RAG work' });

    await resource.handle(request);

    const calls = (binding.run as ReturnType<typeof mock>).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toEqual({ query: 'how does RAG work' });
  });

  test('handle() forwards metadataFilters to binding when present', async () => {
    const binding = makeBinding();
    const resource = new AiSearchResource(binding, 'my-index');
    const request = createMcpRequest({
      query: 'test',
      metadataFilters: { category: 'docs' },
    });

    await resource.handle(request);

    const calls = (binding.run as ReturnType<typeof mock>).mock.calls;
    expect(calls[0][0]).toMatchObject({ metadata_filters: { category: 'docs' } });
  });

  test('handle() forwards pathFilters to binding when present', async () => {
    const binding = makeBinding();
    const resource = new AiSearchResource(binding, 'my-index');
    const request = createMcpRequest({
      query: 'test',
      pathFilters: ['/docs/'],
    });

    await resource.handle(request);

    const calls = (binding.run as ReturnType<typeof mock>).mock.calls;
    expect(calls[0][0]).toMatchObject({ path_filters: ['/docs/'] });
  });

  test('handle() returns McpResponse.structured() with answer and sources on success', async () => {
    const binding = makeBinding({
      answer: 'RAG stands for Retrieval-Augmented Generation',
      sources: [{ url: 'https://example.com', title: 'RAG Overview' }],
    });
    const resource = new AiSearchResource(binding, 'my-index');
    const request = createMcpRequest({ query: 'what is RAG' });

    const response = await resource.handle(request);
    const json = response.toJSON();

    expect(json.content[0].type).toBe('structured');
    expect(json.content[0].structuredContent?.['answer']).toBe('RAG stands for Retrieval-Augmented Generation');
    expect(json.content[0].structuredContent?.['sources']).toHaveLength(1);
  });

  test('handle() returns McpResponse.error() when binding throws', async () => {
    const binding = makeBinding(undefined, new Error('AI Search unavailable'));
    const resource = new AiSearchResource(binding, 'my-index');
    const request = createMcpRequest({ query: 'test query' });

    const response = await resource.handle(request);
    const json = response.toJSON();

    expect(json.content[0].isError).toBe(true);
    expect(json.content[0].text).toBe('AI Search unavailable');
  });
});
