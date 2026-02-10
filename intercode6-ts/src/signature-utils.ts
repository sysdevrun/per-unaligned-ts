/**
 * Public key import utilities for UIC barcode signature verification.
 *
 * FCB signatures are always structured (DER-encoded). No raw↔DER
 * conversion is needed. This module handles importing raw EC points
 * and DER-encoded SPKI public keys into Node.js KeyObjects.
 */
import { createPublicKey, type KeyObject } from 'node:crypto';

// ---------------------------------------------------------------------------
// SPKI DER construction for EC public keys
// ---------------------------------------------------------------------------

/** OID for ecPublicKey (1.2.840.10045.2.1) in DER encoding. */
const EC_PUBLIC_KEY_OID = new Uint8Array([
  0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
]);

/** Named curve OID for P-256 (secp256r1) in DER encoding. */
const P256_CURVE_OID = new Uint8Array([
  0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07,
]);

/**
 * Build a SubjectPublicKeyInfo (SPKI) DER structure wrapping a raw EC public
 * key point.
 *
 * The SPKI structure is:
 *   SEQUENCE {
 *     SEQUENCE { OID ecPublicKey, OID namedCurve }
 *     BIT STRING (public key point)
 *   }
 */
function buildEcSpkiDer(rawPoint: Uint8Array): Uint8Array {
  const algIdInnerLen = EC_PUBLIC_KEY_OID.length + P256_CURVE_OID.length;
  const algId = new Uint8Array(2 + algIdInnerLen);
  algId[0] = 0x30;
  algId[1] = algIdInnerLen;
  algId.set(EC_PUBLIC_KEY_OID, 2);
  algId.set(P256_CURVE_OID, 2 + EC_PUBLIC_KEY_OID.length);

  const bitStringLen = 1 + rawPoint.length;
  const bitString = new Uint8Array(2 + bitStringLen);
  bitString[0] = 0x03;
  bitString[1] = bitStringLen;
  bitString[2] = 0x00;
  bitString.set(rawPoint, 3);

  const outerLen = algId.length + bitString.length;
  const spki = new Uint8Array(2 + outerLen);
  spki[0] = 0x30;
  spki[1] = outerLen;
  spki.set(algId, 2);
  spki.set(bitString, 2 + algId.length);

  return spki;
}

/**
 * Import a raw EC P-256 public key point as a Node.js KeyObject.
 *
 * Accepts both uncompressed (0x04 prefix) and compressed (0x02/0x03 prefix)
 * points. Node.js handles decompression internally.
 *
 * @param rawPoint - The raw EC public key bytes.
 * @returns A Node.js KeyObject for use with crypto.verify().
 */
export function importEcPublicKey(rawPoint: Uint8Array): KeyObject {
  const spki = buildEcSpkiDer(rawPoint);
  return createPublicKey({
    key: Buffer.from(spki),
    format: 'der',
    type: 'spki',
  });
}

/**
 * Import a DER-encoded SubjectPublicKeyInfo (SPKI) public key.
 *
 * Used for DSA public keys which are stored as full SPKI blobs in the barcode.
 *
 * @param spkiDer - The DER-encoded SPKI public key bytes.
 * @returns A Node.js KeyObject for use with crypto.verify().
 */
export function importSpkiPublicKey(spkiDer: Uint8Array): KeyObject {
  return createPublicKey({
    key: Buffer.from(spkiDer),
    format: 'der',
    type: 'spki',
  });
}
