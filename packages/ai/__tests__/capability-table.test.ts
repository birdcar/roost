import { describe, it, expect } from 'bun:test';
import { resolveModel, getCapabilityTable } from '../src/capability-table';
import { Lab } from '../src/enums';

describe('capability-table', () => {
  describe('resolveModel', () => {
    it('returns cheapest chat model for each known provider', () => {
      expect(resolveModel(Lab.Anthropic, { strategy: 'cheapest' })).toBe('claude-haiku-4-5-20251001');
      expect(resolveModel(Lab.OpenAI, { strategy: 'cheapest' })).toBe('gpt-4o-mini');
      expect(resolveModel(Lab.Gemini, { strategy: 'cheapest' })).toBe('gemini-2.0-flash');
      expect(resolveModel(Lab.WorkersAI, { strategy: 'cheapest' })).toBe('@cf/meta/llama-3.2-3b-instruct');
    });

    it('returns smartest chat model for each known provider', () => {
      expect(resolveModel(Lab.Anthropic, { strategy: 'smartest' })).toBe('claude-opus-4-7');
      expect(resolveModel(Lab.OpenAI, { strategy: 'smartest' })).toBe('gpt-4o');
      expect(resolveModel(Lab.Gemini, { strategy: 'smartest' })).toBe('gemini-2.5-pro');
    });

    it('returns undefined for Gateway (which inherits its upstream hints at resolve time)', () => {
      expect(resolveModel(Lab.Gateway, { strategy: 'cheapest' })).toBeUndefined();
      expect(resolveModel(Lab.Gateway, { strategy: 'smartest' })).toBeUndefined();
    });

    it('applies per-provider overrides when provided', () => {
      const overrides = { [Lab.Anthropic]: { cheapestChat: 'custom-haiku', smartestChat: 'custom-opus' } };
      expect(resolveModel(Lab.Anthropic, { strategy: 'cheapest' }, overrides)).toBe('custom-haiku');
      expect(resolveModel(Lab.Anthropic, { strategy: 'smartest' }, overrides)).toBe('custom-opus');
    });

    it('overrides are scoped per provider — unrelated providers unaffected', () => {
      const overrides = { [Lab.Anthropic]: { cheapestChat: 'x' } };
      expect(resolveModel(Lab.OpenAI, { strategy: 'cheapest' }, overrides)).toBe('gpt-4o-mini');
    });
  });

  describe('getCapabilityTable', () => {
    it('returns a seed table covering every Lab value', () => {
      const table = getCapabilityTable();
      for (const lab of Object.values(Lab)) {
        expect(table[lab]).toBeDefined();
      }
    });

    it('merges overrides onto seed hints', () => {
      const table = getCapabilityTable({
        [Lab.Anthropic]: { cheapestChat: 'custom' },
      });
      expect(table[Lab.Anthropic].cheapestChat).toBe('custom');
      expect(table[Lab.Anthropic].smartestChat).toBe('claude-opus-4-7');
    });

    it('does not mutate the seed between calls', () => {
      const first = getCapabilityTable({ [Lab.OpenAI]: { cheapestChat: 'mutated' } });
      const second = getCapabilityTable();
      expect(first[Lab.OpenAI].cheapestChat).toBe('mutated');
      expect(second[Lab.OpenAI].cheapestChat).toBe('gpt-4o-mini');
    });
  });
});
