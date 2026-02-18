import { BitBuffer } from '../src/BitBuffer';

describe('BitBuffer.writeRawBits', () => {
  it('writes zero bits (no-op)', () => {
    const buf = BitBuffer.alloc();
    buf.writeRawBits(new Uint8Array(0), 0);
    expect(buf.bitLength).toBe(0);
  });

  it('writes full bytes', () => {
    const buf = BitBuffer.alloc();
    buf.writeRawBits(new Uint8Array([0xab, 0xcd]), 16);
    buf.reset();
    expect(buf.readOctets(2)).toEqual(new Uint8Array([0xab, 0xcd]));
  });

  it('writes partial byte (sub-byte precision)', () => {
    const buf = BitBuffer.alloc();
    // 0xf0 = 11110000, write only 4 bits = 1111
    buf.writeRawBits(new Uint8Array([0xf0]), 4);
    expect(buf.bitLength).toBe(4);
    buf.reset();
    expect(buf.readBits(4)).toBe(0b1111);
  });

  it('writes at non-byte-aligned offset', () => {
    const buf = BitBuffer.alloc();
    buf.writeBit(1); // 1 bit prefix
    buf.writeRawBits(new Uint8Array([0xff]), 8);
    expect(buf.bitLength).toBe(9);
    buf.reset();
    expect(buf.readBit()).toBe(1);
    expect(buf.readBits(8)).toBe(0xff);
  });

  it('is inverse of extractBits (round-trip)', () => {
    const src = BitBuffer.alloc();
    src.writeBits(0b10110, 5);
    src.writeBits(0xff, 8);
    const extracted = src.extractBits(0, 13);

    const dst = BitBuffer.alloc();
    dst.writeRawBits(extracted, 13);
    expect(dst.bitLength).toBe(13);
    dst.reset();
    expect(dst.readBits(5)).toBe(0b10110);
    expect(dst.readBits(8)).toBe(0xff);
  });

  it('throws for negative bitLength', () => {
    const buf = BitBuffer.alloc();
    expect(() => buf.writeRawBits(new Uint8Array([0xff]), -1)).toThrow();
  });

  it('throws when bitLength exceeds data capacity', () => {
    const buf = BitBuffer.alloc();
    expect(() => buf.writeRawBits(new Uint8Array([0xff]), 9)).toThrow();
  });
});
