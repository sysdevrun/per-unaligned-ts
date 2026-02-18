import { BitBuffer } from '../../src/BitBuffer';
import { RawBytes } from '../../src/RawBytes';
import { SequenceCodec } from '../../src/codecs/SequenceCodec';
import { ChoiceCodec } from '../../src/codecs/ChoiceCodec';
import { SequenceOfCodec } from '../../src/codecs/SequenceOfCodec';
import { IntegerCodec } from '../../src/codecs/IntegerCodec';
import { BooleanCodec } from '../../src/codecs/BooleanCodec';
import { SchemaCodec } from '../../src/schema/SchemaCodec';

describe('RawBytes passthrough', () => {
  describe('SequenceCodec', () => {
    const intCodec = new IntegerCodec({ min: 0, max: 255 });
    const boolCodec = new BooleanCodec();
    const seqCodec = new SequenceCodec({
      fields: [
        { name: 'id', codec: intCodec },
        { name: 'flag', codec: boolCodec },
      ],
    });

    it('encodes a RawBytes field in a SEQUENCE', () => {
      // Pre-encode the integer 42
      const tmpBuf = BitBuffer.alloc();
      intCodec.encode(tmpBuf, 42);
      const preEncoded = new RawBytes(tmpBuf.toUint8Array(), tmpBuf.bitLength);

      const buf = BitBuffer.alloc();
      seqCodec.encode(buf, { id: preEncoded, flag: true } as any);

      buf.reset();
      const result = seqCodec.decode(buf);
      expect(result.id).toBe(42);
      expect(result.flag).toBe(true);
    });

    it('produces identical output to normal encoding', () => {
      const tmpBuf = BitBuffer.alloc();
      intCodec.encode(tmpBuf, 42);
      const raw = new RawBytes(tmpBuf.toUint8Array(), tmpBuf.bitLength);

      const bufRaw = BitBuffer.alloc();
      seqCodec.encode(bufRaw, { id: raw, flag: true } as any);

      const bufNormal = BitBuffer.alloc();
      seqCodec.encode(bufNormal, { id: 42, flag: true });

      expect(bufRaw.toUint8Array()).toEqual(bufNormal.toUint8Array());
      expect(bufRaw.bitLength).toBe(bufNormal.bitLength);
    });

    it('encodes RawBytes for optional field', () => {
      const optSeq = new SequenceCodec({
        fields: [
          { name: 'x', codec: intCodec },
          { name: 'y', codec: intCodec, optional: true },
        ],
      });

      const tmpBuf = BitBuffer.alloc();
      intCodec.encode(tmpBuf, 100);
      const raw = new RawBytes(tmpBuf.toUint8Array(), tmpBuf.bitLength);

      const buf = BitBuffer.alloc();
      optSeq.encode(buf, { x: 5, y: raw } as any);
      buf.reset();
      expect(optSeq.decode(buf)).toEqual({ x: 5, y: 100 });
    });

    it('encodes RawBytes in extension field', () => {
      const extSeq = new SequenceCodec({
        fields: [{ name: 'x', codec: intCodec }],
        extensionFields: [{ name: 'ext', codec: boolCodec }],
      });

      const tmpBuf = BitBuffer.alloc();
      boolCodec.encode(tmpBuf, true);
      const raw = new RawBytes(tmpBuf.toUint8Array(), tmpBuf.bitLength);

      const buf = BitBuffer.alloc();
      extSeq.encode(buf, { x: 5, ext: raw } as any);
      buf.reset();
      const result = extSeq.decode(buf);
      expect(result.x).toBe(5);
      expect(result.ext).toBe(true);
    });
  });

  describe('ChoiceCodec', () => {
    it('encodes RawBytes as choice value (root)', () => {
      const codec = new ChoiceCodec({
        alternatives: [
          { name: 'a', codec: new BooleanCodec() },
          { name: 'b', codec: new IntegerCodec({ min: 0, max: 255 }) },
        ],
      });

      const tmpBuf = BitBuffer.alloc();
      new IntegerCodec({ min: 0, max: 255 }).encode(tmpBuf, 99);
      const raw = new RawBytes(tmpBuf.toUint8Array(), tmpBuf.bitLength);

      const buf = BitBuffer.alloc();
      codec.encode(buf, { key: 'b', value: raw });
      buf.reset();
      const result = codec.decode(buf);
      expect(result.key).toBe('b');
      expect(result.value).toBe(99);
    });

    it('encodes RawBytes as choice value (extension)', () => {
      const codec = new ChoiceCodec({
        alternatives: [{ name: 'a', codec: new BooleanCodec() }],
        extensionAlternatives: [
          { name: 'ext', codec: new IntegerCodec({ min: 0, max: 7 }) },
        ],
      });

      const tmpBuf = BitBuffer.alloc();
      new IntegerCodec({ min: 0, max: 7 }).encode(tmpBuf, 5);
      const raw = new RawBytes(tmpBuf.toUint8Array(), tmpBuf.bitLength);

      const buf = BitBuffer.alloc();
      codec.encode(buf, { key: 'ext', value: raw });
      buf.reset();
      const result = codec.decode(buf);
      expect(result.key).toBe('ext');
      expect(result.value).toBe(5);
    });
  });

  describe('SequenceOfCodec', () => {
    it('encodes RawBytes elements in SEQUENCE OF', () => {
      const itemCodec = new IntegerCodec({ min: 0, max: 255 });
      const seqOfCodec = new SequenceOfCodec({
        itemCodec,
        minSize: 0,
        maxSize: 5,
      });

      const tmpBuf = BitBuffer.alloc();
      itemCodec.encode(tmpBuf, 77);
      const raw = new RawBytes(tmpBuf.toUint8Array(), tmpBuf.bitLength);

      // Mix of raw and normal values
      const buf = BitBuffer.alloc();
      seqOfCodec.encode(buf, [10, raw, 30] as any);
      buf.reset();
      expect(seqOfCodec.decode(buf)).toEqual([10, 77, 30]);
    });
  });

  describe('SchemaCodec', () => {
    it('encodes RawBytes as top-level value', () => {
      const schema = { type: 'INTEGER' as const, min: 0, max: 255 };
      const codec = new SchemaCodec(schema);

      const preEncoded = codec.encode(42);
      const raw = new RawBytes(preEncoded, preEncoded.length * 8);

      const result = codec.encode(raw as any);
      expect(result).toEqual(preEncoded);
    });

    it('encodes RawBytes field in nested schema', () => {
      const innerSchema = {
        type: 'SEQUENCE' as const,
        fields: [
          { name: 'a', schema: { type: 'INTEGER' as const, min: 0, max: 7 } },
          { name: 'b', schema: { type: 'BOOLEAN' as const } },
        ],
      };
      const outerSchema = {
        type: 'SEQUENCE' as const,
        fields: [
          { name: 'header', schema: { type: 'INTEGER' as const, min: 0, max: 255 } },
          { name: 'inner', schema: innerSchema },
        ],
      };

      const innerCodec = new SchemaCodec(innerSchema);
      const outerCodec = new SchemaCodec(outerSchema);

      // Pre-encode the inner structure
      const innerBuf = BitBuffer.alloc();
      innerCodec.codec.encode(innerBuf, { a: 3, b: true });
      const innerRaw = new RawBytes(innerBuf.toUint8Array(), innerBuf.bitLength);

      // Encode outer with raw inner
      const outerBytes = outerCodec.encode({ header: 100, inner: innerRaw } as any);

      // Decode and verify
      const decoded = outerCodec.decode(outerBytes) as any;
      expect(decoded).toEqual({ header: 100, inner: { a: 3, b: true } });
    });

    it('encodeToHex works with RawBytes', () => {
      const schema = { type: 'INTEGER' as const, min: 0, max: 255 };
      const codec = new SchemaCodec(schema);

      const normalHex = codec.encodeToHex(42);
      const preEncoded = codec.encode(42);
      const raw = new RawBytes(preEncoded, preEncoded.length * 8);
      const rawHex = codec.encodeToHex(raw as any);

      expect(rawHex).toBe(normalHex);
    });
  });

  describe('sub-byte precision', () => {
    it('handles RawBytes with bitLength less than full bytes', () => {
      // INTEGER(0..7) encodes to 3 bits, but toUint8Array() gives 1 byte
      const intCodec = new IntegerCodec({ min: 0, max: 7 });
      const tmpBuf = BitBuffer.alloc();
      intCodec.encode(tmpBuf, 5); // 101 in 3 bits
      const data = tmpBuf.toUint8Array(); // 1 byte: 10100000

      const raw = new RawBytes(data, 3); // only 3 bits are valid

      const seqCodec = new SequenceCodec({
        fields: [
          { name: 'x', codec: intCodec },
          { name: 'y', codec: new BooleanCodec() },
        ],
      });

      const buf = BitBuffer.alloc();
      seqCodec.encode(buf, { x: raw, y: true } as any);
      buf.reset();
      const result = seqCodec.decode(buf);
      expect(result.x).toBe(5);
      expect(result.y).toBe(true);
    });

    it('without bitLength precision, extra bits corrupt following fields', () => {
      // This demonstrates why sub-byte precision matters
      const intCodec = new IntegerCodec({ min: 0, max: 7 });
      const tmpBuf = BitBuffer.alloc();
      intCodec.encode(tmpBuf, 5); // 101 in 3 bits
      const data = tmpBuf.toUint8Array(); // 1 byte with 5 trailing zeros

      // Using full byte length (8 bits) instead of actual 3 bits
      const rawFull = new RawBytes(data); // bitLength = 8

      const seqCodec = new SequenceCodec({
        fields: [
          { name: 'x', codec: intCodec },
          { name: 'y', codec: new BooleanCodec() },
        ],
      });

      const buf = BitBuffer.alloc();
      seqCodec.encode(buf, { x: rawFull, y: true } as any);
      buf.reset();
      const result = seqCodec.decode(buf);
      // x decodes correctly (first 3 bits are 101)
      expect(result.x).toBe(5);
      // y is corrupted because 5 padding zeros were written before it
      expect(result.y).not.toBe(true);
    });
  });
});
