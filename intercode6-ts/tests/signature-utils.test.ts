import { p256 } from '@noble/curves/nist.js';
import { verifyEcdsa } from '../src/signature-utils';
import type { SigningAlgorithm, KeyAlgorithm } from '../src/oids';

describe('verifyEcdsa', () => {
  const sigAlg: SigningAlgorithm = { hash: 'SHA-256', type: 'ECDSA' };
  const keyAlg: KeyAlgorithm = { type: 'EC', curve: 'P-256' };

  it('verifies a valid P-256 ECDSA-SHA-256 signature', () => {
    const privKey = p256.utils.randomSecretKey();
    const pubKey = p256.getPublicKey(privKey);
    const message = new TextEncoder().encode('test message');
    const sig = p256.sign(message, privKey);

    const valid = verifyEcdsa(message, sig, pubKey, sigAlg, keyAlg);
    expect(valid).toBe(true);
  });

  it('rejects a signature with wrong message', () => {
    const privKey = p256.utils.randomSecretKey();
    const pubKey = p256.getPublicKey(privKey);
    const message = new TextEncoder().encode('test message');
    const wrong = new TextEncoder().encode('wrong message');
    const sig = p256.sign(message, privKey);

    const valid = verifyEcdsa(wrong, sig, pubKey, sigAlg, keyAlg);
    expect(valid).toBe(false);
  });

  it('rejects a signature with wrong key', () => {
    const privKey1 = p256.utils.randomSecretKey();
    const privKey2 = p256.utils.randomSecretKey();
    const pubKey2 = p256.getPublicKey(privKey2);
    const message = new TextEncoder().encode('test message');
    const sig = p256.sign(message, privKey1);

    const valid = verifyEcdsa(message, sig, pubKey2, sigAlg, keyAlg);
    expect(valid).toBe(false);
  });

  it('throws for missing curve', () => {
    const noKeyAlg: KeyAlgorithm = { type: 'EC' };
    expect(() =>
      verifyEcdsa(new Uint8Array(0), new Uint8Array(64), new Uint8Array(65), sigAlg, noKeyAlg),
    ).toThrow('Key algorithm has no curve specified');
  });
});
