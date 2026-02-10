import {
  rawSignatureToDer,
  ensureDerSignature,
  isDerSignature,
  importEcPublicKey,
  importSpkiPublicKey,
  validateEcSignatureSize,
} from '../src/signature-utils';
import { generateKeyPairSync, sign, verify } from 'node:crypto';

describe('isDerSignature', () => {
  it('returns true for a valid DER SEQUENCE', () => {
    // 0x30 0x06 <6 bytes of content>
    const der = new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02]);
    expect(isDerSignature(der)).toBe(true);
  });

  it('returns false for raw signature (no 0x30 prefix)', () => {
    const raw = new Uint8Array(64).fill(0x42);
    expect(isDerSignature(raw)).toBe(false);
  });

  it('returns false for signature starting with 0x30 but wrong length', () => {
    // 0x30 says 10 bytes follow, but only 2 are present
    const bad = new Uint8Array([0x30, 0x0a, 0x01, 0x02]);
    expect(isDerSignature(bad)).toBe(false);
  });

  it('returns false for empty input', () => {
    expect(isDerSignature(new Uint8Array(0))).toBe(false);
  });

  it('returns false for single byte', () => {
    expect(isDerSignature(new Uint8Array([0x30]))).toBe(false);
  });
});

describe('rawSignatureToDer', () => {
  it('converts a 64-byte P-256 raw signature to valid DER', () => {
    const r = new Uint8Array(32).fill(0x01);
    const s = new Uint8Array(32).fill(0x02);
    const raw = new Uint8Array([...r, ...s]);

    const der = rawSignatureToDer(raw);

    expect(der[0]).toBe(0x30); // SEQUENCE tag
    let pos = 2;
    expect(der[pos]).toBe(0x02); // first INTEGER tag
    const rLen = der[pos + 1];
    pos += 2 + rLen;
    expect(der[pos]).toBe(0x02); // second INTEGER tag
  });

  it('handles leading zeros correctly (strips them)', () => {
    const r = new Uint8Array(32);
    r[0] = 0x00;
    r[1] = 0x00;
    r[2] = 0x42;
    const s = new Uint8Array(32);
    s[0] = 0x01;

    const raw = new Uint8Array([...r, ...s]);
    const der = rawSignatureToDer(raw);

    expect(der[0]).toBe(0x30);
    expect(der[2]).toBe(0x02); // INTEGER tag
    expect(der[3]).toBe(30);   // 32 - 2 leading zeros
  });

  it('adds padding byte when high bit is set', () => {
    const r = new Uint8Array(32);
    r[0] = 0x80;
    const s = new Uint8Array(32);
    s[0] = 0x01;

    const raw = new Uint8Array([...r, ...s]);
    const der = rawSignatureToDer(raw);

    expect(der[2]).toBe(0x02); // INTEGER tag
    expect(der[3]).toBe(33);   // 32 + 1 padding byte
    expect(der[4]).toBe(0x00); // padding byte
    expect(der[5]).toBe(0x80); // original first byte
  });

  it('rejects empty input', () => {
    expect(() => rawSignatureToDer(new Uint8Array(0))).toThrow('even and non-zero');
  });

  it('rejects odd-length input', () => {
    expect(() => rawSignatureToDer(new Uint8Array(63))).toThrow('even and non-zero');
  });

  it('produces DER that Node.js crypto accepts for verification', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ec', {
      namedCurve: 'P-256',
    });

    const data = Buffer.from('test data for signing');
    const derSig = sign('SHA256', data, privateKey);

    // Parse DER to extract raw r and s
    let pos = 2;
    const rLen = derSig[pos + 1];
    let r = derSig.subarray(pos + 2, pos + 2 + rLen);
    pos += 2 + rLen;
    const sLen = derSig[pos + 1];
    let s = derSig.subarray(pos + 2, pos + 2 + sLen);

    // Strip leading padding and pad to 32 bytes
    if (r.length > 32 && r[0] === 0) r = r.subarray(1);
    if (s.length > 32 && s[0] === 0) s = s.subarray(1);
    const rPadded = new Uint8Array(32);
    rPadded.set(r, 32 - r.length);
    const sPadded = new Uint8Array(32);
    sPadded.set(s, 32 - s.length);

    const rawSig = new Uint8Array([...rPadded, ...sPadded]);
    const reconverted = rawSignatureToDer(rawSig);

    const valid = verify('SHA256', data, publicKey, Buffer.from(reconverted));
    expect(valid).toBe(true);
  });
});

describe('ensureDerSignature', () => {
  it('passes through a DER signature unchanged', () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const derSig = sign('SHA256', Buffer.from('data'), privateKey);

    const result = ensureDerSignature(new Uint8Array(derSig));
    // Should be identical (already DER)
    expect(Buffer.from(result).equals(derSig)).toBe(true);
  });

  it('converts a raw signature to DER', () => {
    const raw = new Uint8Array(64);
    raw[0] = 0x01; // not 0x30, so detected as raw
    raw[32] = 0x02;

    const result = ensureDerSignature(raw);
    expect(result[0]).toBe(0x30); // now DER
    expect(isDerSignature(result)).toBe(true);
  });
});

describe('importEcPublicKey', () => {
  it('imports an uncompressed P-256 public key', () => {
    const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });

    const rawBuf = publicKey.export({ type: 'spki', format: 'der' });
    const rawPoint = new Uint8Array(rawBuf.subarray(rawBuf.length - 65));

    expect(rawPoint[0]).toBe(0x04); // uncompressed prefix

    const imported = importEcPublicKey(rawPoint);
    expect(imported.asymmetricKeyType).toBe('ec');
  });

  it('round-trips sign/verify with imported key', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ec', {
      namedCurve: 'P-256',
    });

    const rawBuf = publicKey.export({ type: 'spki', format: 'der' });
    const rawPoint = new Uint8Array(rawBuf.subarray(rawBuf.length - 65));

    const imported = importEcPublicKey(rawPoint);

    const data = Buffer.from('hello world');
    const signature = sign('SHA256', data, privateKey);

    const valid = verify('SHA256', data, imported, signature);
    expect(valid).toBe(true);
  });
});

describe('importSpkiPublicKey', () => {
  it('imports a DSA SPKI public key', () => {
    const { publicKey } = generateKeyPairSync('dsa', {
      modulusLength: 1024,
      divisorLength: 160,
    });

    const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
    const imported = importSpkiPublicKey(new Uint8Array(spkiDer));
    expect(imported.asymmetricKeyType).toBe('dsa');
  });

  it('imports an EC SPKI public key', () => {
    const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });

    const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
    const imported = importSpkiPublicKey(new Uint8Array(spkiDer));
    expect(imported.asymmetricKeyType).toBe('ec');
  });
});

describe('validateEcSignatureSize', () => {
  it('accepts 64 bytes for raw P-256', () => {
    expect(validateEcSignatureSize(new Uint8Array(64))).toBeUndefined();
  });

  it('rejects wrong size for raw P-256', () => {
    const err = validateEcSignatureSize(new Uint8Array(48));
    expect(err).toContain('Expected 64');
    expect(err).toContain('got 48');
  });

  it('skips validation for DER signatures (variable length)', () => {
    // Construct a fake DER signature: 0x30 <len> <content>
    const der = new Uint8Array([0x30, 0x04, 0x02, 0x01, 0x02, 0x01]);
    expect(validateEcSignatureSize(der)).toBeUndefined();
  });
});
