import net from 'node:net';

function ipv4ToInt(ip) {
  if (net.isIP(ip) !== 4) return null;
  return ip.split('.').reduce((n, part) => ((n << 8) | Number(part)) >>> 0, 0);
}

function inCidr(ip, cidr) {
  const [range, bitsText] = cidr.split('/');
  const value = ipv4ToInt(ip);
  const base = ipv4ToInt(range);
  const bits = bitsText === undefined ? 32 : Number(bitsText);
  if (value === null || base === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) === (base & mask);
}

export function normalizeIp(raw = '') {
  const ip = raw.replace(/^::ffff:/, '').split('%')[0];
  return ip === '::1' ? '127.0.0.1' : ip;
}

export function isAllowedIp(rawIp, cidrs) {
  const ip = normalizeIp(rawIp);
  if (!cidrs.length) return true; // Development convenience; set ALLOWED_CIDRS before deployment.
  if (ip === '127.0.0.1') return true;
  return cidrs.some((cidr) => inCidr(ip, cidr.trim()));
}
