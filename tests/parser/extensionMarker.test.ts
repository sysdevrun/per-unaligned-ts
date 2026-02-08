/**
 * Tests for extension marker (`...`) handling across the full pipeline:
 * ASN.1 text → parser AST → SchemaNode → Codec → encode/decode.
 *
 * Covers both "marker with additions" and "marker only" (no additions)
 * for SEQUENCE, CHOICE, ENUMERATED, and constrained types.
 */
import { parseAsn1Module } from '../../src/parser/AsnParser';
import { convertModuleToSchemaNodes } from '../../src/parser/toSchemaNode';
import { SchemaBuilder } from '../../src/schema/SchemaBuilder';
import { SchemaCodec } from '../../src/schema/SchemaCodec';
import { BitBuffer } from '../../src/BitBuffer';
import { SequenceCodec } from '../../src/codecs/SequenceCodec';
import { ChoiceCodec } from '../../src/codecs/ChoiceCodec';
import { EnumeratedCodec } from '../../src/codecs/EnumeratedCodec';
import type {
  AsnSequenceType,
  AsnChoiceType,
  AsnEnumeratedType,
  AsnConstrainedType,
} from '../../src/parser/types';
import type { SchemaNode } from '../../src/schema/SchemaBuilder';

/** Helper: parse a single type definition inside a module. */
function parseType(typeDef: string) {
  const mod = parseAsn1Module(
    `Test DEFINITIONS ::= BEGIN\n  TestType ::= ${typeDef}\nEND`,
  );
  return mod.assignments[0].type;
}

/** Helper: parse and convert a single type to SchemaNode. */
function convertSingle(typeDef: string): SchemaNode {
  const mod = parseAsn1Module(
    `Test DEFINITIONS ::= BEGIN\n  TestType ::= ${typeDef}\nEND`,
  );
  return convertModuleToSchemaNodes(mod)['TestType'];
}

describe('Extension marker: parser AST', () => {
  describe('SEQUENCE with marker only (no extension additions)', () => {
    it('parses extension marker with no fields after it', () => {
      const type = parseType('SEQUENCE { id INTEGER, ... }') as AsnSequenceType;
      expect(type.kind).toBe('SEQUENCE');
      expect(type.fields).toHaveLength(1);
      expect(type.fields[0].name).toBe('id');
      expect(type.extensionFields).toBeDefined();
      expect(type.extensionFields).toEqual([]);
    });

    it('parses extension marker with fields after it', () => {
      const type = parseType('SEQUENCE { id INTEGER, ..., name IA5String }') as AsnSequenceType;
      expect(type.fields).toHaveLength(1);
      expect(type.extensionFields).toHaveLength(1);
      expect(type.extensionFields![0].name).toBe('name');
    });

    it('parses extension marker as only separator between root and extensions', () => {
      const type = parseType(
        'SEQUENCE { a BOOLEAN, b INTEGER, ..., c IA5String, d OCTET STRING }',
      ) as AsnSequenceType;
      expect(type.fields).toHaveLength(2);
      expect(type.extensionFields).toHaveLength(2);
      expect(type.fields.map(f => f.name)).toEqual(['a', 'b']);
      expect(type.extensionFields!.map(f => f.name)).toEqual(['c', 'd']);
    });
  });

  describe('CHOICE with marker only', () => {
    it('parses extension marker with no alternatives after it', () => {
      const type = parseType('CHOICE { a BOOLEAN, ... }') as AsnChoiceType;
      expect(type.kind).toBe('CHOICE');
      expect(type.alternatives).toHaveLength(1);
      expect(type.extensionAlternatives).toBeDefined();
      expect(type.extensionAlternatives).toEqual([]);
    });

    it('parses extension marker with alternatives after it', () => {
      const type = parseType('CHOICE { a BOOLEAN, ..., b INTEGER }') as AsnChoiceType;
      expect(type.alternatives).toHaveLength(1);
      expect(type.extensionAlternatives).toHaveLength(1);
    });
  });

  describe('ENUMERATED with marker only', () => {
    it('parses extension marker with no values after it', () => {
      const type = parseType('ENUMERATED { red, green, blue, ... }') as AsnEnumeratedType;
      expect(type.kind).toBe('ENUMERATED');
      expect(type.rootValues).toEqual(['red', 'green', 'blue']);
      expect(type.extensionValues).toBeDefined();
      expect(type.extensionValues).toEqual([]);
    });

    it('parses extension marker with values after it', () => {
      const type = parseType('ENUMERATED { red, green, ..., yellow }') as AsnEnumeratedType;
      expect(type.rootValues).toEqual(['red', 'green']);
      expect(type.extensionValues).toEqual(['yellow']);
    });
  });

  describe('extensible constraints', () => {
    it('parses INTEGER with extensible value constraint', () => {
      const type = parseType('INTEGER (0..100, ...)') as AsnConstrainedType;
      expect(type.constraint.extensible).toBe(true);
    });

    it('parses SIZE constraint with extensible marker', () => {
      const type = parseType('OCTET STRING (SIZE (1..50, ...))') as AsnConstrainedType;
      expect(type.constraint.extensible).toBe(true);
      expect(type.constraint.constraintType).toBe('size');
    });

    it('parses fixed SIZE constraint with extensible marker', () => {
      const type = parseType('BIT STRING (SIZE (8, ...))') as AsnConstrainedType;
      expect(type.constraint.extensible).toBe(true);
      expect(type.constraint.min).toBe(8);
      expect(type.constraint.max).toBe(8);
    });
  });
});

describe('Extension marker: toSchemaNode conversion', () => {
  describe('SEQUENCE', () => {
    it('preserves empty extensionFields when marker present with no additions', () => {
      const schema = convertSingle('SEQUENCE { id INTEGER, ... }');
      expect(schema).toEqual({
        type: 'SEQUENCE',
        fields: [{ name: 'id', schema: { type: 'INTEGER' } }],
        extensionFields: [],
      });
    });

    it('preserves extensionFields when marker present with additions', () => {
      const schema = convertSingle('SEQUENCE { id INTEGER, ..., name IA5String }');
      expect(schema).toEqual({
        type: 'SEQUENCE',
        fields: [{ name: 'id', schema: { type: 'INTEGER' } }],
        extensionFields: [{ name: 'name', schema: { type: 'IA5String' } }],
      });
    });

    it('omits extensionFields when no marker present', () => {
      const schema = convertSingle('SEQUENCE { id INTEGER }');
      expect(schema).toEqual({
        type: 'SEQUENCE',
        fields: [{ name: 'id', schema: { type: 'INTEGER' } }],
      });
      expect((schema as { extensionFields?: unknown }).extensionFields).toBeUndefined();
    });
  });

  describe('CHOICE', () => {
    it('preserves empty extensionAlternatives when marker present with no additions', () => {
      const schema = convertSingle('CHOICE { a BOOLEAN, ... }');
      expect(schema).toEqual({
        type: 'CHOICE',
        alternatives: [{ name: 'a', schema: { type: 'BOOLEAN' } }],
        extensionAlternatives: [],
      });
    });

    it('omits extensionAlternatives when no marker present', () => {
      const schema = convertSingle('CHOICE { a BOOLEAN, b INTEGER }');
      expect((schema as { extensionAlternatives?: unknown }).extensionAlternatives).toBeUndefined();
    });
  });

  describe('ENUMERATED', () => {
    it('preserves empty extensionValues when marker present with no additions', () => {
      const schema = convertSingle('ENUMERATED { red, green, ... }');
      expect(schema).toEqual({
        type: 'ENUMERATED',
        values: ['red', 'green'],
        extensionValues: [],
      });
    });

    it('omits extensionValues when no marker present', () => {
      const schema = convertSingle('ENUMERATED { red, green }');
      expect((schema as { extensionValues?: unknown }).extensionValues).toBeUndefined();
    });
  });

  describe('extensible constraints', () => {
    it('converts extensible INTEGER constraint', () => {
      const schema = convertSingle('INTEGER (0..100, ...)');
      expect(schema).toEqual({
        type: 'INTEGER',
        min: 0,
        max: 100,
        extensible: true,
      });
    });

    it('converts extensible SIZE constraint on OCTET STRING', () => {
      const schema = convertSingle('OCTET STRING (SIZE (1..50, ...))');
      expect(schema).toEqual({
        type: 'OCTET STRING',
        minSize: 1,
        maxSize: 50,
        extensible: true,
      });
    });

    it('converts extensible SIZE constraint on BIT STRING', () => {
      const schema = convertSingle('BIT STRING (SIZE (8, ...))');
      expect(schema).toEqual({
        type: 'BIT STRING',
        fixedSize: 8,
        extensible: true,
      });
    });

    it('converts extensible SIZE constraint on IA5String', () => {
      const schema = convertSingle('IA5String (SIZE (1..100, ...))');
      expect(schema).toEqual({
        type: 'IA5String',
        minSize: 1,
        maxSize: 100,
        extensible: true,
      });
    });
  });
});

describe('Extension marker: codec behavior', () => {
  describe('SequenceCodec with empty extension fields (marker only)', () => {
    const codec = new SequenceCodec({
      fields: [
        { name: 'id', codec: new (require('../../src/codecs/IntegerCodec').IntegerCodec)({ min: 0, max: 255 }) },
      ],
      extensionFields: [], // marker present, no additions
    });

    it('is extensible', () => {
      expect(codec.extensible).toBe(true);
    });

    it('writes extension bit 0 when encoding root-only data', () => {
      const buf = BitBuffer.alloc();
      codec.encode(buf, { id: 42 });
      buf.reset();
      expect(buf.readBit()).toBe(0); // ext bit = 0
    });

    it('round-trips root-only data', () => {
      const buf = BitBuffer.alloc();
      codec.encode(buf, { id: 42 });
      buf.reset();
      expect(codec.decode(buf)).toEqual({ id: 42 });
    });

    it('encoding is 1 bit longer than non-extensible equivalent', () => {
      const nonExtCodec = new SequenceCodec({
        fields: [
          { name: 'id', codec: new (require('../../src/codecs/IntegerCodec').IntegerCodec)({ min: 0, max: 255 }) },
        ],
        // no extensionFields → not extensible
      });

      const extBuf = BitBuffer.alloc();
      codec.encode(extBuf, { id: 42 });

      const nonExtBuf = BitBuffer.alloc();
      nonExtCodec.encode(nonExtBuf, { id: 42 });

      expect(extBuf.bitLength).toBe(nonExtBuf.bitLength + 1);
    });
  });

  describe('EnumeratedCodec with empty extension values (marker only)', () => {
    const codec = new EnumeratedCodec({
      values: ['red', 'green', 'blue'],
      extensionValues: [], // marker present, no extension values
    });

    it('is extensible', () => {
      expect(codec.extensible).toBe(true);
    });

    it('writes extension bit 0 for root values', () => {
      const buf = BitBuffer.alloc();
      codec.encode(buf, 'red');
      buf.reset();
      expect(buf.readBit()).toBe(0); // ext bit = 0
    });

    it('round-trips root values', () => {
      for (const val of ['red', 'green', 'blue']) {
        const buf = BitBuffer.alloc();
        codec.encode(buf, val);
        buf.reset();
        expect(codec.decode(buf)).toBe(val);
      }
    });

    it('throws for unknown value (no extension values defined)', () => {
      const buf = BitBuffer.alloc();
      expect(() => codec.encode(buf, 'yellow')).toThrow('Unknown enumerated value');
    });

    it('encoding is 1 bit longer than non-extensible equivalent', () => {
      const nonExtCodec = new EnumeratedCodec({
        values: ['red', 'green', 'blue'],
      });

      const extBuf = BitBuffer.alloc();
      codec.encode(extBuf, 'red');

      const nonExtBuf = BitBuffer.alloc();
      nonExtCodec.encode(nonExtBuf, 'red');

      expect(extBuf.bitLength).toBe(nonExtBuf.bitLength + 1);
    });
  });

  describe('ChoiceCodec with empty extension alternatives (marker only)', () => {
    const codec = new ChoiceCodec({
      alternatives: [
        { name: 'flag', codec: new (require('../../src/codecs/BooleanCodec').BooleanCodec)() },
        { name: 'count', codec: new (require('../../src/codecs/IntegerCodec').IntegerCodec)({ min: 0, max: 255 }) },
      ],
      extensionAlternatives: [], // marker present, no extension alternatives
    });

    it('is extensible', () => {
      expect(codec.extensible).toBe(true);
    });

    it('writes extension bit 0 for root alternatives', () => {
      const buf = BitBuffer.alloc();
      codec.encode(buf, { key: 'flag', value: true });
      buf.reset();
      expect(buf.readBit()).toBe(0); // ext bit = 0
    });

    it('round-trips root alternatives', () => {
      const buf = BitBuffer.alloc();
      codec.encode(buf, { key: 'count', value: 42 });
      buf.reset();
      const result = codec.decode(buf);
      expect(result.key).toBe('count');
      expect(result.value).toBe(42);
    });

    it('throws for unknown alternative (no extensions defined)', () => {
      const buf = BitBuffer.alloc();
      expect(() => codec.encode(buf, { key: 'unknown', value: null })).toThrow(
        "Unknown CHOICE alternative: 'unknown'",
      );
    });
  });
});

describe('Extension marker: end-to-end (ASN.1 text → encode/decode)', () => {
  it('SEQUENCE with marker only parses to extensible codec', () => {
    const mod = parseAsn1Module(`
      Test DEFINITIONS ::= BEGIN
        Msg ::= SEQUENCE {
          id INTEGER (0..255),
          ...
        }
      END
    `);
    const schemas = convertModuleToSchemaNodes(mod);
    const codec = new SchemaCodec(schemas['Msg']);

    const hex = codec.encodeToHex({ id: 42 });
    const decoded = codec.decodeFromHex(hex);
    expect(decoded).toEqual({ id: 42 });

    // Verify the extension bit is present by checking encoding size
    // Non-extensible: 8 bits (constrained integer 0..255)
    // Extensible: 9 bits (1 ext bit + 8 value bits) → 2 bytes padded
    const buf = BitBuffer.alloc();
    SchemaBuilder.build(schemas['Msg']).encode(buf, { id: 42 });
    expect(buf.bitLength).toBe(9); // 1 ext bit + 8 data bits
  });

  it('ENUMERATED with marker only parses to extensible codec', () => {
    const mod = parseAsn1Module(`
      Test DEFINITIONS ::= BEGIN
        Color ::= ENUMERATED { red, green, blue, ... }
      END
    `);
    const schemas = convertModuleToSchemaNodes(mod);
    const codec = new SchemaCodec(schemas['Color']);

    const hex = codec.encodeToHex('green');
    const decoded = codec.decodeFromHex(hex);
    expect(decoded).toBe('green');
  });

  it('CHOICE with marker only parses to extensible codec', () => {
    const mod = parseAsn1Module(`
      Test DEFINITIONS ::= BEGIN
        Val ::= CHOICE { flag BOOLEAN, ... }
      END
    `);
    const schemas = convertModuleToSchemaNodes(mod);
    const codec = new SchemaCodec(schemas['Val']);

    const hex = codec.encodeToHex({ key: 'flag', value: true });
    const decoded = codec.decodeFromHex(hex);
    expect(decoded).toEqual({ key: 'flag', value: true });
  });

  it('SEQUENCE v1 (marker only) is forward-compatible with v2 (with additions)', () => {
    const v1Mod = parseAsn1Module(`
      Test DEFINITIONS ::= BEGIN
        Msg ::= SEQUENCE {
          id INTEGER (0..255),
          ...
        }
      END
    `);
    const v2Mod = parseAsn1Module(`
      Test DEFINITIONS ::= BEGIN
        Msg ::= SEQUENCE {
          id INTEGER (0..255),
          ...,
          name IA5String (SIZE (1..50))
        }
      END
    `);

    const v1Schema = convertModuleToSchemaNodes(v1Mod)['Msg'];
    const v2Schema = convertModuleToSchemaNodes(v2Mod)['Msg'];

    const v1Codec = new SchemaCodec(v1Schema);
    const v2Codec = new SchemaCodec(v2Schema);

    // v1 data can be decoded by v2
    const v1Hex = v1Codec.encodeToHex({ id: 42 });
    const v1ByV2 = v2Codec.decodeFromHex(v1Hex);
    expect(v1ByV2).toEqual({ id: 42 });

    // v2 data with extensions can be decoded by v1 (skips unknown extensions)
    const v2Hex = v2Codec.encodeToHex({ id: 100, name: 'hello' });
    const v2ByV1 = v1Codec.decodeFromHex(v2Hex);
    expect(v2ByV1).toEqual({ id: 100 });
  });

  it('complex module with multiple extensible types', () => {
    const mod = parseAsn1Module(`
      Test DEFINITIONS ::= BEGIN
        Status ::= ENUMERATED { active, inactive, ... }

        Record ::= SEQUENCE {
          id     INTEGER (0..65535),
          status Status,
          ...,
          notes  IA5String (SIZE (0..200)) OPTIONAL
        }
      END
    `);
    const schemas = convertModuleToSchemaNodes(mod);
    const codec = new SchemaCodec(schemas['Record']);

    // Encode with root fields only
    const hex1 = codec.encodeToHex({ id: 1, status: 'active' });
    expect(codec.decodeFromHex(hex1)).toEqual({ id: 1, status: 'active' });

    // Encode with extension field
    const hex2 = codec.encodeToHex({ id: 2, status: 'inactive', notes: 'test' });
    expect(codec.decodeFromHex(hex2)).toEqual({ id: 2, status: 'inactive', notes: 'test' });
  });
});
