import { describe, it, expect, spyOn } from 'bun:test';
import { GeminiProvider } from '../../src/providers/gemini';
import { Lab } from '../../src/enums';

describe('GeminiProvider', () => {
  it('declares chat capability', () => {
    const p = new GeminiProvider({ apiKey: 'key' });
    expect(p.capabilities().name).toBe(Lab.Gemini);
    expect(p.capabilities().supported.has('chat')).toBe(true);
  });

  it('sends system instruction separately and puts text in parts', async () => {
    const p = new GeminiProvider({ apiKey: 'key' });
    const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'hello' }] } }],
      }), { status: 200 }),
    );

    await p.chat({
      model: 'gemini-2.0-flash',
      messages: [
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'hi' },
      ],
    });

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1beta/models/gemini-2.0-flash:generateContent');
    expect(url).toContain('key=key');
    const body = JSON.parse(init.body as string);
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'be brief' }] });
    expect(body.contents[0]).toEqual({ role: 'user', parts: [{ text: 'hi' }] });
    spy.mockRestore();
  });

  it('parses functionCall parts into toolCalls', async () => {
    const p = new GeminiProvider({ apiKey: 'key' });
    const spy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [
              { text: 'using calc' },
              { functionCall: { name: 'Calculator', args: { x: 5 } } },
            ],
          },
        }],
      }), { status: 200 }),
    );

    const r = await p.chat({ model: 'gemini-2.0-flash', messages: [] });
    expect(r.text).toBe('using calc');
    expect(r.toolCalls).toHaveLength(1);
    expect(r.toolCalls[0].name).toBe('Calculator');
    expect(r.toolCalls[0].arguments).toEqual({ x: 5 });
    spy.mockRestore();
  });
});
