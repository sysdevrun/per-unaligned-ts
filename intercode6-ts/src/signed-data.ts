/**
 * Extract signed data bytes from a UIC barcode using decodeWithMetadata.
 *
 * Uses the metadata tree to extract the exact original bytes for
 * level1Data and level2SignedData without re-encoding.
 */
import {
  SchemaCodec,
  SchemaBuilder,
  BitBuffer,
  stripMetadata,
  type SchemaNode,
  type DecodedNode,
} from 'asn1-per-ts';
import { HEADER_SCHEMAS } from './schemas';

// Cache for header codecs used in metadata decoding (separate from decoder.ts)
const metadataCodecCache = new Map<number, SchemaCodec>();

function getMetadataHeaderCodec(version: number): SchemaCodec {
  let codec = metadataCodecCache.get(version);
  if (codec) return codec;
  const schemas = HEADER_SCHEMAS[version];
  if (!schemas) {
    throw new Error(`No schema for header v${version}. Supported: v1, v2`);
  }
  codec = new SchemaCodec(schemas.UicBarcodeHeader as SchemaNode);
  metadataCodecCache.set(version, codec);
  return codec;
}

/** Peek the header version from raw barcode bytes. */
function peekHeaderVersion(bytes: Uint8Array): number {
  const peekBuf = BitBuffer.from(bytes);
  peekBuf.readBit(); // skip optional bitmap
  const format = SchemaBuilder.build({ type: 'IA5String' } as SchemaNode).decode(peekBuf) as string;
  const match = format.match(/^U(\d+)$/);
  if (!match) throw new Error(`Unknown header format "${format}"`);
  return parseInt(match[1], 10);
}

/** Result of extracting signed data bytes from a barcode. */
export interface SignedDataBytes {
  /** The exact bytes of level1Data as encoded in the barcode. */
  level1DataBytes: Uint8Array;
  /** The exact bytes of level2SignedData as encoded in the barcode. */
  level2SignedBytes: Uint8Array;
  /** The decoded header object (plain values, metadata stripped). */
  header: Record<string, unknown>;
  /** The header version (1 or 2). */
  headerVersion: number;
}

/**
 * Extract the signed data bytes from a UIC barcode.
 *
 * Decodes the header with metadata tracking, then reads the raw bytes
 * directly from the source buffer at the exact bit offsets. This avoids
 * any re-encoding fidelity issues.
 */
export function extractSignedDataBytes(bytes: Uint8Array): SignedDataBytes {
  const headerVersion = peekHeaderVersion(bytes);
  const codec = getMetadataHeaderCodec(headerVersion);

  const root: DecodedNode = codec.decodeWithMetadata(bytes);

  // Navigate the metadata tree:
  // root.value is Record<string, DecodedNode> for a SEQUENCE
  const headerFields = root.value as Record<string, DecodedNode>;
  const level2SignedDataNode = headerFields.level2SignedData;

  const l2Fields = level2SignedDataNode.value as Record<string, DecodedNode>;
  const level1DataNode = l2Fields.level1Data;

  // Extract the exact original bytes
  const level1DataBytes = level1DataNode.meta.rawBytes;
  const level2SignedBytes = level2SignedDataNode.meta.rawBytes;

  // Strip metadata to get plain decoded object
  const header = stripMetadata(root) as Record<string, unknown>;

  return {
    level1DataBytes,
    level2SignedBytes,
    header,
    headerVersion,
  };
}
