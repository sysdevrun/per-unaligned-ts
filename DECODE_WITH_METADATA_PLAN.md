# Plan: `decodeWithMetadata` — Exposing Decoding Internals

## Goal

Add a `decodeWithMetadata` method to every codec that returns a recursive
tree of `DecodedNode` objects. Each node wraps the decoded value with
metadata: bit position, bit length, raw bytes (`Uint8Array`), the codec
that produced it, and schema-level flags (optional, present, default,
extension).

A companion `stripMetadata` function walks the tree and reconstructs the
plain JS object identical to today's `decode()` output. It dispatches on
the `codec` stored in each node — not by inspecting the value — and throws
if it encounters a codec type it does not handle.

## Types

### New file: `src/codecs/DecodedNode.ts`

```typescript
import type { Codec } from './Codec';

/** Metadata attached to every decoded node. */
interface FieldMeta {
  /** Start bit position in the source BitBuffer. */
  bitOffset: number;
  /** Number of bits consumed by this value's encoding. */
  bitLength: number;
  /**
   * Raw bytes of this value's encoding, extracted from the source buffer.
   * Bits are left-aligned in the first byte; trailing bits in the last
   * byte are zero-padded. This is identical to the standalone PER
   * encoding of the value's type.
   */
  rawBytes: Uint8Array;
  /** The codec instance that decoded this node. */
  codec: Codec<unknown>;
  /** Whether the schema declared this field OPTIONAL. */
  optional?: boolean;
  /** Whether this field was actually present in the encoding. */
  present?: boolean;
  /** Whether the DEFAULT value was used (field not explicitly encoded). */
  isDefault?: boolean;
  /** Whether this field is an extension addition. */
  isExtension?: boolean;
}

/** A decoded value wrapped with encoding metadata. */
interface DecodedNode {
  /**
   * The decoded value. Its shape depends on the codec:
   *
   * - Primitive codecs (Boolean, Integer, Enumerated, BitString,
   *   OctetString, UTF8String, ObjectIdentifier, Null):
   *   The raw JS value (boolean, number, string, Uint8Array, null, etc.)
   *
   * - SequenceCodec:
   *   Record<string, DecodedNode> — each field is a wrapped node.
   *
   * - SequenceOfCodec:
   *   DecodedNode[] — each array item is a wrapped node.
   *
   * - ChoiceCodec:
   *   { key: string; value: DecodedNode } — the selected alternative
   *   is a wrapped node.
   */
  value: unknown;
  meta: FieldMeta;
}
```

### `stripMetadata`

Defined in the same file. Dispatches on `node.meta.codec` using
`instanceof` checks — **not** by guessing from the value type:

```typescript
function stripMetadata(node: DecodedNode): unknown {
  const { value, meta } = node;
  const codec = meta.codec;

  if (
    codec instanceof BooleanCodec ||
    codec instanceof IntegerCodec ||
    codec instanceof EnumeratedCodec ||
    codec instanceof BitStringCodec ||
    codec instanceof OctetStringCodec ||
    codec instanceof UTF8StringCodec ||
    codec instanceof ObjectIdentifierCodec ||
    codec instanceof NullCodec
  ) {
    // Primitive: return the raw value as-is
    return value;
  }

  if (codec instanceof SequenceCodec) {
    // value is Record<string, DecodedNode>
    const fields = value as Record<string, DecodedNode>;
    const result: Record<string, unknown> = {};
    for (const [k, child] of Object.entries(fields)) {
      result[k] = stripMetadata(child);
    }
    return result;
  }

  if (codec instanceof SequenceOfCodec) {
    // value is DecodedNode[]
    const items = value as DecodedNode[];
    return items.map(item => stripMetadata(item));
  }

  if (codec instanceof ChoiceCodec) {
    // value is { key: string; value: DecodedNode }
    const choice = value as { key: string; value: DecodedNode };
    return { key: choice.key, value: stripMetadata(choice.value) };
  }

  // LazyCodec delegates to its resolved codec, so its decoded nodes
  // will carry the resolved codec instance, not the LazyCodec itself.
  // If we reach here, the codec type is unknown.
  throw new Error(
    `stripMetadata: unhandled codec type: ${codec.constructor.name}`
  );
}
```

Because every code path is explicit and codec-driven, adding a new codec
in the future without updating `stripMetadata` produces a clear runtime
error instead of silent corruption.

---

## Changes by file

### 1. `src/BitBuffer.ts` — add `extractBits`

One new method:

```typescript
/**
 * Extract a range of bits into a new byte-aligned Uint8Array.
 *
 * The extracted bits are left-aligned in the output: bit 0 of the result
 * corresponds to bit `startBit` of the source. Trailing bits in the last
 * byte are zero-padded.
 *
 * This produces bytes identical to a standalone PER encoding of the same
 * value (PER fields have no outer framing — the bits are the same, only
 * the byte boundary differs).
 */
extractBits(startBit: number, bitCount: number): Uint8Array {
  if (bitCount === 0) return new Uint8Array(0);
  const out = BitBuffer.alloc(Math.ceil(bitCount / 8));
  for (let i = 0; i < bitCount; i++) {
    const srcByte = (startBit + i) >> 3;
    const srcBitIdx = 7 - ((startBit + i) & 7);
    const bit = ((this._data[srcByte] >> srcBitIdx) & 1) as 0 | 1;
    out.writeBit(bit);
  }
  return out.toUint8Array();
}
```

Notes:
- Accesses `_data` directly (private), so it must be a method on
  `BitBuffer`, not an external helper.
- Does not alter the cursor (`_offset`).
- Returns `Uint8Array` (not hex). Callers can convert to hex if needed.

### 2. `src/codecs/Codec.ts` — extend interface

```typescript
import type { DecodedNode } from './DecodedNode';

interface Codec<T> {
  encode(buffer: BitBuffer, value: T): void;
  decode(buffer: BitBuffer): T;
  decodeWithMetadata(buffer: BitBuffer): DecodedNode;
}
```

`decodeWithMetadata` is a **required** method. Every codec must implement
it. This is a breaking change for any external `Codec` implementations,
but the library owns all codecs internally and there is no documented
extension point.

### 3. Primitive codecs (8 files, identical pattern)

Files: `BooleanCodec.ts`, `IntegerCodec.ts`, `EnumeratedCodec.ts`,
`BitStringCodec.ts`, `OctetStringCodec.ts`, `UTF8StringCodec.ts`,
`ObjectIdentifierCodec.ts`, `NullCodec.ts`

All 8 use the same helper to avoid duplication:

```typescript
// In DecodedNode.ts:
function primitiveDecodeWithMetadata(
  codec: Codec<unknown>,
  buffer: BitBuffer,
): DecodedNode {
  const bitOffset = buffer.offset;
  const value = codec.decode(buffer);
  const bitLength = buffer.offset - bitOffset;
  return {
    value,
    meta: {
      bitOffset,
      bitLength,
      rawBytes: buffer.extractBits(bitOffset, bitLength),
      codec,
    },
  };
}
```

Each primitive codec adds a one-liner:

```typescript
decodeWithMetadata(buffer: BitBuffer): DecodedNode {
  return primitiveDecodeWithMetadata(this, buffer);
}
```

### 4. `SequenceCodec.ts` — richest metadata

New method `decodeWithMetadata(buffer)` that mirrors `decode()` but:

- Records `bitOffset = buffer.offset` at the start.
- Calls `field.codec.decodeWithMetadata(buffer)` for each present field.
- For each field, sets `meta.optional`, `meta.present`, `meta.isDefault`,
  `meta.isExtension` on the child `DecodedNode`.
- For absent OPTIONAL fields (not present, no default), stores a node
  with `value: undefined`, `present: false`, `bitLength: 0`,
  `rawBytes: empty Uint8Array`.
- For DEFAULT fields using the default value, stores a node with
  `value: defaultValue`, `isDefault: true`, `present: false`,
  `bitLength: 0`, `rawBytes: empty Uint8Array`.
- The wrapping node's `value` is `Record<string, DecodedNode>`.
- At the end, computes `bitLength = buffer.offset - bitOffset` and
  `rawBytes = buffer.extractBits(bitOffset, bitLength)`.
- Sets `meta.codec = this` (the SequenceCodec instance).

Pseudocode for the root fields section:

```typescript
const fields: Record<string, DecodedNode> = {};
let optIdx = 0;

for (let i = 0; i < this.rootFields.length; i++) {
  const field = this.rootFields[i];
  const isOptOrDef = field.optional || field.defaultValue !== undefined;

  if (isOptOrDef) {
    const isPresent = preamble[optIdx++];
    if (isPresent) {
      const child = field.codec.decodeWithMetadata(buffer);
      child.meta.optional = field.optional;
      child.meta.present = true;
      fields[field.name] = child;
    } else if (field.defaultValue !== undefined) {
      fields[field.name] = {
        value: field.defaultValue,
        meta: {
          bitOffset: buffer.offset,
          bitLength: 0,
          rawBytes: new Uint8Array(0),
          codec: field.codec,
          optional: field.optional,
          present: false,
          isDefault: true,
        },
      };
    } else {
      // OPTIONAL, not present
      fields[field.name] = {
        value: undefined,
        meta: {
          bitOffset: buffer.offset,
          bitLength: 0,
          rawBytes: new Uint8Array(0),
          codec: field.codec,
          optional: true,
          present: false,
        },
      };
    }
  } else {
    // Mandatory
    const child = field.codec.decodeWithMetadata(buffer);
    child.meta.present = true;
    fields[field.name] = child;
  }
}
```

Extension fields follow the same pattern with `meta.isExtension = true`.

### 5. `SequenceOfCodec.ts`

New `decodeWithMetadata(buffer)`:

- Records `bitOffset`.
- Decodes the count (same logic as `decode`).
- Calls `itemCodec.decodeWithMetadata(buffer)` for each item.
- `value` is `DecodedNode[]`.
- Wraps in outer `DecodedNode` with `meta.codec = this`.

### 6. `ChoiceCodec.ts`

New `decodeWithMetadata(buffer)`:

- Records `bitOffset`.
- Determines the selected alternative (same logic as `decode`).
- Calls `alt.codec.decodeWithMetadata(buffer)` for the selected value.
- `value` is `{ key: string; value: DecodedNode }`.
- Wraps in outer `DecodedNode` with `meta.codec = this`.

### 7. `SchemaBuilder.ts` — `LazyCodec`

Add `decodeWithMetadata` that delegates:

```typescript
decodeWithMetadata(buffer: BitBuffer): DecodedNode {
  return this.codec.decodeWithMetadata(buffer);
}
```

The resolved codec's instance is stored in `meta.codec` of the returned
node — **not** the `LazyCodec` itself. This means `stripMetadata` never
sees a `LazyCodec`, only the concrete codec it resolved to.

### 8. `SchemaCodec.ts` — high-level API

Add two methods:

```typescript
/** Decode with full metadata tree. */
decodeWithMetadata(data: Uint8Array): DecodedNode {
  const buffer = BitBuffer.from(data);
  return this._codec.decodeWithMetadata(buffer);
}

/** Decode with metadata from hex. */
decodeFromHexWithMetadata(hex: string): DecodedNode {
  const bytes = new Uint8Array(
    hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
  );
  return this.decodeWithMetadata(bytes);
}
```

### 9. `src/codecs/DecodedNode.ts` — new file

Contains:
- `FieldMeta` interface
- `DecodedNode` interface
- `primitiveDecodeWithMetadata` helper
- `stripMetadata` function

### 10. Exports

`src/codecs/index.ts`:
```typescript
export type { DecodedNode, FieldMeta } from './DecodedNode';
export { stripMetadata, primitiveDecodeWithMetadata } from './DecodedNode';
```

`src/index.ts`:
```typescript
export type { DecodedNode, FieldMeta } from './codecs/DecodedNode';
export { stripMetadata } from './codecs/DecodedNode';
```

---

## How `stripMetadata` handles absent optional fields

When `SequenceCodec.decodeWithMetadata` produces a field with
`meta.present === false` and `meta.optional === true`:

- `stripMetadata` sees a `DecodedNode` whose `meta.codec` is (e.g.) an
  `IntegerCodec` and whose `value` is `undefined`.
- It hits the primitive branch and returns `undefined`.
- The caller (the SequenceCodec strip path) assigns `result[k] = undefined`.

This matches today's `decode()` behavior: optional absent fields are not
set on the result object (`undefined`). The caller can choose to skip
`undefined` entries or include them.

Actually, to match today's behavior exactly (key omitted, not set to
`undefined`), the SequenceCodec strip path should skip keys where the
child `meta.present === false` and `meta.optional === true` and
`meta.isDefault` is not set:

```typescript
if (codec instanceof SequenceCodec) {
  const fields = value as Record<string, DecodedNode>;
  const result: Record<string, unknown> = {};
  for (const [k, child] of Object.entries(fields)) {
    if (child.meta.optional && !child.meta.present && !child.meta.isDefault) {
      continue; // match decode() behavior: key not set
    }
    result[k] = stripMetadata(child);
  }
  return result;
}
```

---

## Behavioral contract

- **`decode()` is unchanged.** No performance impact on existing code.
  `decodeWithMetadata()` is a separate code path.

- **`stripMetadata(codec.decodeWithMetadata(buffer))`** produces output
  identical to **`codec.decode(buffer)`** for all codec types. This is
  the invariant that tests must verify.

- **`node.meta.rawBytes`** for any node is the PER encoding of that
  value as a standalone type. For a SEQUENCE field, this is the bits that
  were consumed for that field's encoding (not including the parent's
  preamble or extension overhead). For the SEQUENCE itself, `rawBytes`
  includes the extension marker, preamble, and all field encodings.

---

## Implementation order

### Phase 1: Core infrastructure
1. Add `extractBits` to `BitBuffer` + unit tests
2. Create `DecodedNode.ts` with types and `primitiveDecodeWithMetadata`
3. Add `decodeWithMetadata` to `Codec` interface

### Phase 2: Primitive codecs (can be done in parallel)
4. Add `decodeWithMetadata` to all 8 primitive codecs
5. Unit test each: verify `meta.bitOffset`, `meta.bitLength`, `meta.rawBytes`, `meta.codec`

### Phase 3: Composite codecs
6. `SequenceCodec.decodeWithMetadata` + tests
7. `SequenceOfCodec.decodeWithMetadata` + tests
8. `ChoiceCodec.decodeWithMetadata` + tests
9. `LazyCodec.decodeWithMetadata`

### Phase 4: High-level API
10. `SchemaCodec.decodeWithMetadata` + `decodeFromHexWithMetadata`
11. `stripMetadata` implementation + tests
12. Invariant test: `stripMetadata(decodeWithMetadata(x)) === decode(x)`
    for every existing test fixture

### Phase 5: Exports and integration
13. Update `src/codecs/index.ts` and `src/index.ts`
14. Update `intercode6-ts` to use metadata API if desired

---

## Scope estimate

| File | Change | ~Lines |
|------|--------|--------|
| `BitBuffer.ts` | `extractBits` method | +15 |
| `Codec.ts` | Add `decodeWithMetadata` to interface | +3 |
| `DecodedNode.ts` | New file: types + helpers + `stripMetadata` | +80 |
| 8 primitive codecs | 1 import + 1 method each | +24 |
| `SequenceCodec.ts` | `decodeWithMetadata` method | +65 |
| `SequenceOfCodec.ts` | `decodeWithMetadata` method | +25 |
| `ChoiceCodec.ts` | `decodeWithMetadata` method | +25 |
| `SchemaBuilder.ts` | `LazyCodec.decodeWithMetadata` | +5 |
| `SchemaCodec.ts` | 2 new methods | +15 |
| `codecs/index.ts` | Exports | +3 |
| `src/index.ts` | Exports | +3 |
| Tests | All codecs + integration | +300 |
| **Total** | | **~560** |

---

## Design decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Store codec in metadata | `meta.codec: Codec<unknown>` | Lets `stripMetadata` dispatch by `instanceof` — no fragile value-type sniffing. Errors early on unhandled codec types. |
| Raw bytes format | `Uint8Array` (not hex string) | Binary is the natural form; callers convert to hex only if needed. Avoids double allocation. |
| `decodeWithMetadata` required on interface | Yes | All codecs are internal. Forces compile-time errors if a new codec forgets to implement it. |
| Absent optional fields included in tree | Yes, with `present: false` | The tree always mirrors the schema structure. `stripMetadata` omits them to match `decode()` behavior. Consumers can inspect all fields including absent ones. |
| `extractBits` on BitBuffer | Method, not free function | Needs access to private `_data`. Returns `Uint8Array` not hex. |
| Primitive helper | Free function `primitiveDecodeWithMetadata` | Avoids duplicating the offset-capture pattern in 8 codecs. |
| `stripMetadata` throws on unknown codec | Yes | Prevents silent bugs when adding new codec types. |
