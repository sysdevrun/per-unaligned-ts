import { getSigningAlgorithm, getKeyAlgorithm } from '../src/oids';

describe('getSigningAlgorithm', () => {
  it('maps ECDSA-SHA-256 OID', () => {
    const alg = getSigningAlgorithm('1.2.840.10045.4.3.2');
    expect(alg).toEqual({ hash: 'SHA-256', type: 'ECDSA' });
  });

  it('maps ECDSA-SHA-384 OID', () => {
    const alg = getSigningAlgorithm('1.2.840.10045.4.3.3');
    expect(alg).toEqual({ hash: 'SHA-384', type: 'ECDSA' });
  });

  it('maps ECDSA-SHA-512 OID', () => {
    const alg = getSigningAlgorithm('1.2.840.10045.4.3.4');
    expect(alg).toEqual({ hash: 'SHA-512', type: 'ECDSA' });
  });

  it('maps DSA-SHA-256 OID', () => {
    const alg = getSigningAlgorithm('2.16.840.1.101.3.4.3.2');
    expect(alg).toEqual({ hash: 'SHA-256', type: 'DSA' });
  });

  it('maps RSA-SHA-256 OID', () => {
    const alg = getSigningAlgorithm('1.2.840.113549.1.1.11');
    expect(alg).toEqual({ hash: 'SHA-256', type: 'RSA' });
  });

  it('returns undefined for unknown OID', () => {
    expect(getSigningAlgorithm('1.2.3.4.5')).toBeUndefined();
  });
});

describe('getKeyAlgorithm', () => {
  it('maps P-256 OID', () => {
    const alg = getKeyAlgorithm('1.2.840.10045.3.1.7');
    expect(alg).toEqual({ type: 'EC', curve: 'P-256' });
  });

  it('maps P-384 OID', () => {
    const alg = getKeyAlgorithm('1.3.132.0.34');
    expect(alg).toEqual({ type: 'EC', curve: 'P-384' });
  });

  it('maps P-521 OID', () => {
    const alg = getKeyAlgorithm('1.3.132.0.35');
    expect(alg).toEqual({ type: 'EC', curve: 'P-521' });
  });

  it('maps RSA key OID', () => {
    const alg = getKeyAlgorithm('1.2.840.113549.1.1.1');
    expect(alg).toEqual({ type: 'RSA' });
  });

  it('returns undefined for unknown OID', () => {
    expect(getKeyAlgorithm('9.9.9.9')).toBeUndefined();
  });
});
