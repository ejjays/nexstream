// dev-only logging — vanishes in prod via Hermes DCE
const DEV = typeof __DEV__ !== 'undefined' ? __DEV__ : true;

export function log(tag: string, ...args: unknown[]): void {
  if (DEV) console.log(`[${tag}]`, ...args);
}

export function warn(tag: string, ...args: unknown[]): void {
  if (DEV) console.warn(`[${tag}]`, ...args);
}

export function error(tag: string, ...args: unknown[]): void {
  if (DEV) console.error(`[${tag}]`, ...args);
}
