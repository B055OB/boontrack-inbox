/**
 * Enterprise URL Security & SSRF / Protocol Injection Guard (Gate G6)
 * Validates and sanitizes URLs against:
 * - Dangerous schemes (javascript:, data:, vbscript:, file:, blob:, about:)
 * - Alternative IP representations:
 *   * Standard IPv4: 127.0.0.1, 10.x, 192.168.x, 172.16-31.x, 169.254.x
 *   * Octal notation: 0177.0.0.1, 017700000001
 *   * Hex notation: 0x7f000001, 0x7f.0.0.1
 *   * Integer decimal IP: 2130706433
 *   * IPv6: ::1, [::1], fe80::, fc00::, fd00::, [::ffff:127.0.0.1]
 * - Embedded userinfo: http://user:pass@127.0.0.1
 * - URL percent-encoding: %31%32%37%2e...
 * - Scheme-relative URLs: //localhost
 */

export interface UrlValidationResult {
  isValid: boolean;
  sanitizedUrl: string;
  reason?: string;
}

export function sanitizeAndValidateProductUrl(rawUrl: string): UrlValidationResult {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    return { isValid: true, sanitizedUrl: 'https://boontrack.com' };
  }

  // 1. Check dangerous schemes before parsing
  if (/^(javascript:|data:|vbscript:|file:|blob:|about:)/i.test(trimmed)) {
    return {
      isValid: false,
      sanitizedUrl: 'https://boontrack.com',
      reason: 'Skema protokol berbahaya tidak diizinkan.',
    };
  }

  // 2. Decode percent-encoding for inspection
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {}

  if (/^(javascript:|data:|vbscript:|file:|blob:|about:)/i.test(decoded)) {
    return {
      isValid: false,
      sanitizedUrl: 'https://boontrack.com',
      reason: 'Skema protokol berbahaya terselubung tidak diizinkan.',
    };
  }

  // 3. Normalization: ensure protocol
  let urlToParse = trimmed;
  if (/^\/\//.test(trimmed)) {
    urlToParse = `https:${trimmed}`;
  } else if (!/^https?:\/\//i.test(trimmed)) {
    urlToParse = `https://${trimmed}`;
  }

  try {
    const parsed = new URL(urlToParse);

    // Only allow http: and https:
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        isValid: false,
        sanitizedUrl: 'https://boontrack.com',
        reason: 'Hanya protokol HTTP/HTTPS yang didukung.',
      };
    }

    // Strip userinfo if present in URL
    if (parsed.username || parsed.password) {
      parsed.username = '';
      parsed.password = '';
    }

    let hostname = parsed.hostname.toLowerCase().trim();

    // Remove IPv6 brackets if present
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
      hostname = hostname.slice(1, -1);
    }

    // 4. Hostname checks
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname === '0.0.0.0'
    ) {
      return {
        isValid: false,
        sanitizedUrl: 'https://boontrack.com',
        reason: 'Alamat loopback/internal lokal tidak diizinkan.',
      };
    }

    // 5. IPv6 loopback / private / link-local / IPv4-mapped checks
    if (
      hostname === '::1' ||
      hostname === '::' ||
      hostname.startsWith('fe80:') ||
      hostname.startsWith('fc00:') ||
      hostname.startsWith('fd00:') ||
      hostname.startsWith('::ffff:') ||
      hostname.includes('::ffff:') ||
      hostname.startsWith('64:ff9b:') ||
      hostname.startsWith('2001:db8:') ||
      hostname.startsWith('2002:')
    ) {
      return {
        isValid: false,
        sanitizedUrl: 'https://boontrack.com',
        reason: 'Alamat IPv6 internal/mapped tidak diizinkan.',
      };
    }

    // 6. Alternative IP representation checks (Octal, Hex, Integer DWORD)
    // Check integer DWORD IP (e.g. 2130706433 or 0x7f000001)
    if (/^(0x[0-9a-f]+|\d+)$/i.test(hostname)) {
      const num = hostname.startsWith('0x') ? parseInt(hostname, 16) : parseInt(hostname, 10);
      if (!isNaN(num) && num >= 0 && num <= 4294967295) {
        // Convert integer to IPv4
        const p1 = (num >>> 24) & 0xff;
        const p2 = (num >>> 16) & 0xff;
        const p3 = (num >>> 8) & 0xff;
        const p4 = num & 0xff;
        hostname = `${p1}.${p2}.${p3}.${p4}`;
      }
    }

    // Parse dotted decimal/octal/hex parts
    const parts = hostname.split('.');
    if (parts.length === 4) {
      const nums = parts.map((p) => {
        if (/^0x[0-9a-f]+$/i.test(p)) return parseInt(p, 16);
        if (/^0[0-7]+$/.test(p)) return parseInt(p, 8);
        return parseInt(p, 10);
      });

      if (nums.every((n) => !isNaN(n) && n >= 0 && n <= 255)) {
        const [a, b] = nums;
        // Loopback 127.0.0.0/8
        if (a === 127) {
          return {
            isValid: false,
            sanitizedUrl: 'https://boontrack.com',
            reason: 'Alamat loopback 127.0.0.0/8 diblokir.',
          };
        }
        // RFC-1918 Private: 10.0.0.0/8
        if (a === 10) {
          return {
            isValid: false,
            sanitizedUrl: 'https://boontrack.com',
            reason: 'Alamat IP privat 10.0.0.0/8 diblokir.',
          };
        }
        // RFC-1918 Private: 172.16.0.0/12
        if (a === 172 && b >= 16 && b <= 31) {
          return {
            isValid: false,
            sanitizedUrl: 'https://boontrack.com',
            reason: 'Alamat IP privat 172.16.0.0/12 diblokir.',
          };
        }
        // RFC-1918 Private: 192.168.0.0/16
        if (a === 192 && b === 168) {
          return {
            isValid: false,
            sanitizedUrl: 'https://boontrack.com',
            reason: 'Alamat IP privat 192.168.0.0/16 diblokir.',
          };
        }
        // Cloud Instance Metadata: 169.254.169.254 / Link-local 169.254.0.0/16
        if (a === 169 && b === 254) {
          return {
            isValid: false,
            sanitizedUrl: 'https://boontrack.com',
            reason: 'Alamat link-local/cloud metadata diblokir.',
          };
        }
        // Zero address: 0.0.0.0
        if (a === 0 && b === 0 && nums[2] === 0 && nums[3] === 0) {
          return {
            isValid: false,
            sanitizedUrl: 'https://boontrack.com',
            reason: 'Alamat 0.0.0.0 diblokir.',
          };
        }
      }
    }

    return { isValid: true, sanitizedUrl: parsed.href };
  } catch (err) {
    return { isValid: false, sanitizedUrl: 'https://boontrack.com', reason: 'URL tidak valid.' };
  }
}
