import { parseAsn1Module } from '../../src/parser/AsnParser';
import { convertModuleToSchemaNodes } from '../../src/parser/toSchemaNode';
import { SchemaBuilder } from '../../src/schema/SchemaBuilder';
import type { AsnModule, AsnSequenceType, AsnSequenceOfType, AsnConstrainedType } from '../../src/parser/types';

const ASN_TEXT = `
SampleProtocol DEFINITIONS AUTOMATIC TAGS ::= BEGIN

  Envelope ::= SEQUENCE {
    version IA5String,
    payload SignedPayload,
    checksum OCTET STRING OPTIONAL
  }

  SignedPayload ::= SEQUENCE {
    header HeaderInfo,
    signature OCTET STRING,
    body DataBlock
  }

  HeaderInfo ::= SEQUENCE {
    providerId INTEGER (1..32000) OPTIONAL,
    providerName IA5String OPTIONAL,
    keyId INTEGER (0..255),
    dataBlocks SEQUENCE OF DataBlock,
    keyAlg OBJECT IDENTIFIER OPTIONAL,
    signingAlg OBJECT IDENTIFIER OPTIONAL,
    encryptionAlg OBJECT IDENTIFIER OPTIONAL,
    verificationAlg OBJECT IDENTIFIER OPTIONAL,
    publicKey OCTET STRING OPTIONAL,
    expiryYear INTEGER (2000..2200) OPTIONAL,
    expiryDay INTEGER (1..366) OPTIONAL,
    expiryMinute INTEGER (0..1439) OPTIONAL,
    validMinutes INTEGER (0..525600) OPTIONAL
  }

  DataBlock ::= SEQUENCE {
    blockType IA5String,
    data OCTET STRING
  }

END
`;

describe('Complex schema parsing', () => {
  let module: AsnModule;

  beforeAll(() => {
    module = parseAsn1Module(ASN_TEXT);
  });

  describe('parsing', () => {
    it('parses the module name', () => {
      expect(module.name).toBe('SampleProtocol');
    });

    it('parses AUTOMATIC TAGS', () => {
      expect(module.tagMode).toBe('AUTOMATIC');
    });

    it('finds all 4 type assignments', () => {
      const names = module.assignments.map(a => a.name);
      expect(names).toEqual([
        'Envelope',
        'SignedPayload',
        'HeaderInfo',
        'DataBlock',
      ]);
    });

    it('parses Envelope as SEQUENCE with 3 fields', () => {
      const type = module.assignments[0].type as AsnSequenceType;
      expect(type.kind).toBe('SEQUENCE');
      expect(type.fields).toHaveLength(3);
      expect(type.fields[0].name).toBe('version');
      expect(type.fields[1].name).toBe('payload');
      expect(type.fields[2].name).toBe('checksum');
      expect(type.fields[2].optional).toBe(true);
    });

    it('parses HeaderInfo with 13 fields', () => {
      const type = module.assignments[2].type as AsnSequenceType;
      expect(type.kind).toBe('SEQUENCE');
      expect(type.fields).toHaveLength(13);
    });

    it('parses INTEGER constraints correctly', () => {
      const type = module.assignments[2].type as AsnSequenceType;
      const field = type.fields[0];
      expect(field.name).toBe('providerId');
      expect(field.optional).toBe(true);
      const ct = field.type as AsnConstrainedType;
      expect(ct.kind).toBe('ConstrainedType');
      expect(ct.baseType.kind).toBe('INTEGER');
      expect(ct.constraint.min).toBe(1);
      expect(ct.constraint.max).toBe(32000);
    });

    it('parses SEQUENCE OF DataBlock', () => {
      const type = module.assignments[2].type as AsnSequenceType;
      const field = type.fields[3];
      expect(field.name).toBe('dataBlocks');
      const seqOf = field.type as AsnSequenceOfType;
      expect(seqOf.kind).toBe('SEQUENCE OF');
      expect(seqOf.itemType.kind).toBe('TypeReference');
    });

    it('parses OBJECT IDENTIFIER fields', () => {
      const type = module.assignments[2].type as AsnSequenceType;
      const field = type.fields[4];
      expect(field.name).toBe('keyAlg');
      expect(field.type.kind).toBe('OBJECT IDENTIFIER');
      expect(field.optional).toBe(true);
    });

    it('parses DataBlock as SEQUENCE with 2 fields', () => {
      const type = module.assignments[3].type as AsnSequenceType;
      expect(type.kind).toBe('SEQUENCE');
      expect(type.fields).toHaveLength(2);
      expect(type.fields[0].name).toBe('blockType');
      expect(type.fields[1].name).toBe('data');
    });
  });

  describe('conversion to SchemaNode', () => {
    it('converts all 4 types including OBJECT IDENTIFIER fields', () => {
      const schemas = convertModuleToSchemaNodes(module);
      expect(Object.keys(schemas)).toEqual([
        'Envelope',
        'SignedPayload',
        'HeaderInfo',
        'DataBlock',
      ]);
    });

    it('converts OBJECT IDENTIFIER fields natively', () => {
      const schemas = convertModuleToSchemaNodes(module);
      const header = schemas['HeaderInfo'] as {
        type: string;
        fields: Array<{ name: string; schema: { type: string }; optional?: boolean }>;
      };
      const oidField = header.fields.find(f => f.name === 'keyAlg')!;
      expect(oidField.schema).toEqual({ type: 'OBJECT IDENTIFIER' });
      expect(oidField.optional).toBe(true);
    });

    it('retains all 13 fields in HeaderInfo including OID fields', () => {
      const schemas = convertModuleToSchemaNodes(module);
      const header = schemas['HeaderInfo'] as {
        type: string;
        fields: Array<{ name: string }>;
      };
      expect(header.fields).toHaveLength(13);
      const fieldNames = header.fields.map(f => f.name);
      expect(fieldNames).toContain('keyAlg');
      expect(fieldNames).toContain('signingAlg');
      expect(fieldNames).toContain('encryptionAlg');
      expect(fieldNames).toContain('verificationAlg');
    });

    it('produces correct DataBlock schema', () => {
      const schemas = convertModuleToSchemaNodes(module);
      expect(schemas['DataBlock']).toEqual({
        type: 'SEQUENCE',
        fields: [
          { name: 'blockType', schema: { type: 'IA5String' } },
          { name: 'data', schema: { type: 'OCTET STRING' } },
        ],
      });
    });

    it('resolves type references in Envelope', () => {
      const schemas = convertModuleToSchemaNodes(module);
      const envelope = schemas['Envelope'] as {
        type: string;
        fields: Array<{ name: string; schema: { type: string } }>;
      };
      expect(envelope.fields[1].name).toBe('payload');
      expect(envelope.fields[1].schema.type).toBe('SEQUENCE');
    });

    it('preserves INTEGER constraints after conversion', () => {
      const schemas = convertModuleToSchemaNodes(module);
      const header = schemas['HeaderInfo'] as {
        type: string;
        fields: Array<{ name: string; schema: { type: string; min?: number; max?: number }; optional?: boolean }>;
      };
      const providerField = header.fields.find(f => f.name === 'providerId')!;
      expect(providerField.schema).toEqual({
        type: 'INTEGER',
        min: 1,
        max: 32000,
      });
      expect(providerField.optional).toBe(true);
    });

    it('can build codecs from all types', () => {
      const schemas = convertModuleToSchemaNodes(module);
      for (const name of Object.keys(schemas)) {
        const codec = SchemaBuilder.build(schemas[name]);
        expect(codec).toBeDefined();
        expect(codec.encode).toBeInstanceOf(Function);
        expect(codec.decode).toBeInstanceOf(Function);
      }
    });
  });
});
