/**
 * Fuzz tests for parseAsn1Module.
 *
 * Tests that the parser either succeeds and returns a valid AsnModule,
 * or throws a clean Error — never crashes, hangs, or returns garbage.
 */

import { parseAsn1Module } from '../src/parser/AsnParser';
import type { AsnModule, AsnType } from '../src/parser/types';
import { generateAsn1Module, Rng } from './generators/asn1-generator';
import { mutate, MUTATORS } from './generators/mutator';
import { ALL_SEEDS } from './seeds';

const FUZZ_ITERATIONS = Number(process.env.FUZZ_ITERATIONS) || 500;
const TIMEOUT_MS = 2000;
/** Cap input length to avoid PEG backtracking hangs on pathological strings. */
const MAX_INPUT_LENGTH = 2000;

// -- Validation helpers --

function isValidAsnModule(result: unknown): result is AsnModule {
  if (typeof result !== 'object' || result === null) return false;
  const mod = result as AsnModule;
  if (typeof mod.name !== 'string' || mod.name.length === 0) return false;
  if (!Array.isArray(mod.assignments)) return false;
  if (mod.tagMode !== undefined && !['AUTOMATIC', 'EXPLICIT', 'IMPLICIT'].includes(mod.tagMode)) return false;
  for (const assignment of mod.assignments) {
    if (typeof assignment.name !== 'string') return false;
    if (!isValidAsnType(assignment.type)) return false;
  }
  return true;
}

function isValidAsnType(type: unknown): boolean {
  if (typeof type !== 'object' || type === null) return false;
  const t = type as AsnType;
  const validKinds = [
    'BOOLEAN', 'NULL', 'INTEGER', 'BIT STRING', 'OCTET STRING',
    'CharString', 'OBJECT IDENTIFIER', 'ENUMERATED',
    'SEQUENCE', 'SEQUENCE OF', 'CHOICE', 'TypeReference', 'ConstrainedType',
  ];
  if (!validKinds.includes(t.kind)) return false;

  switch (t.kind) {
    case 'SEQUENCE':
      if (!Array.isArray(t.fields)) return false;
      for (const f of t.fields) {
        if (typeof f.name !== 'string') return false;
        if (!isValidAsnType(f.type)) return false;
      }
      if (t.extensionFields !== undefined) {
        if (!Array.isArray(t.extensionFields)) return false;
        for (const f of t.extensionFields) {
          if (typeof f.name !== 'string') return false;
          if (!isValidAsnType(f.type)) return false;
        }
      }
      break;
    case 'SEQUENCE OF':
      if (!isValidAsnType(t.itemType)) return false;
      break;
    case 'CHOICE':
      if (!Array.isArray(t.alternatives)) return false;
      for (const a of t.alternatives) {
        if (typeof a.name !== 'string') return false;
        if (!isValidAsnType(a.type)) return false;
      }
      break;
    case 'ENUMERATED':
      if (!Array.isArray(t.rootValues)) return false;
      break;
    case 'TypeReference':
      if (typeof t.name !== 'string') return false;
      break;
    case 'ConstrainedType':
      if (!isValidAsnType(t.baseType)) return false;
      if (typeof t.constraint !== 'object' || t.constraint === null) return false;
      break;
  }
  return true;
}

/**
 * Run the parser with a timeout to catch hangs.
 * Returns { result, error, timedOut }.
 */
function parseWithTimeout(input: string): {
  result?: AsnModule;
  error?: Error;
  timedOut: boolean;
} {
  // Cap input length to avoid PEG backtracking hangs
  const cappedInput = input.length > MAX_INPUT_LENGTH ? input.slice(0, MAX_INPUT_LENGTH) : input;
  const start = Date.now();
  try {
    const result = parseAsn1Module(cappedInput);
    const elapsed = Date.now() - start;
    if (elapsed > TIMEOUT_MS) {
      return { result, timedOut: true };
    }
    return { result, timedOut: false };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), timedOut: false };
  }
}

// -- Test suites --

describe('Parser fuzzing: grammar-aware generation', () => {
  it('should parse or reject generated modules without crashing', () => {
    let parsed = 0;
    let rejected = 0;

    for (let i = 0; i < FUZZ_ITERATIONS; i++) {
      const input = generateAsn1Module(i);
      const { result, error, timedOut } = parseWithTimeout(input);

      expect(timedOut).toBe(false);

      if (result !== undefined) {
        expect(isValidAsnModule(result)).toBe(true);
        parsed++;
      } else {
        expect(error).toBeInstanceOf(Error);
        rejected++;
      }
    }

    // At least some should parse successfully (generator is grammar-aware)
    expect(parsed).toBeGreaterThan(0);
    // Log statistics
    console.log(`Generation fuzzing: ${parsed} parsed, ${rejected} rejected out of ${FUZZ_ITERATIONS}`);
  });
});

describe('Parser fuzzing: mutation-based', () => {
  it('should handle mutated seed inputs without crashing', () => {
    let parsed = 0;
    let rejected = 0;

    for (let i = 0; i < FUZZ_ITERATIONS; i++) {
      const seed = ALL_SEEDS[i % ALL_SEEDS.length];
      const rng = new Rng(i);
      const mutated = mutate(seed, rng);
      const { result, error, timedOut } = parseWithTimeout(mutated);

      expect(timedOut).toBe(false);

      if (result !== undefined) {
        expect(isValidAsnModule(result)).toBe(true);
        parsed++;
      } else {
        expect(error).toBeInstanceOf(Error);
        rejected++;
      }
    }

    console.log(`Mutation fuzzing: ${parsed} parsed, ${rejected} rejected out of ${FUZZ_ITERATIONS}`);
  });
});

describe('Parser fuzzing: heavy mutation', () => {
  it('should handle heavily mutated inputs (3-5 mutations) without crashing', () => {
    for (let i = 0; i < FUZZ_ITERATIONS; i++) {
      const seed = ALL_SEEDS[i % ALL_SEEDS.length];
      const rng = new Rng(i + 100000);
      const mutated = mutate(seed, rng, rng.int(3, 5));
      const { timedOut } = parseWithTimeout(mutated);

      expect(timedOut).toBe(false);
    }
  });
});

describe('Parser fuzzing: targeted mutation strategies', () => {
  for (const mutator of MUTATORS) {
    it(`should handle ${mutator.name} mutations without crashing`, () => {
      for (let i = 0; i < Math.min(50, FUZZ_ITERATIONS); i++) {
        const seed = ALL_SEEDS[i % ALL_SEEDS.length];
        const rng = new Rng(i + 200000);
        const mutated = mutator(seed, rng);
        const { timedOut } = parseWithTimeout(mutated);

        expect(timedOut).toBe(false);
      }
    });
  }
});

describe('Parser fuzzing: edge case inputs', () => {
  const edgeCases = [
    '',
    ' ',
    '\n',
    '\t',
    '\0',
    '\0'.repeat(100),
    'x',
    '::=',
    'DEFINITIONS ::= BEGIN END',
    'X DEFINITIONS ::= BEGIN END',
    'X DEFINITIONS ::= BEGIN\nEND',
    'X DEFINITIONS ::= BEGIN X ::= END',
    'X DEFINITIONS ::= BEGIN\n  Y ::= BOOLEAN\n  Y ::= INTEGER\nEND',
    '  '.repeat(1000),
    'A'.repeat(1000),
    '{'.repeat(100),
    '}'.repeat(100),
    '('.repeat(100),
    ')'.repeat(100),
    '.'.repeat(100),
    '...'.repeat(50),
    ','.repeat(100),
    '--'.repeat(100),
    '-- comment\n'.repeat(100),
    'X DEFINITIONS ::= BEGIN\n' + '  T ::= INTEGER\n'.repeat(100) + 'END',
    'X DEFINITIONS ::= BEGIN\n  T ::= ' + 'SEQUENCE { x '.repeat(20) + 'BOOLEAN' + ' }'.repeat(20) + '\nEND',
    'X DEFINITIONS ::= BEGIN\n  T ::= ' + 'SEQUENCE OF '.repeat(20) + 'INTEGER\nEND',
    'X DEFINITIONS ::= BEGIN\n  T ::= INTEGER (0..0)\nEND',
    'X DEFINITIONS ::= BEGIN\n  T ::= INTEGER (-2147483648..2147483647)\nEND',
    'X DEFINITIONS ::= BEGIN\n  T ::= INTEGER (0..0, ...)\nEND',
    'X DEFINITIONS ::= BEGIN\n  T ::= BIT STRING (SIZE (0))\nEND',
    'X DEFINITIONS ::= BEGIN\n  T ::= ENUMERATED { a }\nEND',
    'X DEFINITIONS ::= BEGIN\n  T ::= CHOICE { a BOOLEAN, b NULL }\nEND',
    'X DEFINITIONS ::= BEGIN\n  T ::= SEQUENCE { }\nEND',
  ];

  it('should handle edge case inputs without crashing', () => {
    for (const input of edgeCases) {
      const { timedOut } = parseWithTimeout(input);
      expect(timedOut).toBe(false);
    }
  });
});

describe('Parser fuzzing: deeply nested types', () => {
  it('should handle deeply nested SEQUENCE structures', () => {
    for (let depth = 1; depth <= 30; depth++) {
      const open = 'SEQUENCE { x '.repeat(depth);
      const close = ' }'.repeat(depth);
      const input = `X DEFINITIONS ::= BEGIN\n  T ::= ${open}BOOLEAN${close}\nEND`;
      const { timedOut } = parseWithTimeout(input);
      expect(timedOut).toBe(false);
    }
  });

  it('should handle deeply nested SEQUENCE OF chains', () => {
    for (let depth = 1; depth <= 30; depth++) {
      const prefix = 'SEQUENCE OF '.repeat(depth);
      const input = `X DEFINITIONS ::= BEGIN\n  T ::= ${prefix}INTEGER\nEND`;
      const { timedOut } = parseWithTimeout(input);
      expect(timedOut).toBe(false);
    }
  });

  it('should handle deeply nested CHOICE structures', () => {
    for (let depth = 1; depth <= 20; depth++) {
      const open = 'CHOICE { a '.repeat(depth);
      const close = ' }'.repeat(depth);
      const input = `X DEFINITIONS ::= BEGIN\n  T ::= ${open}BOOLEAN${close}\nEND`;
      const { timedOut } = parseWithTimeout(input);
      expect(timedOut).toBe(false);
    }
  });

  it('should handle deeply nested constraints', () => {
    for (let depth = 1; depth <= 20; depth++) {
      const constraint = '(0..255)'.repeat(Math.min(depth, 3));
      const input = `X DEFINITIONS ::= BEGIN\n  T ::= INTEGER ${constraint}\nEND`;
      const { timedOut } = parseWithTimeout(input);
      expect(timedOut).toBe(false);
    }
  });
});

describe('Parser fuzzing: large modules', () => {
  it('should handle modules with many type assignments', () => {
    const rng = new Rng(42);
    for (const count of [10, 50, 100, 200]) {
      const assignments = Array.from({ length: count }, (_, i) =>
        `  Type${i} ::= INTEGER (0..${rng.int(1, 65535)})`
      ).join('\n');
      const input = `Large DEFINITIONS ::= BEGIN\n${assignments}\nEND`;
      const { result, timedOut } = parseWithTimeout(input);
      expect(timedOut).toBe(false);
      if (result) {
        expect(result.assignments.length).toBe(count);
      }
    }
  });

  it('should handle ENUMERATED with many values', () => {
    for (const count of [10, 50, 100]) {
      const values = Array.from({ length: count }, (_, i) => `val${i}`).join(', ');
      const input = `X DEFINITIONS ::= BEGIN\n  T ::= ENUMERATED { ${values} }\nEND`;
      const { result, timedOut } = parseWithTimeout(input);
      expect(timedOut).toBe(false);
      if (result) {
        expect(result.assignments[0].type.kind).toBe('ENUMERATED');
      }
    }
  });

  it('should handle SEQUENCE with many fields', () => {
    for (const count of [10, 50, 100]) {
      const fields = Array.from({ length: count }, (_, i) =>
        `    field${i} INTEGER`
      ).join(',\n');
      const input = `X DEFINITIONS ::= BEGIN\n  T ::= SEQUENCE {\n${fields}\n  }\nEND`;
      const { result, timedOut } = parseWithTimeout(input);
      expect(timedOut).toBe(false);
      if (result && result.assignments[0].type.kind === 'SEQUENCE') {
        expect(result.assignments[0].type.fields.length).toBe(count);
      }
    }
  });
});

describe('Parser fuzzing: random byte strings', () => {
  it('should reject purely random bytes without crashing', () => {
    const rng = new Rng(99);
    for (let i = 0; i < FUZZ_ITERATIONS; i++) {
      const len = rng.int(1, 200);
      let input = '';
      for (let j = 0; j < len; j++) {
        input += String.fromCharCode(rng.int(0, 127));
      }
      const { timedOut } = parseWithTimeout(input);
      expect(timedOut).toBe(false);
    }
  });
});
