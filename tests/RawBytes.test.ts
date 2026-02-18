import { RawBytes, isRawBytes } from '../src/RawBytes';

describe('RawBytes', () => {
  it('stores data and defaults bitLength to data.length * 8', () => {
    const raw = new RawBytes(new Uint8Array([0xab, 0xcd]));
    expect(raw.data).toEqual(new Uint8Array([0xab, 0xcd]));
    expect(raw.bitLength).toBe(16);
  });

  it('accepts explicit bitLength for sub-byte precision', () => {
    const raw = new RawBytes(new Uint8Array([0xf0]), 4);
    expect(raw.bitLength).toBe(4);
  });

  it('throws for negative bitLength', () => {
    expect(() => new RawBytes(new Uint8Array([0xff]), -1)).toThrow();
  });

  it('throws when bitLength exceeds data capacity', () => {
    expect(() => new RawBytes(new Uint8Array([0xff]), 9)).toThrow();
  });

  it('allows bitLength of 0', () => {
    const raw = new RawBytes(new Uint8Array(0), 0);
    expect(raw.bitLength).toBe(0);
  });

  it('allows empty data with default bitLength', () => {
    const raw = new RawBytes(new Uint8Array(0));
    expect(raw.bitLength).toBe(0);
  });
});

describe('isRawBytes', () => {
  it('returns true for RawBytes instances', () => {
    expect(isRawBytes(new RawBytes(new Uint8Array([0xab])))).toBe(true);
  });

  it('returns false for plain Uint8Array', () => {
    expect(isRawBytes(new Uint8Array([0xab]))).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isRawBytes(42)).toBe(false);
    expect(isRawBytes('hello')).toBe(false);
    expect(isRawBytes(null)).toBe(false);
    expect(isRawBytes(undefined)).toBe(false);
  });
});
