import { parseAsn1Module } from '../../src/parser/AsnParser';
import { convertModuleToSchemaNodes } from '../../src/parser/toSchemaNode';
import { SchemaCodec } from '../../src/schema/SchemaCodec';
import { BitBuffer } from '../../src/BitBuffer';
import { SchemaBuilder } from '../../src/schema/SchemaBuilder';

describe('OBJECT IDENTIFIER end-to-end', () => {
  describe('standalone OID field', () => {
    const mod = parseAsn1Module(`
      Test DEFINITIONS ::= BEGIN
        MyOid ::= OBJECT IDENTIFIER
      END
    `);
    const schemas = convertModuleToSchemaNodes(mod);
    const codec = new SchemaCodec(schemas['MyOid']);

    it('round-trips a simple OID', () => {
      const encoded = codec.encode('1.2.3');
      const decoded = codec.decode(encoded);
      expect(decoded).toBe('1.2.3');
    });

    it('round-trips RSA OID via hex', () => {
      const hex = codec.encodeToHex('1.2.840.113549.1.1.1');
      const decoded = codec.decodeFromHex(hex);
      expect(decoded).toBe('1.2.840.113549.1.1.1');
    });
  });

  describe('SEQUENCE with OID fields', () => {
    const mod = parseAsn1Module(`
      Test DEFINITIONS ::= BEGIN
        CertInfo ::= SEQUENCE {
          algorithm OBJECT IDENTIFIER,
          version INTEGER (0..255),
          issuer IA5String
        }
      END
    `);
    const schemas = convertModuleToSchemaNodes(mod);
    const codec = new SchemaCodec(schemas['CertInfo']);

    it('round-trips a SEQUENCE containing an OID', () => {
      const value = {
        algorithm: '1.2.840.113549.1.1.11',
        version: 2,
        issuer: 'TestCA',
      };
      const encoded = codec.encode(value);
      const decoded = codec.decode(encoded);
      expect(decoded).toEqual(value);
    });

    it('round-trips with different OID values', () => {
      const values = [
        { algorithm: '2.16.840.1.101.3.4.2.1', version: 0, issuer: 'SHA256' },
        { algorithm: '1.2.840.10045.2.1', version: 1, issuer: 'EC' },
        { algorithm: '2.5.29.17', version: 255, issuer: 'SAN' },
      ];
      for (const value of values) {
        const encoded = codec.encode(value);
        const decoded = codec.decode(encoded);
        expect(decoded).toEqual(value);
      }
    });
  });

  describe('SEQUENCE with OPTIONAL OID fields', () => {
    const mod = parseAsn1Module(`
      Test DEFINITIONS ::= BEGIN
        AlgInfo ::= SEQUENCE {
          name IA5String,
          sigAlg OBJECT IDENTIFIER OPTIONAL,
          keyAlg OBJECT IDENTIFIER OPTIONAL,
          keySize INTEGER (0..65535)
        }
      END
    `);
    const schemas = convertModuleToSchemaNodes(mod);
    const codec = new SchemaCodec(schemas['AlgInfo']);

    it('round-trips with all optional OID fields present', () => {
      const value = {
        name: 'RSA-SHA256',
        sigAlg: '1.2.840.113549.1.1.11',
        keyAlg: '1.2.840.113549.1.1.1',
        keySize: 2048,
      };
      const encoded = codec.encode(value);
      const decoded = codec.decode(encoded);
      expect(decoded).toEqual(value);
    });

    it('round-trips with no optional OID fields', () => {
      const value = {
        name: 'Unknown',
        keySize: 256,
      };
      const encoded = codec.encode(value);
      const decoded = codec.decode(encoded);
      expect(decoded).toEqual(value);
    });

    it('round-trips with one optional OID field present', () => {
      const value = {
        name: 'EC',
        keyAlg: '1.2.840.10045.2.1',
        keySize: 384,
      };
      const encoded = codec.encode(value);
      const decoded = codec.decode(encoded);
      expect(decoded).toEqual(value);
    });
  });

  describe('CHOICE with OID alternative', () => {
    const mod = parseAsn1Module(`
      Test DEFINITIONS ::= BEGIN
        IdOrName ::= CHOICE {
          oid OBJECT IDENTIFIER,
          name IA5String
        }
      END
    `);
    const schemas = convertModuleToSchemaNodes(mod);
    const codec = new SchemaCodec(schemas['IdOrName']);

    it('round-trips OID alternative', () => {
      const value = { key: 'oid', value: '1.2.840.113549' };
      const encoded = codec.encode(value);
      const decoded = codec.decode(encoded);
      expect(decoded).toEqual(value);
    });

    it('round-trips string alternative', () => {
      const value = { key: 'name', value: 'myAlgorithm' };
      const encoded = codec.encode(value);
      const decoded = codec.decode(encoded);
      expect(decoded).toEqual(value);
    });
  });

  describe('SEQUENCE OF OID', () => {
    const mod = parseAsn1Module(`
      Test DEFINITIONS ::= BEGIN
        OidList ::= SEQUENCE (SIZE (1..10)) OF OBJECT IDENTIFIER
      END
    `);
    const schemas = convertModuleToSchemaNodes(mod);
    const codec = new SchemaCodec(schemas['OidList']);

    it('round-trips a list of OIDs', () => {
      const value = [
        '1.2.840.113549.1.1.1',
        '1.2.840.113549.1.1.11',
        '2.16.840.1.101.3.4.2.1',
      ];
      const encoded = codec.encode(value);
      const decoded = codec.decode(encoded);
      expect(decoded).toEqual(value);
    });
  });

  describe('UIC barcode schema with native OID', () => {
    const fs = require('fs');
    const path = require('path');
    const asnText = fs.readFileSync(
      path.join(__dirname, '..', 'fixtures', 'uicBarcodeHeader_v2.0.1.asn'),
      'utf-8',
    );
    const mod = parseAsn1Module(asnText);
    const schemas = convertModuleToSchemaNodes(mod);

    it('builds all codecs including native OID fields', () => {
      for (const name of Object.keys(schemas)) {
        const codec = SchemaBuilder.build(schemas[name]);
        expect(codec).toBeDefined();
      }
    });

    it('round-trips Level1DataType with OID fields', () => {
      const codec = new SchemaCodec(schemas['Level1DataType']);
      const value = {
        securityProviderNum: 1234,
        securityProviderIA5: 'SNCF',
        keyId: 42,
        dataSequence: [
          { dataFormat: 'U_FLEX', data: new Uint8Array([0x01, 0x02]) },
        ],
        level1KeyAlg: '1.2.840.113549.1.1.1',
        level2KeyAlg: '1.2.840.10045.2.1',
        level1SigningAlg: '1.2.840.113549.1.1.11',
        level2SigningAlg: '1.2.840.10045.4.3.2',
        level2PublicKey: new Uint8Array([0xAA, 0xBB]),
        endOfValidityYear: 2025,
        endOfValidityDay: 180,
        endOfValidityTime: 720,
        validityDuration: 60,
      };
      const encoded = codec.encode(value);
      const decoded = codec.decode(encoded);
      expect(decoded).toEqual(value);
    });

    it('round-trips Level1DataType with OID fields omitted (optional)', () => {
      const codec = new SchemaCodec(schemas['Level1DataType']);
      const value = {
        dataSequence: [
          { dataFormat: 'U_FLEX', data: new Uint8Array([0x01]) },
        ],
      };
      const encoded = codec.encode(value);
      const decoded = codec.decode(encoded);
      expect(decoded).toEqual(value);
    });
  });
});
