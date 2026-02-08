import { parseAsn1Module } from '../../src/parser/AsnParser';
import { convertModuleToSchemaNodes } from '../../src/parser/toSchemaNode';
import type { SchemaNode } from '../../src/schema/SchemaBuilder';
import { SchemaBuilder } from '../../src/schema/SchemaBuilder';

function convertSingle(typeDef: string, options = {}): SchemaNode {
  const mod = parseAsn1Module(
    `Test DEFINITIONS ::= BEGIN\n  TestType ::= ${typeDef}\nEND`,
  );
  const schemas = convertModuleToSchemaNodes(mod, options);
  return schemas['TestType'];
}

describe('convertModuleToSchemaNodes', () => {
  describe('primitive types', () => {
    it('converts BOOLEAN', () => {
      expect(convertSingle('BOOLEAN')).toEqual({ type: 'BOOLEAN' });
    });

    it('converts NULL', () => {
      expect(convertSingle('NULL')).toEqual({ type: 'NULL' });
    });

    it('converts INTEGER', () => {
      expect(convertSingle('INTEGER')).toEqual({ type: 'INTEGER' });
    });

    it('converts BIT STRING', () => {
      expect(convertSingle('BIT STRING')).toEqual({ type: 'BIT STRING' });
    });

    it('converts OCTET STRING', () => {
      expect(convertSingle('OCTET STRING')).toEqual({ type: 'OCTET STRING' });
    });

    it('converts IA5String', () => {
      expect(convertSingle('IA5String')).toEqual({ type: 'IA5String' });
    });

    it('converts VisibleString', () => {
      expect(convertSingle('VisibleString')).toEqual({ type: 'VisibleString' });
    });

    it('converts UTF8String', () => {
      expect(convertSingle('UTF8String')).toEqual({ type: 'UTF8String' });
    });
  });

  describe('constrained types', () => {
    it('converts INTEGER with value constraint', () => {
      expect(convertSingle('INTEGER (0..255)')).toEqual({
        type: 'INTEGER',
        min: 0,
        max: 255,
      });
    });

    it('converts INTEGER with extensible constraint', () => {
      const schema = convertSingle('INTEGER (0..100, ...)');
      expect(schema).toEqual({
        type: 'INTEGER',
        min: 0,
        max: 100,
        extensible: true,
      });
    });

    it('converts OCTET STRING with SIZE constraint', () => {
      expect(convertSingle('OCTET STRING (SIZE (1..100))')).toEqual({
        type: 'OCTET STRING',
        minSize: 1,
        maxSize: 100,
      });
    });

    it('converts BIT STRING with fixed SIZE', () => {
      expect(convertSingle('BIT STRING (SIZE (8))')).toEqual({
        type: 'BIT STRING',
        fixedSize: 8,
      });
    });

    it('converts IA5String with SIZE constraint', () => {
      expect(convertSingle('IA5String (SIZE (1..50))')).toEqual({
        type: 'IA5String',
        minSize: 1,
        maxSize: 50,
      });
    });
  });

  describe('SEQUENCE', () => {
    it('converts simple SEQUENCE', () => {
      const schema = convertSingle('SEQUENCE { name IA5String, active BOOLEAN }');
      expect(schema).toEqual({
        type: 'SEQUENCE',
        fields: [
          { name: 'name', schema: { type: 'IA5String' } },
          { name: 'active', schema: { type: 'BOOLEAN' } },
        ],
      });
    });

    it('converts SEQUENCE with OPTIONAL fields', () => {
      const schema = convertSingle('SEQUENCE { name IA5String, extra INTEGER OPTIONAL }');
      expect(schema).toEqual({
        type: 'SEQUENCE',
        fields: [
          { name: 'name', schema: { type: 'IA5String' } },
          { name: 'extra', schema: { type: 'INTEGER' }, optional: true },
        ],
      });
    });

    it('converts SEQUENCE with DEFAULT values', () => {
      const schema = convertSingle('SEQUENCE { active BOOLEAN DEFAULT TRUE }');
      expect(schema).toEqual({
        type: 'SEQUENCE',
        fields: [
          { name: 'active', schema: { type: 'BOOLEAN' }, defaultValue: true },
        ],
      });
    });

    it('converts SEQUENCE with extension marker', () => {
      const schema = convertSingle('SEQUENCE { a BOOLEAN, ..., b INTEGER }');
      expect(schema).toEqual({
        type: 'SEQUENCE',
        fields: [
          { name: 'a', schema: { type: 'BOOLEAN' } },
        ],
        extensionFields: [
          { name: 'b', schema: { type: 'INTEGER' } },
        ],
      });
    });

    it('converts SEQUENCE with extension marker only (no additions)', () => {
      const schema = convertSingle('SEQUENCE { a BOOLEAN, ... }');
      expect(schema).toEqual({
        type: 'SEQUENCE',
        fields: [
          { name: 'a', schema: { type: 'BOOLEAN' } },
        ],
        extensionFields: [],
      });
    });
  });

  describe('SEQUENCE OF', () => {
    it('converts SEQUENCE OF', () => {
      const schema = convertSingle('SEQUENCE OF INTEGER');
      expect(schema).toEqual({
        type: 'SEQUENCE OF',
        item: { type: 'INTEGER' },
      });
    });

    it('converts SEQUENCE OF with SIZE constraint', () => {
      const schema = convertSingle('SEQUENCE (SIZE (1..10)) OF INTEGER');
      expect(schema).toEqual({
        type: 'SEQUENCE OF',
        item: { type: 'INTEGER' },
        minSize: 1,
        maxSize: 10,
      });
    });
  });

  describe('CHOICE', () => {
    it('converts simple CHOICE', () => {
      const schema = convertSingle('CHOICE { flag BOOLEAN, count INTEGER }');
      expect(schema).toEqual({
        type: 'CHOICE',
        alternatives: [
          { name: 'flag', schema: { type: 'BOOLEAN' } },
          { name: 'count', schema: { type: 'INTEGER' } },
        ],
      });
    });

    it('converts CHOICE with extensions', () => {
      const schema = convertSingle('CHOICE { a BOOLEAN, ..., b INTEGER }');
      expect(schema).toEqual({
        type: 'CHOICE',
        alternatives: [
          { name: 'a', schema: { type: 'BOOLEAN' } },
        ],
        extensionAlternatives: [
          { name: 'b', schema: { type: 'INTEGER' } },
        ],
      });
    });

    it('converts CHOICE with extension marker only (no additions)', () => {
      const schema = convertSingle('CHOICE { a BOOLEAN, ... }');
      expect(schema).toEqual({
        type: 'CHOICE',
        alternatives: [
          { name: 'a', schema: { type: 'BOOLEAN' } },
        ],
        extensionAlternatives: [],
      });
    });
  });

  describe('ENUMERATED', () => {
    it('converts simple ENUMERATED', () => {
      const schema = convertSingle('ENUMERATED { red, green, blue }');
      expect(schema).toEqual({
        type: 'ENUMERATED',
        values: ['red', 'green', 'blue'],
      });
    });

    it('converts ENUMERATED with extensions', () => {
      const schema = convertSingle('ENUMERATED { red, green, ..., yellow }');
      expect(schema).toEqual({
        type: 'ENUMERATED',
        values: ['red', 'green'],
        extensionValues: ['yellow'],
      });
    });

    it('converts ENUMERATED with extension marker only (no values)', () => {
      const schema = convertSingle('ENUMERATED { red, green, ... }');
      expect(schema).toEqual({
        type: 'ENUMERATED',
        values: ['red', 'green'],
        extensionValues: [],
      });
    });
  });

  describe('type references', () => {
    it('resolves type references within the module', () => {
      const mod = parseAsn1Module(`
        Test DEFINITIONS ::= BEGIN
          Inner ::= INTEGER (0..255)
          Outer ::= SEQUENCE { value Inner }
        END
      `);
      const schemas = convertModuleToSchemaNodes(mod);
      expect(schemas['Outer']).toEqual({
        type: 'SEQUENCE',
        fields: [
          { name: 'value', schema: { type: 'INTEGER', min: 0, max: 255 } },
        ],
      });
    });

    it('throws on unresolved type reference', () => {
      const mod = parseAsn1Module(`
        Test DEFINITIONS ::= BEGIN
          MyType ::= SEQUENCE { data UnknownType }
        END
      `);
      expect(() => convertModuleToSchemaNodes(mod)).toThrow('Unresolved type reference: UnknownType');
    });
  });

  describe('OBJECT IDENTIFIER handling', () => {
    it('converts OBJECT IDENTIFIER natively by default', () => {
      expect(convertSingle('OBJECT IDENTIFIER')).toEqual({ type: 'OBJECT IDENTIFIER' });
    });

    it('converts OBJECT IDENTIFIER natively with explicit option', () => {
      const schema = convertSingle('OBJECT IDENTIFIER', {
        objectIdentifierHandling: 'native',
      });
      expect(schema).toEqual({ type: 'OBJECT IDENTIFIER' });
    });

    it('throws when objectIdentifierHandling is "error"', () => {
      expect(() => convertSingle('OBJECT IDENTIFIER', {
        objectIdentifierHandling: 'error',
      })).toThrow('OBJECT IDENTIFIER');
    });

    it('substitutes OCTET STRING when objectIdentifierHandling is "octetstring"', () => {
      const schema = convertSingle('OBJECT IDENTIFIER', {
        objectIdentifierHandling: 'octetstring',
      });
      expect(schema).toEqual({ type: 'OCTET STRING' });
    });

    it('omits OBJECT IDENTIFIER fields when objectIdentifierHandling is "omit"', () => {
      const mod = parseAsn1Module(`
        Test DEFINITIONS ::= BEGIN
          TestType ::= SEQUENCE {
            name IA5String,
            oid OBJECT IDENTIFIER OPTIONAL,
            data OCTET STRING
          }
        END
      `);
      const schemas = convertModuleToSchemaNodes(mod, { objectIdentifierHandling: 'omit' });
      const seq = schemas['TestType'] as { type: string; fields: Array<{ name: string }> };
      expect(seq.fields).toHaveLength(2);
      expect(seq.fields[0].name).toBe('name');
      expect(seq.fields[1].name).toBe('data');
    });
  });

  describe('SchemaBuilder compatibility', () => {
    it('produces SchemaNode usable by SchemaBuilder', () => {
      const mod = parseAsn1Module(`
        Test DEFINITIONS ::= BEGIN
          MyType ::= SEQUENCE {
            id INTEGER (1..1000),
            name IA5String,
            active BOOLEAN OPTIONAL
          }
        END
      `);
      const schemas = convertModuleToSchemaNodes(mod);
      const codec = SchemaBuilder.build(schemas['MyType']);
      expect(codec).toBeDefined();
      expect(codec.encode).toBeInstanceOf(Function);
      expect(codec.decode).toBeInstanceOf(Function);
    });
  });
});
