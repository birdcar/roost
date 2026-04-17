/**
 * Named providers. Mirrors Laravel's `Lab` enum — gives consumers a typed
 * reference instead of string literals like "anthropic"/"openai".
 */
export const Lab = {
  WorkersAI: 'workers-ai',
  Anthropic: 'anthropic',
  OpenAI: 'openai',
  Gemini: 'gemini',
  Gateway: 'gateway',
} as const;

export type Lab = (typeof Lab)[keyof typeof Lab];

export function isLab(value: unknown): value is Lab {
  return typeof value === 'string' && (Object.values(Lab) as string[]).includes(value);
}
