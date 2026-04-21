#!/usr/bin/env bun
/**
 * Coverage gate — parses LCOV output from `bun test --coverage` and fails the
 * run when any source file falls below the configured thresholds (95% line,
 * 95% branch). Wired into CI as a required check.
 *
 * Usage: `bun run scripts/coverage-gate.ts [--threshold=95] [--lcov=./coverage/lcov.info]`
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

interface CoverageRecord {
  file: string;
  linesFound: number;
  linesHit: number;
  branchesFound: number;
  branchesHit: number;
}

interface GateOptions {
  lcovPath: string;
  threshold: number;
  excludePrefixes: string[];
  includePrefix: string;
}

const DEFAULT_OPTIONS: GateOptions = {
  lcovPath: './coverage/lcov.info',
  threshold: 95,
  excludePrefixes: ['src/client/', '__tests__/', 'dist/', 'scripts/'],
  includePrefix: 'src/',
};

function parseArgs(argv: string[]): GateOptions {
  const opts: GateOptions = { ...DEFAULT_OPTIONS };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--threshold=')) opts.threshold = Number(arg.split('=')[1]);
    else if (arg.startsWith('--lcov=')) opts.lcovPath = arg.split('=')[1];
    else if (arg.startsWith('--exclude=')) opts.excludePrefixes = arg.split('=')[1].split(',');
    else if (arg.startsWith('--include=')) opts.includePrefix = arg.split('=')[1];
  }
  return opts;
}

export function parseLcov(content: string): CoverageRecord[] {
  const records: CoverageRecord[] = [];
  let current: Partial<CoverageRecord> | undefined;
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('SF:')) {
      current = { file: line.slice(3), linesFound: 0, linesHit: 0, branchesFound: 0, branchesHit: 0 };
    } else if (line.startsWith('LF:') && current) {
      current.linesFound = Number(line.slice(3));
    } else if (line.startsWith('LH:') && current) {
      current.linesHit = Number(line.slice(3));
    } else if (line.startsWith('BRF:') && current) {
      current.branchesFound = Number(line.slice(4));
    } else if (line.startsWith('BRH:') && current) {
      current.branchesHit = Number(line.slice(4));
    } else if (line === 'end_of_record' && current?.file) {
      records.push(current as CoverageRecord);
      current = undefined;
    }
  }
  return records;
}

export interface GateFinding {
  file: string;
  lineCoverage: number;
  branchCoverage: number;
  lineGap: number;
  branchGap: number;
}

export function evaluate(
  records: CoverageRecord[],
  threshold: number,
  excludePrefixes: string[],
  includePrefix = '',
): GateFinding[] {
  const failing: GateFinding[] = [];
  for (const r of records) {
    if (includePrefix && !r.file.includes(includePrefix)) continue;
    if (excludePrefixes.some((p) => r.file.includes(p))) continue;
    const lineCoverage = r.linesFound === 0 ? 100 : (r.linesHit / r.linesFound) * 100;
    const branchCoverage = r.branchesFound === 0 ? 100 : (r.branchesHit / r.branchesFound) * 100;
    if (lineCoverage < threshold || branchCoverage < threshold) {
      failing.push({
        file: r.file,
        lineCoverage,
        branchCoverage,
        lineGap: threshold - lineCoverage,
        branchGap: threshold - branchCoverage,
      });
    }
  }
  return failing;
}

export function runGate(opts: GateOptions = DEFAULT_OPTIONS): number {
  const lcovPath = resolve(opts.lcovPath);
  if (!existsSync(lcovPath)) {
    console.error(`[coverage-gate] LCOV file not found at ${lcovPath}. Run \`bun test --coverage\` first.`);
    return 1;
  }
  const content = readFileSync(lcovPath, 'utf-8');
  const records = parseLcov(content);
  if (records.length === 0) {
    console.error(`[coverage-gate] LCOV file at ${lcovPath} contained no records.`);
    return 1;
  }
  const failing = evaluate(records, opts.threshold, opts.excludePrefixes, opts.includePrefix);
  if (failing.length === 0) {
    console.log(`[coverage-gate] ${records.length} files meet the ${opts.threshold}% threshold.`);
    return 0;
  }
  console.error(`[coverage-gate] ${failing.length} files below ${opts.threshold}%:`);
  for (const f of failing) {
    console.error(
      `  ${f.file}: lines=${f.lineCoverage.toFixed(1)}% branches=${f.branchCoverage.toFixed(1)}%`,
    );
  }
  return 1;
}

const isMain = import.meta.path === process.argv[1] || import.meta.path === resolve(process.argv[1] ?? '');
if (isMain) {
  const exitCode = runGate(parseArgs(process.argv));
  process.exit(exitCode);
}
