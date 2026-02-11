/**
 * Signature format utilities for UIC barcode verification.
 *
 * Handles ECDSA signature verification using @noble/curves, which works
 * in both Node.js and browser environments.
 */
import { p256, p384, p521 } from '@noble/curves/nist.js';
import { sha256, sha384, sha512 } from '@noble/hashes/sha2.js';
import type { SigningAlgorithm, KeyAlgorithm } from './oids';

/**
 * Hash the message using the specified hash algorithm.
 */
function hashMessage(message: Uint8Array, hash: string): Uint8Array {
  switch (hash) {
    case 'SHA-256': return sha256(message);
    case 'SHA-384': return sha384(message);
    case 'SHA-512': return sha512(message);
    default: throw new Error(`Unsupported hash algorithm: ${hash}`);
  }
}

/**
 * Verify an ECDSA signature using @noble/curves.
 *
 * @param message - The data that was signed (will be hashed with sigAlg.hash).
 * @param signature - Raw (r || s) concatenated signature bytes.
 * @param publicKey - Raw EC public key (uncompressed 04||x||y or compressed 02/03||x).
 * @param sigAlg - The signing algorithm info (hash + type).
 * @param keyAlg - The key algorithm info (curve).
 * @returns true if valid, false otherwise.
 */
export function verifyEcdsa(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array,
  sigAlg: SigningAlgorithm,
  keyAlg: KeyAlgorithm,
): boolean {
  if (!keyAlg.curve) {
    throw new Error('Key algorithm has no curve specified');
  }

  // Pre-hash the message with the specified algorithm
  const msgHash = hashMessage(message, sigAlg.hash);

  // Pass raw signature bytes directly with prehash: false
  // since we already hashed above. This supports non-default hash/curve combinations.
  switch (keyAlg.curve) {
    case 'P-256':
      return p256.verify(signature, msgHash, publicKey, { prehash: false });
    case 'P-384':
      return p384.verify(signature, msgHash, publicKey, { prehash: false });
    case 'P-521':
      return p521.verify(signature, msgHash, publicKey, { prehash: false });
    default:
      throw new Error(`Unsupported curve: ${keyAlg.curve}`);
  }
}
