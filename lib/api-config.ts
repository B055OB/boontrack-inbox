// lib/api-config.ts
// Centralized API configuration for connecting to BoonTrack Core Backend

const IS_SERVER = typeof window === 'undefined';

// Di server/SSR tetap bisa tembak direct Railway, di browser/client wajib lewat rewrite internal agar bebas CORS
export const BACKEND_API_URL = IS_SERVER
  ? (
      process.env.CORE_BACKEND_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.BACKEND_URL ||
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      process.env.NEXT_PUBLIC_CORE_API_URL ||
      process.env.CORE_API_URL ||
      process.env.NEXT_PUBLIC_CORE_API ||
      'https://boontrack-core-production.up.railway.app'
    )
  : '';

export function getBackendApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  if (!IS_SERVER) {
    // Jalur browser: alihkan /api/... ke /api/railway/...
    if (cleanPath.startsWith('/api/')) {
      return `/api/railway${cleanPath.replace('/api', '')}`;
    }
    return `/api/railway${cleanPath}`;
  }

  return `${BACKEND_API_URL.replace(/\/$/, '')}${cleanPath}`;
}