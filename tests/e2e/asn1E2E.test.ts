/**
 * End-to-end tests: ASN.1 text -> parser -> schema -> codec -> PER encode/decode.
 *
 * Tests the full pipeline using sample ASN.1 type definitions that exercise
 * extensible ENUMERATEDs, OPTIONAL/DEFAULT fields, negative INTEGER ranges,
 * OCTET STRING SIZE constraints, and type references.
 *
 * Every test is a round-trip test: encode a value, decode the result, and
 * verify it equals the original. The two "known hex" tests additionally
 * verify the encoded output matches reference hex values.
 */
import { parseAsn1Module } from '../../src/parser/AsnParser';
import { convertModuleToSchemaNodes } from '../../src/parser/toSchemaNode';
import { SchemaCodec } from '../../src/schema/SchemaCodec';
import { SchemaBuilder } from '../../src/schema/SchemaBuilder';
import type { SchemaNode } from '../../src/schema/SchemaBuilder';
import { BitBuffer } from '../../src/BitBuffer';

/**
 * ASN.1 module with sample types exercising:
 * - SalesChannelType (ENUMERATED with extension marker)
 * - SalesPointInfo (SEQUENCE with all-OPTIONAL fields and extension marker)
 * - IssuingData (SEQUENCE with type references, OCTET STRING SIZE, extension marker)
 * - DynamicSessionData (SEQUENCE with DEFAULT, negative ranges, extension marker)
 */
const SAMPLE_MODULE = `
SampleModule DEFINITIONS ::= BEGIN

  SalesChannelType ::= ENUMERATED {
    onlinePurchase (0),
    mobileApp (1),
    webPortal (2),
    serviceDesk (3),
    selfServiceKiosk (4),
    inVehicleTerminal (5),
    vendingMachine (6),
    ...
  }

  SalesPointInfo ::= SEQUENCE {
    salesChannel SalesChannelType OPTIONAL,
    generatorId INTEGER (0..255) OPTIONAL,
    serverId INTEGER (0..255) OPTIONAL,
    vendorId INTEGER (0..4095) OPTIONAL,
    locationId INTEGER OPTIONAL,
    ...
  }

  IssuingData ::= SEQUENCE {
    protocolVersion INTEGER (0..7),
    protocolInstance INTEGER (0..7),
    networkId OCTET STRING (SIZE (3)),
    salesPoint SalesPointInfo OPTIONAL,
    ...
  }

  DynamicSessionData ::= SEQUENCE {
    sessionDay INTEGER (-1..1070) DEFAULT 0,
    sessionTime INTEGER (0..86399) OPTIONAL,
    sessionUTCOffset INTEGER (-60..60) OPTIONAL,
    sessionDuration INTEGER (0..86399) OPTIONAL,
    ...
  }

END
`;

describe('End-to-end: ASN.1 parse -> schema -> PER encode/decode', () => {

  // ---------------------------------------------------------------------------
  // IssuingData
  // ---------------------------------------------------------------------------
  describe('IssuingData', () => {
    let codec: SchemaCodec;

    const VALUE = {
      protocolVersion: 1,
      protocolInstance: 1,
      networkId: new Uint8Array([0x25, 0x09, 0x15]),
      salesPoint: {
        salesChannel: 'mobileApp',
        generatorId: 0,
        serverId: 32,
        vendorId: 1037,
        locationId: 6,
      },
    };

    // Expected hex (11 bytes)
    const EXPECTED_HEX = '492509157c400810340418';

    beforeAll(() => {
      const module = parseAsn1Module(SAMPLE_MODULE);
      const schemas = convertModuleToSchemaNodes(module);
      codec = new SchemaCodec(schemas['IssuingData']);
    });

    it('round-trips spec value and matches expected hex', () => {
      const hex = codec.encodeToHex(VALUE);
      expect(hex).toBe(EXPECTED_HEX);
      expect(hex.length / 2).toBe(11);
      expect(codec.decodeFromHex(hex)).toEqual(VALUE);
    });

    it('round-trips without optional salesPoint', () => {
      const value = {
        protocolVersion: 1,
        protocolInstance: 1,
        networkId: new Uint8Array([0x25, 0x09, 0x15]),
      };
      const hex = codec.encodeToHex(value);
      const decoded = codec.decodeFromHex(hex) as Record<string, unknown>;
      expect(decoded).toEqual(value);
      expect(decoded.salesPoint).toBeUndefined();
    });

    it('produces smaller encoding when optional fields are absent', () => {
      const hexFull = codec.encodeToHex(VALUE);
      const valueNoSalesPoint = {
        protocolVersion: 1,
        protocolInstance: 1,
        networkId: new Uint8Array([0x25, 0x09, 0x15]),
      };
      const hexNoSalesPoint = codec.encodeToHex(valueNoSalesPoint);
      expect(hexNoSalesPoint.length).toBeLessThan(hexFull.length);
      expect(codec.decodeFromHex(hexFull)).toEqual(VALUE);
      expect(codec.decodeFromHex(hexNoSalesPoint)).toEqual(valueNoSalesPoint);
    });

    it('round-trips with partial SalesPointInfo (some optional fields)', () => {
      const value = {
        protocolVersion: 2,
        protocolInstance: 0,
        networkId: new Uint8Array([0x00, 0x00, 0x01]),
        salesPoint: {
          salesChannel: 'webPortal',
          vendorId: 100,
        },
      };
      expect(codec.decodeFromHex(codec.encodeToHex(value))).toEqual(value);
    });

    it('round-trips all SalesChannelType enum values', () => {
      const channels = [
        'onlinePurchase', 'mobileApp', 'webPortal', 'serviceDesk',
        'selfServiceKiosk', 'inVehicleTerminal', 'vendingMachine',
      ];
      for (const channel of channels) {
        const value = {
          protocolVersion: 0,
          protocolInstance: 0,
          networkId: new Uint8Array([0x00, 0x00, 0x00]),
          salesPoint: { salesChannel: channel },
        };
        expect(codec.decodeFromHex(codec.encodeToHex(value))).toEqual(value);
      }
    });

    it('round-trips constraint boundary values', () => {
      const value = {
        protocolVersion: 7,
        protocolInstance: 7,
        networkId: new Uint8Array([0xFF, 0xFF, 0xFF]),
        salesPoint: {
          generatorId: 255,
          serverId: 255,
          vendorId: 4095,
        },
      };
      expect(codec.decodeFromHex(codec.encodeToHex(value))).toEqual(value);
    });
  });

  // ---------------------------------------------------------------------------
  // DynamicSessionData
  // ---------------------------------------------------------------------------
  describe('DynamicSessionData', () => {
    let codec: SchemaCodec;

    const VALUE = {
      sessionDay: 0,
      sessionTime: 59710,
      sessionUTCOffset: -8,
      sessionDuration: 600,
    };

    // Expected hex (6 bytes)
    const EXPECTED_HEX = '3ba4f9a00960';

    beforeAll(() => {
      const module = parseAsn1Module(SAMPLE_MODULE);
      const schemas = convertModuleToSchemaNodes(module);
      codec = new SchemaCodec(schemas['DynamicSessionData']);
    });

    it('round-trips spec value and matches expected hex', () => {
      const hex = codec.encodeToHex(VALUE);
      expect(hex).toBe(EXPECTED_HEX);
      expect(hex.length / 2).toBe(6);
      expect(codec.decodeFromHex(hex)).toEqual(VALUE);
    });

    it('round-trips DEFAULT value (sessionDay=0) with optional fields', () => {
      const valueWithDefault = { sessionDay: 0, sessionTime: 100 };
      expect(codec.decodeFromHex(codec.encodeToHex(valueWithDefault))).toEqual(valueWithDefault);

      const valueWithNonDefault = { sessionDay: 5, sessionTime: 100 };
      expect(codec.decodeFromHex(codec.encodeToHex(valueWithNonDefault))).toEqual(valueWithNonDefault);

      expect(codec.encodeToHex(valueWithNonDefault).length).toBeGreaterThanOrEqual(
        codec.encodeToHex(valueWithDefault).length,
      );
    });

    it('round-trips negative constraint values (sessionDay=-1)', () => {
      const value = { sessionDay: -1, sessionTime: 0 };
      expect(codec.decodeFromHex(codec.encodeToHex(value))).toEqual(value);
    });

    it('round-trips negative UTC offset', () => {
      const value = { sessionDay: 0, sessionUTCOffset: -60 };
      expect(codec.decodeFromHex(codec.encodeToHex(value))).toEqual(value);
    });

    it('round-trips positive UTC offset', () => {
      const value = { sessionDay: 0, sessionUTCOffset: 60 };
      expect(codec.decodeFromHex(codec.encodeToHex(value))).toEqual(value);
    });

    it('round-trips constraint boundary max values', () => {
      const value = {
        sessionDay: 1070,
        sessionTime: 86399,
        sessionUTCOffset: 60,
        sessionDuration: 86399,
      };
      expect(codec.decodeFromHex(codec.encodeToHex(value))).toEqual(value);
    });

    it('round-trips constraint boundary min values', () => {
      const value = {
        sessionDay: -1,
        sessionTime: 0,
        sessionUTCOffset: -60,
        sessionDuration: 0,
      };
      expect(codec.decodeFromHex(codec.encodeToHex(value))).toEqual(value);
    });

    it('round-trips minimal data (all optional absent, default used)', () => {
      const value = { sessionDay: 0 };
      const decoded = codec.decodeFromHex(codec.encodeToHex(value)) as Record<string, unknown>;
      expect(decoded.sessionDay).toBe(0);
      expect(decoded.sessionTime).toBeUndefined();
      expect(decoded.sessionUTCOffset).toBeUndefined();
      expect(decoded.sessionDuration).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Nested SEQUENCE with OID fields (inline ASN.1)
  // ---------------------------------------------------------------------------
  describe('Nested SEQUENCE with OID fields', () => {
    const PROTOCOL_MODULE = `
ProtocolModule DEFINITIONS AUTOMATIC TAGS ::= BEGIN

  Envelope ::= SEQUENCE {
    format IA5String,
    signedPayload SignedPayload,
    outerSignature OCTET STRING OPTIONAL
  }

  SignedPayload ::= SEQUENCE {
    header HeaderInfo,
    innerSignature OCTET STRING,
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

    let schemas: Record<string, SchemaNode>;

    beforeAll(() => {
      const module = parseAsn1Module(PROTOCOL_MODULE);
      schemas = convertModuleToSchemaNodes(module);
    });

    it('builds codecs for all 4 types', () => {
      expect(Object.keys(schemas)).toHaveLength(4);
      for (const typeName of Object.keys(schemas)) {
        const codec = new SchemaCodec(schemas[typeName]);
        expect(codec).toBeDefined();
      }
    });

    it('round-trips DataBlock with realistic values', () => {
      const codec = new SchemaCodec(schemas['DataBlock']);
      const value = {
        blockType: 'FCB2',
        data: new Uint8Array([0x22, 0x21, 0x01, 0xCE]),
      };
      expect(codec.decodeFromHex(codec.encodeToHex(value))).toEqual(value);
    });

    it('round-trips HeaderInfo with OID fields', () => {
      const codec = new SchemaCodec(schemas['HeaderInfo']);

      const payload = new Uint8Array([
        0x22, 0x21, 0x01, 0xCE, 0xC0, 0x87, 0x87, 0xC6,
        0x42, 0x2F, 0xB3, 0x6E, 0xC1, 0x9C, 0x99, 0x2C,
      ]);
      const publicKey = new Uint8Array([
        0x03, 0x54, 0x64, 0x5D, 0x7E, 0x8E, 0x43, 0x81,
        0x3C, 0x4C, 0x32, 0x9C, 0xED, 0x33, 0xE8, 0x64,
        0x60, 0x52, 0x32, 0x14, 0x87, 0x41, 0x85, 0x77,
        0x59, 0x17, 0xF4, 0x3C, 0x62, 0x92, 0x77, 0x96, 0xE7,
      ]);

      const value = {
        providerId: 3703,
        keyId: 1,
        dataBlocks: [
          { blockType: 'FCB2', data: payload },
        ],
        keyAlg: '1.2.840.113549.1.1.1',
        signingAlg: '1.2.840.10045.2.1',
        encryptionAlg: '1.2.840.113549.1.1.11',
        verificationAlg: '1.2.840.10045.4.3.2',
        publicKey: publicKey,
      };

      expect(codec.decodeFromHex(codec.encodeToHex(value))).toEqual(value);
    });

    it('round-trips HeaderInfo without optional OID fields', () => {
      const codec = new SchemaCodec(schemas['HeaderInfo']);

      const value = {
        providerId: 3703,
        keyId: 1,
        dataBlocks: [
          { blockType: 'FCB2', data: new Uint8Array([0x01]) },
        ],
        publicKey: new Uint8Array([0x03, 0x54]),
      };

      const decoded = codec.decodeFromHex(codec.encodeToHex(value)) as Record<string, unknown>;
      expect(decoded).toEqual(value);
      expect(decoded.keyAlg).toBeUndefined();
      expect(decoded.signingAlg).toBeUndefined();
      expect(decoded.encryptionAlg).toBeUndefined();
      expect(decoded.verificationAlg).toBeUndefined();
    });

    it('round-trips SignedPayload with signature and body', () => {
      const codec = new SchemaCodec(schemas['SignedPayload']);

      const fakeSig = new Uint8Array(Array(64).fill(0x11));
      const bodyData = new Uint8Array([0x3B, 0xA4, 0xF9, 0xA0, 0x09, 0x60]);

      const value = {
        header: {
          providerId: 3703,
          keyId: 1,
          dataBlocks: [
            { blockType: 'FCB2', data: new Uint8Array([0x01]) },
          ],
        },
        innerSignature: fakeSig,
        body: {
          blockType: 'DYN1',
          data: bodyData,
        },
      };

      expect(codec.decodeFromHex(codec.encodeToHex(value))).toEqual(value);
    });

    it('round-trips full Envelope with all nested data', () => {
      const codec = new SchemaCodec(schemas['Envelope']);

      const innerSig = new Uint8Array(Array(64).fill(0x11));
      const outerSig = new Uint8Array(Array(64).fill(0x22));

      const value = {
        format: 'V1',
        signedPayload: {
          header: {
            providerId: 3703,
            keyId: 1,
            dataBlocks: [
              {
                blockType: 'FCB2',
                data: new Uint8Array([0xAA, 0xBB, 0xCC]),
              },
            ],
            keyAlg: '2.16.840.1.101.3.4.2.1',
            publicKey: new Uint8Array([0x03, 0x54]),
          },
          innerSignature: innerSig,
          body: {
            blockType: 'DYN1',
            data: new Uint8Array([0x3B, 0xA4, 0xF9, 0xA0, 0x09, 0x60]),
          },
        },
        outerSignature: outerSig,
      };

      expect(codec.decodeFromHex(codec.encodeToHex(value))).toEqual(value);
    });

    it('round-trips Envelope without optional fields', () => {
      const codec = new SchemaCodec(schemas['Envelope']);

      const value = {
        format: 'V1',
        signedPayload: {
          header: {
            keyId: 0,
            dataBlocks: [
              { blockType: 'TEST', data: new Uint8Array([0x00]) },
            ],
          },
          innerSignature: new Uint8Array([0x00]),
          body: {
            blockType: 'TEST',
            data: new Uint8Array([0x00]),
          },
        },
      };

      const decoded = codec.decodeFromHex(codec.encodeToHex(value)) as Record<string, unknown>;
      expect(decoded).toEqual(value);
      expect(decoded.outerSignature).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Recursive type: ASN.1 parse -> schema -> encode/decode round-trip
  // ---------------------------------------------------------------------------
  describe('Recursive types (ASN.1 -> schema -> encode/decode)', () => {
    const RECURSIVE_MODULE = `
RecursiveTest DEFINITIONS AUTOMATIC TAGS ::= BEGIN

  TreeNode ::= SEQUENCE {
    label   IA5String,
    value   INTEGER (0..9999),
    children SEQUENCE (SIZE (0..10)) OF TreeNode OPTIONAL
  }

  RouteNode ::= SEQUENCE {
    stationId INTEGER (1..9999999),
    border    BOOLEAN,
    alternativeRoutes SEQUENCE (SIZE (0..5)) OF RouteNode OPTIONAL,
    route     SEQUENCE (SIZE (0..5)) OF RouteNode OPTIONAL
  }

END
    `;

    let schemas: Record<string, SchemaNode>;
    let codecs: Record<string, import('../../src/codecs/Codec').Codec<unknown>>;

    beforeAll(() => {
      const module = parseAsn1Module(RECURSIVE_MODULE);
      schemas = convertModuleToSchemaNodes(module);
      codecs = SchemaBuilder.buildAll(schemas);
    });

    it('parses recursive types without infinite recursion', () => {
      expect(schemas['TreeNode']).toBeDefined();
      expect(schemas['RouteNode']).toBeDefined();
    });

    it('produces $ref nodes for recursive references', () => {
      const tree = schemas['TreeNode'] as any;
      expect(tree.fields[2].schema.item).toEqual({ type: '$ref', ref: 'TreeNode' });

      const route = schemas['RouteNode'] as any;
      expect(route.fields[2].schema.item).toEqual({ type: '$ref', ref: 'RouteNode' });
      expect(route.fields[3].schema.item).toEqual({ type: '$ref', ref: 'RouteNode' });
    });

    it('builds codecs via buildAll without errors', () => {
      expect(codecs['TreeNode']).toBeDefined();
      expect(codecs['RouteNode']).toBeDefined();
    });

    it('round-trips a leaf TreeNode (depth 0)', () => {
      const codec = codecs['TreeNode'];
      const leaf = { label: 'leaf', value: 42 };

      const buf = BitBuffer.alloc();
      codec.encode(buf, leaf);
      buf.reset();
      expect(codec.decode(buf)).toEqual(leaf);
    });

    it('round-trips a TreeNode with 1 level of children (depth 1)', () => {
      const codec = codecs['TreeNode'];
      const doc = {
        label: 'root',
        value: 1,
        children: [
          { label: 'a', value: 10 },
          { label: 'b', value: 20 },
        ],
      };

      const buf = BitBuffer.alloc();
      codec.encode(buf, doc);
      buf.reset();
      expect(codec.decode(buf)).toEqual(doc);
    });

    it('round-trips a TreeNode with 3 levels of nesting', () => {
      const codec = codecs['TreeNode'];

      const doc = {
        label: 'root',
        value: 0,
        children: [
          {
            label: 'child-A',
            value: 1,
            children: [
              {
                label: 'gc-A1',
                value: 11,
                children: [
                  { label: 'ggc-A1a', value: 111 },
                  { label: 'ggc-A1b', value: 112 },
                ],
              },
              { label: 'gc-A2', value: 12 },
            ],
          },
          {
            label: 'child-B',
            value: 2,
            children: [
              {
                label: 'gc-B1',
                value: 21,
                children: [
                  { label: 'ggc-B1a', value: 211 },
                ],
              },
            ],
          },
        ],
      };

      const buf = BitBuffer.alloc();
      codec.encode(buf, doc);
      buf.reset();
      const decoded = codec.decode(buf);
      expect(decoded).toEqual(doc);
    });

    it('round-trips a RouteNode with 3 levels using both recursive fields', () => {
      const codec = codecs['RouteNode'];

      const doc = {
        stationId: 8000105,
        border: false,
        route: [
          {
            stationId: 8000261,
            border: false,
            alternativeRoutes: [
              {
                stationId: 8000244,
                border: false,
                route: [
                  { stationId: 8000105, border: false },
                ],
              },
              {
                stationId: 8000250,
                border: false,
                route: [
                  { stationId: 8000105, border: false },
                ],
              },
            ],
            route: [
              {
                stationId: 8000191,
                border: false,
                route: [
                  { stationId: 8000284, border: false },
                ],
              },
            ],
          },
        ],
      };

      const buf = BitBuffer.alloc();
      codec.encode(buf, doc);
      buf.reset();
      const decoded = codec.decode(buf);
      expect(decoded).toEqual(doc);
    });

    it('encoded output is deterministic (same input = same bytes)', () => {
      const codec = codecs['TreeNode'];
      const doc = {
        label: 'det',
        value: 99,
        children: [
          { label: 'x', value: 1, children: [{ label: 'y', value: 2 }] },
        ],
      };

      const buf1 = BitBuffer.alloc();
      codec.encode(buf1, doc);
      const buf2 = BitBuffer.alloc();
      codec.encode(buf2, doc);

      expect(buf1.toHex()).toBe(buf2.toHex());
    });
  });

  // ---------------------------------------------------------------------------
  // Cross-type encoding: multiple types from the same module
  // ---------------------------------------------------------------------------
  describe('Combined module cross-type tests', () => {
    let schemas: Record<string, SchemaNode>;

    beforeAll(() => {
      const module = parseAsn1Module(SAMPLE_MODULE);
      schemas = convertModuleToSchemaNodes(module);
    });

    it('round-trips both types matching reference hex', () => {
      const issuingCodec = new SchemaCodec(schemas['IssuingData']);
      const dynamicCodec = new SchemaCodec(schemas['DynamicSessionData']);

      const issuingValue = {
        protocolVersion: 1,
        protocolInstance: 1,
        networkId: new Uint8Array([0x25, 0x09, 0x15]),
        salesPoint: {
          salesChannel: 'mobileApp',
          generatorId: 0,
          serverId: 32,
          vendorId: 1037,
          locationId: 6,
        },
      };
      const issuingHex = issuingCodec.encodeToHex(issuingValue);
      expect(issuingHex).toBe('492509157c400810340418');
      expect(issuingCodec.decodeFromHex(issuingHex)).toEqual(issuingValue);

      const dynamicValue = {
        sessionDay: 0,
        sessionTime: 59710,
        sessionUTCOffset: -8,
        sessionDuration: 600,
      };
      const dynamicHex = dynamicCodec.encodeToHex(dynamicValue);
      expect(dynamicHex).toBe('3ba4f9a00960');
      expect(dynamicCodec.decodeFromHex(dynamicHex)).toEqual(dynamicValue);
    });

    it('round-trips SalesChannelType as standalone extensible enum', () => {
      const codec = new SchemaCodec(schemas['SalesChannelType']);

      const allValues = [
        'onlinePurchase', 'mobileApp', 'webPortal', 'serviceDesk',
        'selfServiceKiosk', 'inVehicleTerminal', 'vendingMachine',
      ];
      for (const val of allValues) {
        expect(codec.decodeFromHex(codec.encodeToHex(val))).toBe(val);
      }
    });

    it('round-trips SalesPointInfo as standalone type', () => {
      const codec = new SchemaCodec(schemas['SalesPointInfo']);

      const value = {
        salesChannel: 'vendingMachine',
        generatorId: 255,
        serverId: 128,
        vendorId: 2000,
        locationId: 100,
      };
      expect(codec.decodeFromHex(codec.encodeToHex(value))).toEqual(value);
    });

    it('round-trips dynamic data encoded as standalone bytes', () => {
      const dynamicCodec = new SchemaCodec(schemas['DynamicSessionData']);

      const dynamicValue = {
        sessionDay: 0,
        sessionTime: 59710,
        sessionUTCOffset: -8,
        sessionDuration: 600,
      };

      const dynamicBytes = dynamicCodec.encode(dynamicValue);
      expect(dynamicBytes).toEqual(new Uint8Array([0x3B, 0xA4, 0xF9, 0xA0, 0x09, 0x60]));

      expect(dynamicCodec.decode(dynamicBytes)).toEqual(dynamicValue);
    });
  });
});
