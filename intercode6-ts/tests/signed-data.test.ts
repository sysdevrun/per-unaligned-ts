import { extractSignedDataBytes } from '../src/signed-data';
import { SAMPLE_TICKET_HEX, GRAND_EST_U1_FCB3_HEX } from '../src/fixtures';

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, '');
  return new Uint8Array(clean.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
}

describe('extractSignedDataBytes', () => {
  it('extracts signed data from sample ticket (v1 header)', () => {
    const bytes = hexToBytes(SAMPLE_TICKET_HEX);
    const result = extractSignedDataBytes(bytes);

    expect(result.headerVersion).toBe(1);
    expect(result.level1DataBytes).toBeInstanceOf(Uint8Array);
    expect(result.level2SignedBytes).toBeInstanceOf(Uint8Array);
    expect(result.level1DataBytes.length).toBeGreaterThan(0);
    expect(result.level2SignedBytes.length).toBeGreaterThan(0);

    // level2SignedBytes should be larger than level1DataBytes
    // (it contains level1Data + level1Signature + optional level2Data)
    expect(result.level2SignedBytes.length).toBeGreaterThan(result.level1DataBytes.length);
  });

  it('extracts decoded header with security info', () => {
    const bytes = hexToBytes(SAMPLE_TICKET_HEX);
    const result = extractSignedDataBytes(bytes);

    const l2 = result.header.level2SignedData as Record<string, unknown>;
    const l1 = l2.level1Data as Record<string, unknown>;

    expect(l1.securityProviderNum).toBe(3703);
    expect(l1.keyId).toBe(1);
    expect(l1.level2SigningAlg).toBe('1.2.840.10045.4.3.2');
    expect(l1.level2KeyAlg).toBe('1.2.840.10045.3.1.7');
  });

  it('extracts signed data from Grand Est FCB3 ticket', () => {
    const bytes = hexToBytes(GRAND_EST_U1_FCB3_HEX);
    const result = extractSignedDataBytes(bytes);

    expect(result.headerVersion).toBe(1);
    expect(result.level1DataBytes.length).toBeGreaterThan(0);
    expect(result.level2SignedBytes.length).toBeGreaterThan(0);
  });
});
