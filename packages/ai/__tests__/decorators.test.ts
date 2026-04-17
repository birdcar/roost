import { describe, it, expect } from 'bun:test';
import {
  Provider, Model, MaxSteps, MaxTokens, Temperature, Timeout,
  UseCheapestModel, UseSmartestModel, getAgentConfig,
} from '../src/decorators';
import { Lab } from '../src/enums';
import { resolveModel } from '../src/capability-table';

describe('decorators', () => {
  it('stores @Model on target', () => {
    @Model('claude-opus-4-7')
    class A {}
    expect(getAgentConfig(A).model).toBe('claude-opus-4-7');
  });

  it('stores @Provider with single provider', () => {
    @Provider(Lab.Anthropic)
    class A {}
    expect(getAgentConfig(A).provider).toBe(Lab.Anthropic);
  });

  it('stores @Provider with array for failover', () => {
    @Provider([Lab.OpenAI, Lab.Anthropic])
    class A {}
    expect(getAgentConfig(A).provider).toEqual([Lab.OpenAI, Lab.Anthropic]);
  });

  it('stores all numeric decorators', () => {
    @MaxSteps(10) @MaxTokens(2048) @Temperature(0.3) @Timeout(120)
    class A {}
    const c = getAgentConfig(A);
    expect(c.maxSteps).toBe(10);
    expect(c.maxTokens).toBe(2048);
    expect(c.temperature).toBe(0.3);
    expect(c.timeout).toBe(120);
  });

  it('@UseCheapestModel records cheapest resolver', () => {
    @UseCheapestModel()
    class A {}
    const c = getAgentConfig(A);
    expect(c.modelResolver?.strategy).toBe('cheapest');
  });

  it('@UseSmartestModel records smartest resolver', () => {
    @UseSmartestModel(Lab.Anthropic)
    class A {}
    const c = getAgentConfig(A);
    expect(c.modelResolver?.strategy).toBe('smartest');
    expect(c.modelResolver?.provider).toBe(Lab.Anthropic);
  });

  it('resolveModel returns cheapest chat for provider', () => {
    expect(resolveModel(Lab.Anthropic, { strategy: 'cheapest' })).toBe('claude-haiku-4-5-20251001');
  });

  it('resolveModel returns smartest chat for provider', () => {
    expect(resolveModel(Lab.OpenAI, { strategy: 'smartest' })).toBe('gpt-4o');
  });

  it('resolveModel merges per-provider overrides', () => {
    const overrides = { [Lab.Anthropic]: { cheapestChat: 'custom-haiku' } };
    expect(resolveModel(Lab.Anthropic, { strategy: 'cheapest' }, overrides)).toBe('custom-haiku');
  });
});
