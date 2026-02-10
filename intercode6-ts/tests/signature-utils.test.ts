import {
  importEcPublicKey,
  importSpkiPublicKey,
} from '../src/signature-utils';
import { generateKeyPairSync, sign, verify } from 'node:crypto';

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
