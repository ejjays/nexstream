// QR Ph (EMVCo) payload builders for the support wallets. CRC-16/CCITT (tag 63)
// recomputed after injecting amount — else QR invalid on scan. account/name fields
// = public details each wallet's own QR already encodes. amount decimals differ per
// wallet (gotyme 1, gcash 2). verified vs real QRs: gotyme 500 -> DF0A,
// gcash 50/100/250/500 -> A32D/C49F/E059/9541 (round-trips exact).

function crc16ccitt(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i += 1) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function assemble(prefix: string, amount: string, suffix: string): string {
  const field = `54${String(amount.length).padStart(2, '0')}${amount}`;
  const body = `${prefix}${field}${suffix}6304`;
  return `${body}${crc16ccitt(body)}`;
}

const GOTYME_PREFIX =
  '00020101021227590012com.p2pqrpay0111GOTYPHM2XXX0208999644030412010721784169520460165303608';
const GOTYME_SUFFIX = '5802PH5917CHRIST SON ALLOSO6011Quezon City';
const GCASH_PREFIX =
  '00020101021227830012com.p2pqrpay0111GXCHPHM2XXX02089996440303152170200000006560417DWQM4TK3JDO1KFYWI520460165303608';
const GCASH_SUFFIX = '5802PH5913CH***T S** A.6009Binulasan61041234';

export function buildGotymeQr(amount: number): string {
  return assemble(GOTYME_PREFIX, amount.toFixed(1), GOTYME_SUFFIX);
}

export function buildGcashQr(amount: number): string {
  return assemble(GCASH_PREFIX, amount.toFixed(2), GCASH_SUFFIX);
}
