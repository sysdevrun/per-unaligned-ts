import * as fs from 'fs';
import * as path from 'path';
import { parseAsn1Module } from '../../src/parser/AsnParser';
import { convertModuleToSchemaNodes } from '../../src/parser/toSchemaNode';
import { SchemaBuilder } from '../../src/schema/SchemaBuilder';
import type { AsnModule, AsnSequenceType, AsnSequenceOfType, AsnConstrainedType } from '../../src/parser/types';

const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'uicBarcodeHeader_v2.0.1.asn');
const asnText = fs.readFileSync(FIXTURE_PATH, 'utf-8');

describe('UIC Barcode Header schema', () => {
  let module: AsnModule;

  beforeAll(() => {
    module = parseAsn1Module(asnText);
  });

  describe('parsing', () => {
    it('parses the module name', () => {
      expect(module.name).toBe('ASN-Module-UicBarcodeHeader');
    });

    it('parses AUTOMATIC TAGS', () => {
      expect(module.tagMode).toBe('AUTOMATIC');
    });

    it('finds all 4 type assignments', () => {
      const names = module.assignments.map(a => a.name);
      expect(names).toEqual([
        'UicBarcodeHeader',
        'Level2DataType',
        'Level1DataType',
        'DataType',
      ]);
    });

    it('parses UicBarcodeHeader as SEQUENCE with 3 fields', () => {
      const type = module.assignments[0].type as AsnSequenceType;
      expect(type.kind).toBe('SEQUENCE');
      expect(type.fields).toHaveLength(3);
      expect(type.fields[0].name).toBe('format');
      expect(type.fields[1].name).toBe('level2SignedData');
      expect(type.fields[2].name).toBe('level2Signature');
      expect(type.fields[2].optional).toBe(true);
    });

    it('parses Level1DataType with 13 fields', () => {
      const type = module.assignments[2].type as AsnSequenceType;
      expect(type.kind).toBe('SEQUENCE');
      expect(type.fields).toHaveLength(13);
    });

    it('parses INTEGER constraints correctly', () => {
      const type = module.assignments[2].type as AsnSequenceType;
      // securityProviderNum INTEGER (1..32000) OPTIONAL
      const field = type.fields[0];
      expect(field.name).toBe('securityProviderNum');
      expect(field.optional).toBe(true);
      const ct = field.type as AsnConstrainedType;
      expect(ct.kind).toBe('ConstrainedType');
      expect(ct.baseType.kind).toBe('INTEGER');
      expect(ct.constraint.min).toBe(1);
      expect(ct.constraint.max).toBe(32000);
    });

    it('parses SEQUENCE OF DataType', () => {
      const type = module.assignments[2].type as AsnSequenceType;
      // dataSequence SEQUENCE OF DataType
      const field = type.fields[3];
      expect(field.name).toBe('dataSequence');
      const seqOf = field.type as AsnSequenceOfType;
      expect(seqOf.kind).toBe('SEQUENCE OF');
      expect(seqOf.itemType.kind).toBe('TypeReference');
    });

    it('parses OBJECT IDENTIFIER fields', () => {
      const type = module.assignments[2].type as AsnSequenceType;
      // level1KeyAlg OBJECT IDENTIFIER OPTIONAL
      const field = type.fields[4];
      expect(field.name).toBe('level1KeyAlg');
      expect(field.type.kind).toBe('OBJECT IDENTIFIER');
      expect(field.optional).toBe(true);
    });

    it('parses DataType as SEQUENCE with 2 fields', () => {
      const type = module.assignments[3].type as AsnSequenceType;
      expect(type.kind).toBe('SEQUENCE');
      expect(type.fields).toHaveLength(2);
      expect(type.fields[0].name).toBe('dataFormat');
      expect(type.fields[1].name).toBe('data');
    });
  });

  describe('conversion to SchemaNode', () => {
    it('throws when OBJECT IDENTIFIER fields are present (default)', () => {
      expect(() => convertModuleToSchemaNodes(module)).toThrow('OBJECT IDENTIFIER');
    });

    it('converts successfully with objectIdentifierHandling: "omit"', () => {
      const schemas = convertModuleToSchemaNodes(module, {
        objectIdentifierHandling: 'omit',
      });
      expect(Object.keys(schemas)).toEqual([
        'UicBarcodeHeader',
        'Level2DataType',
        'Level1DataType',
        'DataType',
      ]);
    });

    it('converts successfully with objectIdentifierHandling: "octetstring"', () => {
      const schemas = convertModuleToSchemaNodes(module, {
        objectIdentifierHandling: 'octetstring',
      });
      expect(Object.keys(schemas)).toHaveLength(4);
    });

    it('produces correct DataType schema', () => {
      const schemas = convertModuleToSchemaNodes(module, {
        objectIdentifierHandling: 'omit',
      });
      expect(schemas['DataType']).toEqual({
        type: 'SEQUENCE',
        fields: [
          { name: 'dataFormat', schema: { type: 'IA5String' } },
          { name: 'data', schema: { type: 'OCTET STRING' } },
        ],
      });
    });

    it('resolves type references in UicBarcodeHeader', () => {
      const schemas = convertModuleToSchemaNodes(module, {
        objectIdentifierHandling: 'omit',
      });
      const header = schemas['UicBarcodeHeader'] as {
        type: string;
        fields: Array<{ name: string; schema: { type: string } }>;
      };
      // level2SignedData should be resolved to Level2DataType's SEQUENCE
      expect(header.fields[1].name).toBe('level2SignedData');
      expect(header.fields[1].schema.type).toBe('SEQUENCE');
    });

    it('preserves INTEGER constraints after conversion', () => {
      const schemas = convertModuleToSchemaNodes(module, {
        objectIdentifierHandling: 'omit',
      });
      const level1 = schemas['Level1DataType'] as {
        type: string;
        fields: Array<{ name: string; schema: { type: string; min?: number; max?: number }; optional?: boolean }>;
      };
      // securityProviderNum INTEGER (1..32000) OPTIONAL
      const securityField = level1.fields.find(f => f.name === 'securityProviderNum')!;
      expect(securityField.schema).toEqual({
        type: 'INTEGER',
        min: 1,
        max: 32000,
      });
      expect(securityField.optional).toBe(true);
    });

    it('omits OBJECT IDENTIFIER fields from Level1DataType', () => {
      const schemas = convertModuleToSchemaNodes(module, {
        objectIdentifierHandling: 'omit',
      });
      const level1 = schemas['Level1DataType'] as {
        type: string;
        fields: Array<{ name: string }>;
      };
      const fieldNames = level1.fields.map(f => f.name);
      expect(fieldNames).not.toContain('level1KeyAlg');
      expect(fieldNames).not.toContain('level2KeyAlg');
      expect(fieldNames).not.toContain('level1SigningAlg');
      expect(fieldNames).not.toContain('level2SigningAlg');
      // Should have 13 - 4 OID fields = 9 fields
      expect(level1.fields).toHaveLength(9);
    });

    it('can build codecs from DataType schema', () => {
      const schemas = convertModuleToSchemaNodes(module, {
        objectIdentifierHandling: 'omit',
      });
      const codec = SchemaBuilder.build(schemas['DataType']);
      expect(codec).toBeDefined();
      expect(codec.encode).toBeInstanceOf(Function);
      expect(codec.decode).toBeInstanceOf(Function);
    });

    it('can build codecs from UicBarcodeHeader schema (with OID fields omitted)', () => {
      const schemas = convertModuleToSchemaNodes(module, {
        objectIdentifierHandling: 'omit',
      });
      // All four types should be buildable without OBJECT IDENTIFIER fields
      for (const name of Object.keys(schemas)) {
        const codec = SchemaBuilder.build(schemas[name]);
        expect(codec).toBeDefined();
      }
    });
  });
});
