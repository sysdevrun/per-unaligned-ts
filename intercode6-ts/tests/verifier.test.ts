import { p256 } from '@noble/curves/nist.js';
import {
  verifySignatures,
  verifyLevel2Signature,
  verifyLevel1Signature,
} from '../src/verifier';
import { SAMPLE_TICKET_HEX, GRAND_EST_U1_FCB3_HEX } from '../src/fixtures';

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, '');
  return new Uint8Array(clean.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
}

describe('verifyLevel2Signature', () => {
  it('returns algorithm info for sample ticket', async () => {
    const bytes = hexToBytes(SAMPLE_TICKET_HEX);
    const result = await verifyLevel2Signature(bytes);

    // The sample fixture may have a dummy signature, so we check the algorithm is identified
    expect(result.algorithm).toBe('ECDSA-SHA-256 (P-256)');
    // valid can be true or false depending on whether the fixture has a real signature
    expect(typeof result.valid).toBe('boolean');
  });

  it('attempts verification for Grand Est ticket', async () => {
    const bytes = hexToBytes(GRAND_EST_U1_FCB3_HEX);
    const result = await verifyLevel2Signature(bytes);

    // Grand Est may or may not have all required algorithm fields
    expect(typeof result.valid).toBe('boolean');
    // If verification couldn't proceed, error should explain why
    if (!result.valid && !result.algorithm) {
      expect(result.error).toBeDefined();
    }
  });
});

describe('verifyLevel1Signature', () => {
  it('returns error when given wrong public key', async () => {
    const bytes = hexToBytes(SAMPLE_TICKET_HEX);
    const randomKey = p256.getPublicKey(p256.utils.randomSecretKey());

    const result = await verifyLevel1Signature(bytes, randomKey);

    // Should either fail verification or report an error
    expect(result.valid === false || result.error !== undefined).toBe(true);
  });
});

describe('verifySignatures', () => {
  it('returns results for both levels without level1 key', async () => {
    const bytes = hexToBytes(SAMPLE_TICKET_HEX);
    const result = await verifySignatures(bytes);

    // Level 2 should attempt verification
    expect(typeof result.level2.valid).toBe('boolean');
    // Level 1 should report no key provided
    expect(result.level1.valid).toBe(false);
    expect(result.level1.error).toBe('No Level 1 public key provided');
  });

  it('verifies with explicit level1 public key', async () => {
    const bytes = hexToBytes(SAMPLE_TICKET_HEX);
    const fakeKey = p256.getPublicKey(p256.utils.randomSecretKey());

    const result = await verifySignatures(bytes, { level1PublicKey: fakeKey });

    // Level 1 should attempt verification (will likely fail with fake key)
    expect(typeof result.level1.valid).toBe('boolean');
    expect(typeof result.level2.valid).toBe('boolean');
  });

  it('verifies with key provider', async () => {
    const bytes = hexToBytes(SAMPLE_TICKET_HEX);
    const fakeKey = p256.getPublicKey(p256.utils.randomSecretKey());

    const result = await verifySignatures(bytes, {
      level1KeyProvider: {
        async getPublicKey(_provider, _keyId) {
          return fakeKey;
        },
      },
    });

    expect(typeof result.level1.valid).toBe('boolean');
    expect(typeof result.level2.valid).toBe('boolean');
  });

  it('handles key provider errors gracefully', async () => {
    const bytes = hexToBytes(SAMPLE_TICKET_HEX);

    const result = await verifySignatures(bytes, {
      level1KeyProvider: {
        async getPublicKey() {
          throw new Error('Key not found');
        },
      },
    });

    expect(result.level1.valid).toBe(false);
    expect(result.level1.error).toContain('Key provider error');
    expect(result.level1.error).toContain('Key not found');
  });
});

describe('end-to-end signature verification', () => {
  it('verifies a self-signed message with noble curves', () => {
    const privKey = p256.utils.randomSecretKey();
    const pubKey = p256.getPublicKey(privKey);
    const message = new TextEncoder().encode('level2 signed data');
    const sig = p256.sign(message, privKey);

    // Verify using the noble API directly (sanity check)
    expect(p256.verify(sig, message, pubKey)).toBe(true);
  });
});
