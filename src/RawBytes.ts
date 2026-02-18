/**
 * Wraps pre-encoded PER bytes for passthrough encoding.
 * When the encoder encounters a RawBytes value for any field,
 * it writes the bits directly to the BitBuffer instead of
 * calling the field's codec.
 *
 * @param data - Pre-encoded bytes (left-aligned, as produced by BitBuffer.toUint8Array())
 * @param bitLength - Number of valid bits in data. Defaults to data.length * 8.
 *                     Use this for sub-byte precision when trailing bits are padding.
 */
export class RawBytes {
  readonly data: Uint8Array;
  readonly bitLength: number;

  constructor(data: Uint8Array, bitLength?: number) {
    this.data = data;
    this.bitLength = bitLength ?? data.length * 8;

    if (this.bitLength < 0) {
      throw new Error(`RawBytes: bitLength must be non-negative, got ${this.bitLength}`);
    }
    if (this.bitLength > data.length * 8) {
      throw new Error(
        `RawBytes: bitLength (${this.bitLength}) exceeds data capacity (${data.length * 8} bits)`
      );
    }
  }
}

/** Type guard: checks if a value is a RawBytes instance. */
export function isRawBytes(value: unknown): value is RawBytes {
  return value instanceof RawBytes;
}
