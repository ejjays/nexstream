import { describe, it, expect } from 'vitest';
import { buildGotymeQr, buildGcashQr } from '../src/lib/qrph';

// exact QR Ph payloads decoded from bank-generated QRs.
const GOTYME_500 =
  '00020101021227590012com.p2pqrpay0111GOTYPHM2XXX02089996440304120107217841695204601653036085405500.05802PH5917CHRIST SON ALLOSO6011Quezon City6304DF0A';
const GCASH_500 =
  '00020101021227830012com.p2pqrpay0111GXCHPHM2XXX02089996440303152170200000006560417DWQM4TK3JDO1KFYWI5204601653036085406500.005802PH5913CH***T S** A.6009Binulasan6104123463049541';

describe('buildGotymeQr', () => {
  it('reproduces the bank QR for ₱500 (CRC DF0A)', () => {
    expect(buildGotymeQr(500)).toBe(GOTYME_500);
  });
  it('embeds the custom amount (1 decimal) in tag 54', () => {
    expect(buildGotymeQr(137)).toContain('5405137.0');
  });
});

describe('buildGcashQr', () => {
  it('reproduces the bank QR for ₱500 (CRC 9541)', () => {
    expect(buildGcashQr(500)).toBe(GCASH_500);
  });
  it('matches bank CRCs for 50/100/250', () => {
    expect(buildGcashQr(50).slice(-4)).toBe('A32D');
    expect(buildGcashQr(100).slice(-4)).toBe('C49F');
    expect(buildGcashQr(250).slice(-4)).toBe('E059');
  });
  it('embeds the custom amount (2 decimals) in tag 54', () => {
    expect(buildGcashQr(137)).toContain('5406137.00');
  });
});
