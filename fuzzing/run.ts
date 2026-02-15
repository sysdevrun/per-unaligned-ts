/**
 * Standalone continuous fuzzer for the ASN.1 parser.
 *
 * Runs grammar-aware generation and mutation-based fuzzing in a loop,
 * reporting any inputs that cause crashes or hangs.
 *
 * Usage:
 *   npx ts-node fuzzing/run.ts [--iterations N]
 */

import { parseAsn1Module } from '../src/parser/AsnParser';
import { convertModuleToSchemaNodes } from '../src/parser/toSchemaNode';
import { generateAsn1Module, Rng } from './generators/asn1-generator';
import { mutate } from './generators/mutator';
import { ALL_SEEDS } from './seeds';

const TIMEOUT_MS = 2000;

interface FuzzResult {
  seed: number;
  strategy: string;
  input: string;
  error?: string;
  timedOut: boolean;
  parseOk: boolean;
  convertOk: boolean;
}

function fuzzOne(input: string, seed: number, strategy: string): FuzzResult {
  const result: FuzzResult = {
    seed,
    strategy,
    input,
    timedOut: false,
    parseOk: false,
    convertOk: false,
  };

  const start = Date.now();

  try {
    const module = parseAsn1Module(input);
    result.parseOk = true;

    if (Date.now() - start > TIMEOUT_MS) {
      result.timedOut = true;
      return result;
    }

    try {
      convertModuleToSchemaNodes(module);
      result.convertOk = true;
    } catch (e) {
      // Converter rejection is fine
    }
  } catch (e) {
    // Parser rejection is fine
  }

  if (Date.now() - start > TIMEOUT_MS) {
    result.timedOut = true;
  }

  return result;
}

function main() {
  const args = process.argv.slice(2);
  let maxIterations = Infinity;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--iterations' && args[i + 1]) {
      maxIterations = parseInt(args[i + 1], 10);
      i++;
    }
  }

  console.log(`ASN.1 Parser Fuzzer`);
  console.log(`Max iterations: ${maxIterations === Infinity ? 'unlimited' : maxIterations}`);
  console.log('');

  let iteration = 0;
  let generated = 0;
  let mutated = 0;
  let parseOk = 0;
  let convertOk = 0;
  let timedOut = 0;
  const crashes: FuzzResult[] = [];

  const startTime = Date.now();

  while (iteration < maxIterations) {
    let result: FuzzResult;

    if (iteration % 2 === 0) {
      // Grammar-aware generation
      const input = generateAsn1Module(iteration);
      result = fuzzOne(input, iteration, 'generation');
      generated++;
    } else {
      // Mutation-based
      const seed = ALL_SEEDS[iteration % ALL_SEEDS.length];
      const rng = new Rng(iteration);
      const input = mutate(seed, rng, rng.int(1, 5));
      result = fuzzOne(input, iteration, 'mutation');
      mutated++;
    }

    if (result.parseOk) parseOk++;
    if (result.convertOk) convertOk++;
    if (result.timedOut) {
      timedOut++;
      crashes.push(result);
      console.error(`\n[!] TIMEOUT at iteration ${iteration} (${result.strategy}):`);
      console.error(`    Input: ${result.input.slice(0, 200)}...`);
    }

    iteration++;

    // Progress report every 1000 iterations
    if (iteration % 1000 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = (iteration / ((Date.now() - startTime) / 1000)).toFixed(0);
      console.log(
        `[${elapsed}s] iteration=${iteration} rate=${rate}/s ` +
        `generated=${generated} mutated=${mutated} ` +
        `parseOk=${parseOk} convertOk=${convertOk} ` +
        `timeouts=${timedOut}`
      );
    }
  }

  // Final report
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log('=== Final Report ===');
  console.log(`Total iterations: ${iteration}`);
  console.log(`Elapsed: ${elapsed}s`);
  console.log(`Generated: ${generated}`);
  console.log(`Mutated: ${mutated}`);
  console.log(`Parse successes: ${parseOk}`);
  console.log(`Convert successes: ${convertOk}`);
  console.log(`Timeouts: ${timedOut}`);

  if (crashes.length > 0) {
    console.log('');
    console.log(`=== ${crashes.length} issue(s) found ===`);
    for (const crash of crashes) {
      console.log(`  Seed: ${crash.seed}, Strategy: ${crash.strategy}`);
      console.log(`  Input: ${crash.input.slice(0, 300)}`);
      console.log('');
    }
    process.exit(1);
  } else {
    console.log('\nNo issues found.');
    process.exit(0);
  }
}

main();
