import { describe, it, expect } from 'bun:test';
import { parseLcov, evaluate } from '../../scripts/coverage-gate.js';

const SAMPLE_LCOV = `TN:
SF:packages/ai/src/agent.ts
LF:100
LH:98
BRF:40
BRH:39
end_of_record
TN:
SF:packages/ai/src/providers/anthropic.ts
LF:50
LH:30
BRF:10
BRH:5
end_of_record
TN:
SF:packages/ai/src/client/react.tsx
LF:10
LH:2
BRF:0
BRH:0
end_of_record
`;

describe('parseLcov', () => {
  it('extracts a record per SF block', () => {
    const records = parseLcov(SAMPLE_LCOV);
    expect(records).toHaveLength(3);
    expect(records[0].file).toBe('packages/ai/src/agent.ts');
    expect(records[0].linesFound).toBe(100);
    expect(records[0].linesHit).toBe(98);
    expect(records[1].branchesFound).toBe(10);
    expect(records[1].branchesHit).toBe(5);
  });
});

describe('evaluate', () => {
  it('flags files below the threshold and skips excluded prefixes', () => {
    const records = parseLcov(SAMPLE_LCOV);
    const failing = evaluate(records, 95, ['src/client/']);
    expect(failing.map((f) => f.file)).toEqual(['packages/ai/src/providers/anthropic.ts']);
    expect(failing[0].lineCoverage).toBeCloseTo(60, 1);
  });

  it('returns empty when every record meets the threshold', () => {
    const records = parseLcov(SAMPLE_LCOV);
    const failing = evaluate(records, 10, []);
    expect(failing).toEqual([]);
  });

  it('treats files with zero branches as fully covered for branches', () => {
    const records = parseLcov(SAMPLE_LCOV);
    const failing = evaluate(records, 95, []);
    const clientRecord = failing.find((f) => f.file.includes('client/react.tsx'));
    expect(clientRecord?.branchCoverage).toBe(100);
  });
});
