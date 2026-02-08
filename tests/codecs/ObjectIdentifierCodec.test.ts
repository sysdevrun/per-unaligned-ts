import { BitBuffer } from '../../src/BitBuffer';
import { ObjectIdentifierCodec } from '../../src/codecs/ObjectIdentifierCodec';

describe('ObjectIdentifierCodec', () => {
  const codec = new ObjectIdentifierCodec();

  function roundTrip(oid: string): string {
    const buf = BitBuffer.alloc();
    codec.encode(buf, oid);
    buf.reset();
    return codec.decode(buf);
  }

  describe('encode/decode roundtrip', () => {
    it('round-trips a simple OID (1.2.3)', () => {
      expect(roundTrip('1.2.3')).toBe('1.2.3');
    });

    it('round-trips OID with first arc 0 (0.0)', () => {
      expect(roundTrip('0.0')).toBe('0.0');
    });

    it('round-trips OID with first arc 0 (0.39)', () => {
      expect(roundTrip('0.39')).toBe('0.39');
    });

    it('round-trips OID with first arc 1 (1.0)', () => {
      expect(roundTrip('1.0')).toBe('1.0');
    });

    it('round-trips OID with first arc 1 (1.39)', () => {
      expect(roundTrip('1.39')).toBe('1.39');
    });

    it('round-trips OID with first arc 2 (2.0)', () => {
      expect(roundTrip('2.0')).toBe('2.0');
    });

    it('round-trips OID with first arc 2 and large second arc (2.999)', () => {
      expect(roundTrip('2.999')).toBe('2.999');
    });

    it('round-trips RSA OID (1.2.840.113549.1.1.1)', () => {
      expect(roundTrip('1.2.840.113549.1.1.1')).toBe('1.2.840.113549.1.1.1');
    });

    it('round-trips SHA-256 with RSA OID (1.2.840.113549.1.1.11)', () => {
      expect(roundTrip('1.2.840.113549.1.1.11')).toBe('1.2.840.113549.1.1.11');
    });

    it('round-trips id-ecPublicKey OID (1.2.840.10045.2.1)', () => {
      expect(roundTrip('1.2.840.10045.2.1')).toBe('1.2.840.10045.2.1');
    });

    it('round-trips id-sha256 OID (2.16.840.1.101.3.4.2.1)', () => {
      expect(roundTrip('2.16.840.1.101.3.4.2.1')).toBe('2.16.840.1.101.3.4.2.1');
    });

    it('round-trips id-ce-subjectAltName (2.5.29.17)', () => {
      expect(roundTrip('2.5.29.17')).toBe('2.5.29.17');
    });

    it('round-trips OID with large arc values', () => {
      expect(roundTrip('1.2.840.113549')).toBe('1.2.840.113549');
    });

    it('round-trips minimal OID (0.0)', () => {
      expect(roundTrip('0.0')).toBe('0.0');
    });
  });

  describe('known BER encodings', () => {
    it('encodes 1.2.840.113549.1.1.1 to known bytes', () => {
      // RSA OID: 1.2.840.113549.1.1.1
      // BER contents: 2a 86 48 86 f7 0d 01 01 01
      const buf = BitBuffer.alloc();
      codec.encode(buf, '1.2.840.113549.1.1.1');
      const bytes = buf.toUint8Array();

      // First byte is unconstrained length (9 octets → 0x09 with leading 0 bit = 00001001)
      // Then the 9 BER content bytes
      buf.reset();
      const len = buf.readBits(8); // 0 + 7-bit length = 9
      expect(len & 0x7f).toBe(9);

      const content = buf.readOctets(9);
      expect(Array.from(content)).toEqual([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]);
    });

    it('decodes known BER bytes for 2.5.29.17', () => {
      // id-ce-subjectAltName: 2.5.29.17
      // BER contents: 55 1d 11
      // PER: unconstrained length (3) + content
      const buf = BitBuffer.alloc();
      // Write unconstrained length: 0 + 7-bit(3) = 00000011
      buf.writeBit(0);
      buf.writeBits(3, 7);
      // Write BER content octets
      buf.writeOctets(new Uint8Array([0x55, 0x1d, 0x11]));
      buf.reset();

      expect(codec.decode(buf)).toBe('2.5.29.17');
    });
  });

  describe('validation errors', () => {
    it('throws for OID with less than 2 components', () => {
      const buf = BitBuffer.alloc();
      expect(() => codec.encode(buf, '1')).toThrow('at least 2 components');
    });

    it('throws for OID with first arc > 2', () => {
      const buf = BitBuffer.alloc();
      expect(() => codec.encode(buf, '3.0')).toThrow('first arc must be 0, 1, or 2');
    });

    it('throws for OID with second arc > 39 when first arc is 0', () => {
      const buf = BitBuffer.alloc();
      expect(() => codec.encode(buf, '0.40')).toThrow('second arc must be 0..39');
    });

    it('throws for OID with second arc > 39 when first arc is 1', () => {
      const buf = BitBuffer.alloc();
      expect(() => codec.encode(buf, '1.40')).toThrow('second arc must be 0..39');
    });

    it('allows second arc > 39 when first arc is 2', () => {
      // arc 2 can have second component > 39
      expect(roundTrip('2.999')).toBe('2.999');
    });

    it('throws for non-numeric OID component', () => {
      const buf = BitBuffer.alloc();
      expect(() => codec.encode(buf, '1.2.abc')).toThrow('Invalid OID component');
    });

    it('throws for negative OID component', () => {
      const buf = BitBuffer.alloc();
      expect(() => codec.encode(buf, '1.2.-3')).toThrow('Invalid OID component');
    });

    it('throws for empty string', () => {
      const buf = BitBuffer.alloc();
      expect(() => codec.encode(buf, '')).toThrow();
    });
  });

  describe('multiple OIDs in same buffer', () => {
    it('encodes and decodes multiple consecutive OIDs', () => {
      const oids = ['1.2.3', '2.5.29.17', '1.2.840.113549.1.1.11'];
      const buf = BitBuffer.alloc();
      for (const oid of oids) {
        codec.encode(buf, oid);
      }
      buf.reset();
      for (const oid of oids) {
        expect(codec.decode(buf)).toBe(oid);
      }
    });
  });
});
