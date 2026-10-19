// An allowlist of addresses and IPv4 networks (4.1.2, out of server.ts in 4.2.1): the Bridge's trusted proxies, and
// the Studio Server's, whose package ships this file without the rest of the Bridge.
import { isIP } from 'node:net';

/** Whether an address is in an allowlist of addresses and IPv4 networks (`a.b.c.d/n`). */
export function inAllowlist(address: string, list: readonly string[]): boolean {
  const ip = address.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '');
  const v4 = (a: string) => a.split('.').reduce((n, x) => (n << 8) + Number(x), 0) >>> 0;
  return list.some((entry) => {
    const [net, bits] = entry.split('/');
    if (!net) return false;
    if (bits === undefined) return net.replace(/^::ffff:/, '') === ip;
    if (isIP(net) !== 4 || isIP(ip) !== 4) return false;
    const n = Number(bits);
    const mask = n === 0 ? 0 : (~0 << (32 - n)) >>> 0;
    return (v4(ip) & mask) === (v4(net) & mask);
  });
}
