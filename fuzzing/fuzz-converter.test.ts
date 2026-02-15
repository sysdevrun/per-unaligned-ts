/**
 * Fuzz tests for the full parsing pipeline:
 * parseAsn1Module -> convertModuleToSchemaNodes.
 *
 * Tests that successfully parsed modules either convert to valid
 * SchemaNodes or throw clean errors — no crashes, hangs, or invalid output.
 */

import { parseAsn1Module } from '../src/parser/AsnParser';
import { convertModuleToSchemaNodes } from '../src/parser/toSchemaNode';
import type { AsnModule } from '../src/parser/types';
import type { SchemaNode } from '../src/schema/SchemaBuilder';
import { generateAsn1Module, Rng, Asn1Generator } from './generators/asn1-generator';
import { mutate } from './generators/mutator';
import { ALL_SEEDS } from './seeds';

const FUZZ_ITERATIONS = Number(process.env.FUZZ_ITERATIONS) || 500;

// -- SchemaNode validation --

const VALID_SCHEMA_TYPES = [
  'BOOLEAN', 'NULL', 'INTEGER', 'BIT STRING', 'OCTET STRING',
  'OBJECT IDENTIFIER', 'IA5String', 'VisibleString', 'UTF8String',
  'ENUMERATED', 'SEQUENCE', 'SEQUENCE OF', 'CHOICE', '$ref',
];

function validateSchemaNode(node: SchemaNode, path: string, allTypeNames: string[]): string[] {
  const errors: string[] = [];

  if (typeof node !== 'object' || node === null) {
    errors.push(`${path}: node is not an object`);
    return errors;
  }

  if (!VALID_SCHEMA_TYPES.includes(node.type)) {
    errors.push(`${path}: invalid type "${node.type}"`);
    return errors;
  }

  switch (node.type) {
    case 'INTEGER': {
      const intNode = node as SchemaNode & { min?: number; max?: number; extensible?: boolean };
      if (intNode.min !== undefined && typeof intNode.min !== 'number') {
        errors.push(`${path}: INTEGER min is not a number`);
      }
      if (intNode.max !== undefined && typeof intNode.max !== 'number') {
        errors.push(`${path}: INTEGER max is not a number`);
      }
      if (intNode.min !== undefined && intNode.max !== undefined && intNode.min > intNode.max) {
        errors.push(`${path}: INTEGER min (${intNode.min}) > max (${intNode.max})`);
      }
      break;
    }

    case 'BIT STRING':
    case 'OCTET STRING': {
      const sizedNode = node as SchemaNode & {
        fixedSize?: number; minSize?: number; maxSize?: number; extensible?: boolean;
      };
      if (sizedNode.fixedSize !== undefined && typeof sizedNode.fixedSize !== 'number') {
        errors.push(`${path}: fixedSize is not a number`);
      }
      if (sizedNode.minSize !== undefined && sizedNode.maxSize !== undefined &&
          sizedNode.minSize > sizedNode.maxSize) {
        errors.push(`${path}: minSize (${sizedNode.minSize}) > maxSize (${sizedNode.maxSize})`);
      }
      break;
    }

    case 'IA5String':
    case 'VisibleString':
    case 'UTF8String': {
      const strNode = node as SchemaNode & {
        fixedSize?: number; minSize?: number; maxSize?: number;
      };
      if (strNode.fixedSize !== undefined && typeof strNode.fixedSize !== 'number') {
        errors.push(`${path}: fixedSize is not a number`);
      }
      break;
    }

    case 'ENUMERATED': {
      const enumNode = node as SchemaNode & { values: string[]; extensionValues?: string[] };
      if (!Array.isArray(enumNode.values)) {
        errors.push(`${path}: ENUMERATED values is not an array`);
      } else {
        for (let i = 0; i < enumNode.values.length; i++) {
          if (typeof enumNode.values[i] !== 'string') {
            errors.push(`${path}.values[${i}]: not a string`);
          }
        }
      }
      if (enumNode.extensionValues !== undefined && !Array.isArray(enumNode.extensionValues)) {
        errors.push(`${path}: ENUMERATED extensionValues is not an array`);
      }
      break;
    }

    case 'SEQUENCE': {
      const seqNode = node as SchemaNode & {
        fields: Array<{ name: string; schema: SchemaNode; optional?: boolean; defaultValue?: unknown }>;
        extensionFields?: Array<{ name: string; schema: SchemaNode }>;
      };
      if (!Array.isArray(seqNode.fields)) {
        errors.push(`${path}: SEQUENCE fields is not an array`);
      } else {
        for (let i = 0; i < seqNode.fields.length; i++) {
          const field = seqNode.fields[i];
          if (typeof field.name !== 'string') {
            errors.push(`${path}.fields[${i}]: name is not a string`);
          }
          if (!field.schema) {
            errors.push(`${path}.fields[${i}]: schema is missing`);
          } else {
            errors.push(...validateSchemaNode(field.schema, `${path}.fields[${i}].schema`, allTypeNames));
          }
        }
      }
      if (seqNode.extensionFields !== undefined) {
        if (!Array.isArray(seqNode.extensionFields)) {
          errors.push(`${path}: SEQUENCE extensionFields is not an array`);
        } else {
          for (let i = 0; i < seqNode.extensionFields.length; i++) {
            const field = seqNode.extensionFields[i];
            if (typeof field.name !== 'string') {
              errors.push(`${path}.extensionFields[${i}]: name is not a string`);
            }
            if (field.schema) {
              errors.push(...validateSchemaNode(field.schema, `${path}.extensionFields[${i}].schema`, allTypeNames));
            }
          }
        }
      }
      break;
    }

    case 'SEQUENCE OF': {
      const seqOfNode = node as SchemaNode & { item: SchemaNode };
      if (!seqOfNode.item) {
        errors.push(`${path}: SEQUENCE OF item is missing`);
      } else {
        errors.push(...validateSchemaNode(seqOfNode.item, `${path}.item`, allTypeNames));
      }
      break;
    }

    case 'CHOICE': {
      const choiceNode = node as SchemaNode & {
        alternatives: Array<{ name: string; schema: SchemaNode }>;
        extensionAlternatives?: Array<{ name: string; schema: SchemaNode }>;
      };
      if (!Array.isArray(choiceNode.alternatives)) {
        errors.push(`${path}: CHOICE alternatives is not an array`);
      } else {
        for (let i = 0; i < choiceNode.alternatives.length; i++) {
          const alt = choiceNode.alternatives[i];
          if (typeof alt.name !== 'string') {
            errors.push(`${path}.alternatives[${i}]: name is not a string`);
          }
          if (!alt.schema) {
            errors.push(`${path}.alternatives[${i}]: schema is missing`);
          } else {
            errors.push(...validateSchemaNode(alt.schema, `${path}.alternatives[${i}].schema`, allTypeNames));
          }
        }
      }
      if (choiceNode.extensionAlternatives !== undefined) {
        if (!Array.isArray(choiceNode.extensionAlternatives)) {
          errors.push(`${path}: CHOICE extensionAlternatives is not an array`);
        } else {
          for (let i = 0; i < choiceNode.extensionAlternatives.length; i++) {
            const alt = choiceNode.extensionAlternatives[i];
            if (alt.schema) {
              errors.push(...validateSchemaNode(alt.schema, `${path}.extensionAlternatives[${i}].schema`, allTypeNames));
            }
          }
        }
      }
      break;
    }

    case '$ref': {
      const refNode = node as SchemaNode & { ref: string };
      if (typeof refNode.ref !== 'string') {
        errors.push(`${path}: $ref ref is not a string`);
      }
      // $ref should point to a known type name
      if (!allTypeNames.includes(refNode.ref)) {
        errors.push(`${path}: $ref "${refNode.ref}" points to unknown type`);
      }
      break;
    }
  }

  return errors;
}

function validateSchemaOutput(schemas: Record<string, SchemaNode>): string[] {
  const allErrors: string[] = [];
  const allTypeNames = Object.keys(schemas);

  for (const [typeName, node] of Object.entries(schemas)) {
    if (typeof typeName !== 'string' || typeName.length === 0) {
      allErrors.push(`Empty type name in schema output`);
      continue;
    }
    allErrors.push(...validateSchemaNode(node, typeName, allTypeNames));
  }

  return allErrors;
}

/** Try to parse and convert, returning the result or error. */
function parseAndConvert(input: string): {
  schemas?: Record<string, SchemaNode>;
  parseError?: Error;
  convertError?: Error;
} {
  let module: AsnModule;
  try {
    module = parseAsn1Module(input);
  } catch (e) {
    return { parseError: e instanceof Error ? e : new Error(String(e)) };
  }

  try {
    const schemas = convertModuleToSchemaNodes(module);
    return { schemas };
  } catch (e) {
    return { convertError: e instanceof Error ? e : new Error(String(e)) };
  }
}

// -- Test suites --

describe('Converter fuzzing: grammar-aware generation', () => {
  it('should produce valid SchemaNodes for successfully parsed generated modules', () => {
    let fullSuccess = 0;
    let parseReject = 0;
    let convertReject = 0;
    let validationFails = 0;

    for (let i = 0; i < FUZZ_ITERATIONS; i++) {
      const input = generateAsn1Module(i);
      const { schemas, parseError, convertError } = parseAndConvert(input);

      if (parseError) {
        parseReject++;
        continue;
      }

      if (convertError) {
        // Converter errors should be clean Error objects
        expect(convertError).toBeInstanceOf(Error);
        expect(typeof convertError.message).toBe('string');
        convertReject++;
        continue;
      }

      // Validate schema output
      const errors = validateSchemaOutput(schemas!);
      if (errors.length > 0) {
        validationFails++;
        // Report first failure with details for debugging
        console.error(`Validation failed for seed ${i}:`);
        console.error(`  Input: ${input.slice(0, 200)}...`);
        console.error(`  Errors: ${errors.join('; ')}`);
      }
      expect(errors).toEqual([]);
      fullSuccess++;
    }

    expect(fullSuccess).toBeGreaterThan(0);
    console.log(`Converter generation fuzzing: ${fullSuccess} valid, ${parseReject} parse rejected, ${convertReject} convert rejected, ${validationFails} validation fails`);
  });
});

describe('Converter fuzzing: seed corpus full pipeline', () => {
  it('should convert all seed inputs to valid SchemaNodes', () => {
    for (const seed of ALL_SEEDS) {
      const { schemas, parseError, convertError } = parseAndConvert(seed);

      // Seeds should all parse successfully
      expect(parseError).toBeUndefined();
      expect(convertError).toBeUndefined();
      expect(schemas).toBeDefined();

      const errors = validateSchemaOutput(schemas!);
      if (errors.length > 0) {
        console.error(`Seed validation failed:`, errors);
        console.error(`Input: ${seed.slice(0, 200)}`);
      }
      expect(errors).toEqual([]);
    }
  });
});

describe('Converter fuzzing: mutation-based pipeline', () => {
  it('should handle mutated seeds through the full pipeline without crashing', () => {
    let fullSuccess = 0;

    for (let i = 0; i < FUZZ_ITERATIONS; i++) {
      const seed = ALL_SEEDS[i % ALL_SEEDS.length];
      const rng = new Rng(i + 300000);
      const mutated = mutate(seed, rng);
      const { schemas, parseError } = parseAndConvert(mutated);

      if (parseError) continue;
      if (!schemas) continue;

      const errors = validateSchemaOutput(schemas);
      expect(errors).toEqual([]);
      fullSuccess++;
    }

    console.log(`Converter mutation fuzzing: ${fullSuccess} full successes out of ${FUZZ_ITERATIONS}`);
  });
});

describe('Converter fuzzing: constraint edge cases', () => {
  const constraintCases = [
    // Zero-width ranges
    'X DEFINITIONS ::= BEGIN\n  T ::= INTEGER (0..0)\nEND',
    'X DEFINITIONS ::= BEGIN\n  T ::= INTEGER (5..5)\nEND',
    'X DEFINITIONS ::= BEGIN\n  T ::= INTEGER (-1..-1)\nEND',

    // Large ranges
    'X DEFINITIONS ::= BEGIN\n  T ::= INTEGER (0..4294967295)\nEND',
    'X DEFINITIONS ::= BEGIN\n  T ::= INTEGER (-2147483648..2147483647)\nEND',

    // Negative ranges
    'X DEFINITIONS ::= BEGIN\n  T ::= INTEGER (-100..-1)\nEND',
    'X DEFINITIONS ::= BEGIN\n  T ::= INTEGER (-1000..1000)\nEND',

    // Zero-size collections
    'X DEFINITIONS ::= BEGIN\n  T ::= BIT STRING (SIZE (0))\nEND',
    'X DEFINITIONS ::= BEGIN\n  T ::= OCTET STRING (SIZE (0..0))\nEND',
    'X DEFINITIONS ::= BEGIN\n  T ::= IA5String (SIZE (0..0))\nEND',

    // Fixed size collections
    'X DEFINITIONS ::= BEGIN\n  T ::= BIT STRING (SIZE (1))\nEND',
    'X DEFINITIONS ::= BEGIN\n  T ::= OCTET STRING (SIZE (1))\nEND',

    // Large size constraints
    'X DEFINITIONS ::= BEGIN\n  T ::= OCTET STRING (SIZE (0..65535))\nEND',
    'X DEFINITIONS ::= BEGIN\n  T ::= BIT STRING (SIZE (0..65535))\nEND',

    // Extensible constraints of all kinds
    'X DEFINITIONS ::= BEGIN\n  T ::= INTEGER (0..100, ...)\nEND',
    'X DEFINITIONS ::= BEGIN\n  T ::= BIT STRING (SIZE (8, ...))\nEND',
    'X DEFINITIONS ::= BEGIN\n  T ::= OCTET STRING (SIZE (1..50, ...))\nEND',
    'X DEFINITIONS ::= BEGIN\n  T ::= IA5String (SIZE (0..100, ...))\nEND',
    'X DEFINITIONS ::= BEGIN\n  T ::= SEQUENCE (SIZE (0..10, ...)) OF INTEGER\nEND',

    // Constrained type references
    'X DEFINITIONS ::= BEGIN\n  Base ::= INTEGER\n  T ::= Base (0..255)\nEND',
  ];

  it('should handle constraint edge cases correctly', () => {
    for (const input of constraintCases) {
      const { schemas, parseError, convertError } = parseAndConvert(input);

      if (parseError || convertError) continue;

      const errors = validateSchemaOutput(schemas!);
      if (errors.length > 0) {
        console.error(`Constraint case failed: ${input}`);
        console.error(`Errors: ${errors.join('; ')}`);
      }
      expect(errors).toEqual([]);
    }
  });
});

describe('Converter fuzzing: recursive/cyclic types', () => {
  const recursiveCases = [
    // Direct self-reference
    `X DEFINITIONS ::= BEGIN
      Tree ::= SEQUENCE {
        value INTEGER,
        children SEQUENCE OF Tree
      }
    END`,

    // Mutual recursion
    `X DEFINITIONS ::= BEGIN
      A ::= SEQUENCE {
        data INTEGER,
        b B OPTIONAL
      }
      B ::= SEQUENCE {
        data BOOLEAN,
        a A OPTIONAL
      }
    END`,

    // Self-referencing CHOICE
    `X DEFINITIONS ::= BEGIN
      Expr ::= CHOICE {
        literal INTEGER (0..999),
        nested SEQUENCE {
          op ENUMERATED { add, sub, mul },
          left Expr,
          right Expr
        }
      }
    END`,

    // Chain of references
    `X DEFINITIONS ::= BEGIN
      A ::= B
      B ::= C
      C ::= INTEGER (0..100)
    END`,

    // Multiple independent recursive types
    `X DEFINITIONS ::= BEGIN
      ListA ::= SEQUENCE {
        val INTEGER,
        next ListA OPTIONAL
      }
      ListB ::= SEQUENCE {
        val BOOLEAN,
        next ListB OPTIONAL
      }
    END`,
  ];

  it('should handle recursive types with $ref emission', () => {
    for (const input of recursiveCases) {
      const { schemas, parseError, convertError } = parseAndConvert(input);

      expect(parseError).toBeUndefined();
      // convertError is acceptable for some cyclic cases
      if (convertError) {
        expect(convertError).toBeInstanceOf(Error);
        continue;
      }

      const errors = validateSchemaOutput(schemas!);
      expect(errors).toEqual([]);
    }
  });
});

describe('Converter fuzzing: stress test with many type references', () => {
  it('should handle modules with many cross-references', () => {
    const rng = new Rng(777);
    // Generate a module where each type references previous types
    const assignments: string[] = [];
    assignments.push('  Base ::= INTEGER (0..255)');
    for (let i = 1; i <= 50; i++) {
      const refIdx = rng.int(0, i - 1);
      const refName = refIdx === 0 ? 'Base' : `Type${refIdx}`;
      if (rng.chance(0.5)) {
        assignments.push(`  Type${i} ::= SEQUENCE { val ${refName}, extra BOOLEAN OPTIONAL }`);
      } else {
        assignments.push(`  Type${i} ::= SEQUENCE OF ${refName}`);
      }
    }
    const input = `RefStress DEFINITIONS ::= BEGIN\n${assignments.join('\n')}\nEND`;

    const { schemas, parseError, convertError } = parseAndConvert(input);
    expect(parseError).toBeUndefined();
    expect(convertError).toBeUndefined();

    const errors = validateSchemaOutput(schemas!);
    expect(errors).toEqual([]);
    expect(Object.keys(schemas!).length).toBe(51);
  });
});
