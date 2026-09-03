// lib/api-config.ts
// Centralized API configuration for connecting to BoonTrack Core Backend

export const BACKEND_API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_CORE_API_URL ||
  process.env.CORE_API_URL ||
  process.env.NEXT_PUBLIC_CORE_API ||
  'https://api.boontrack.com';

export function getBackendApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${BACKEND_API_URL.replace(/\/$/, '')}${cleanPath}`;
}
