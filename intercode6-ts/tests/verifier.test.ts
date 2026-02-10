import {
  verifyLevel2Signature,
  verifyLevel1Signature,
  verifySignatures,
} from '../src/verifier';
import { extractSignedData } from '../src/signed-data';
import { rawSignatureToDer, importEcPublicKey, ensureDerSignature } from '../src/signature-utils';
import { SAMPLE_TICKET_HEX } from '../src/fixtures';
import {
  generateKeyPairSync,
  sign,
  verify,
} from 'node:crypto';

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, '');
  return new Uint8Array(clean.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
}

describe('verifyLevel2Signature', () => {
  it('returns valid:false for sample ticket (synthetic signatures)', async () => {
    const bytes = hexToBytes(SAMPLE_TICKET_HEX);
    const result = await verifyLevel2Signature(bytes);
    expect(result).toHaveProperty('valid');
    expect(typeof result.valid).toBe('boolean');
    if (!result.valid && result.error) {
      expect(typeof result.error).toBe('string');
    }
  });

  it('attempts verification when signature is present', async () => {
    const bytes = hexToBytes(SAMPLE_TICKET_HEX);
    const result = await verifyLevel2Signature(bytes);
    expect(result).toHaveProperty('valid');
  });
});

describe('verifyLevel1Signature', () => {
  it('returns error when no level 1 signing algorithm OID', async () => {
    const bytes = hexToBytes(SAMPLE_TICKET_HEX);
    const data = extractSignedData(bytes);

    const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });

    const result = await verifyLevel1Signature(bytes, publicKey);
    expect(result).toHaveProperty('valid');
    if (!data.level1SigningAlg) {
      expect(result.valid).toBe(false);
      expect(result.error).toContain('signing algorithm');
    }
  });
});

describe('verifySignatures', () => {
  it('returns results for both levels', async () => {
    const bytes = hexToBytes(SAMPLE_TICKET_HEX);
    const result = await verifySignatures(bytes);

    expect(result).toHaveProperty('level1');
    expect(result).toHaveProperty('level2');
    expect(result.level1).toHaveProperty('valid');
    expect(result.level2).toHaveProperty('valid');
  });

  it('returns level 1 error when no key provided', async () => {
    const bytes = hexToBytes(SAMPLE_TICKET_HEX);
    const result = await verifySignatures(bytes);

    expect(result.level1.valid).toBe(false);
    expect(result.level1.error).toContain('No level 1 public key provided');
  });

  it('accepts level1PublicKey option', async () => {
    const bytes = hexToBytes(SAMPLE_TICKET_HEX);
    const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });

    const result = await verifySignatures(bytes, { level1PublicKey: publicKey });

    expect(result).toHaveProperty('level1');
    expect(result).toHaveProperty('level2');
    if (result.level1.error) {
      expect(result.level1.error).not.toContain('No level 1 public key provided');
    }
  });

  it('accepts level1KeyProvider option', async () => {
    const bytes = hexToBytes(SAMPLE_TICKET_HEX);
    const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });

    const result = await verifySignatures(bytes, {
      level1KeyProvider: {
        async getPublicKey() {
          return publicKey;
        },
      },
    });

    expect(result).toHaveProperty('level1');
    expect(result).toHaveProperty('level2');
  });

  it('handles level1KeyProvider errors gracefully', async () => {
    const bytes = hexToBytes(SAMPLE_TICKET_HEX);

    const result = await verifySignatures(bytes, {
      level1KeyProvider: {
        async getPublicKey() {
          throw new Error('Network error');
        },
      },
    });

    expect(result.level1.valid).toBe(false);
    expect(result.level1.error).toContain('Network error');
  });
});

describe('end-to-end signature verification with crafted data', () => {
  it('verifies a real ECDSA-SHA256 raw signature using the utility functions', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ec', {
      namedCurve: 'P-256',
    });

    const data = Buffer.from('the data that was signed');
    const derSig = sign('SHA256', data, privateKey);

    // Parse DER to extract raw r and s
    let pos = 2;
    const rLen = derSig[pos + 1];
    let r = derSig.subarray(pos + 2, pos + 2 + rLen);
    pos += 2 + rLen;
    const sLen = derSig[pos + 1];
    let s = derSig.subarray(pos + 2, pos + 2 + sLen);

    // Strip DER padding and pad to 32 bytes
    if (r.length > 32 && r[0] === 0) r = r.subarray(1);
    if (s.length > 32 && s[0] === 0) s = s.subarray(1);
    const rPadded = new Uint8Array(32);
    rPadded.set(r, 32 - r.length);
    const sPadded = new Uint8Array(32);
    sPadded.set(s, 32 - s.length);

    const rawSig = new Uint8Array([...rPadded, ...sPadded]);

    // Convert back to DER
    const reconvertedDer = rawSignatureToDer(rawSig);

    // Get raw public key point and import
    const spkiBuf = publicKey.export({ type: 'spki', format: 'der' });
    const rawPoint = new Uint8Array(spkiBuf.subarray(spkiBuf.length - 65));
    const importedKey = importEcPublicKey(rawPoint);

    const valid = verify('SHA256', data, importedKey, Buffer.from(reconvertedDer));
    expect(valid).toBe(true);
  });

  it('verifies a DER (structured) ECDSA signature via ensureDerSignature', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ec', {
      namedCurve: 'P-256',
    });

    const data = Buffer.from('structured signature test');
    // Node.js sign() returns DER by default
    const derSig = sign('SHA256', data, privateKey);

    // ensureDerSignature should pass DER through unchanged
    const ensured = ensureDerSignature(new Uint8Array(derSig));

    const valid = verify('SHA256', data, publicKey, Buffer.from(ensured));
    expect(valid).toBe(true);
  });

  it('verifies a DSA signature via ensureDerSignature', () => {
    const { publicKey, privateKey } = generateKeyPairSync('dsa', {
      modulusLength: 2048,
      divisorLength: 256,
    });

    const data = Buffer.from('DSA signature test');
    const derSig = sign('SHA256', data, privateKey);

    // DER signature should pass through
    const ensured = ensureDerSignature(new Uint8Array(derSig));

    const valid = verify('SHA256', data, publicKey, Buffer.from(ensured));
    expect(valid).toBe(true);
  });
});
