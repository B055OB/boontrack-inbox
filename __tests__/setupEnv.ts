import fs from 'fs';
import path from 'path';

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

// Order: .env then .env.local (so .env.local overrides)
loadEnvFile(path.resolve(process.cwd(), '.env'));
loadEnvFile(path.resolve(process.cwd(), '.env.local'));

if (process.env.SUPABASE_SERVICE_ROLE_KEY?.startsWith('sb_secret_')) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
}

// Clear Gemini API keys by default in unit test environment to use deterministic engine
delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_AI_API_KEY;
delete process.env.GOOGLE_API_KEY;
delete process.env.GEMINI_API_KEY_STUDIO;


// Global WebSocket polyfill for Node.js < 22 environments (e.g. GitHub Actions Node 20)
if (typeof (globalThis as any).WebSocket === 'undefined') {
  class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    readyState = 1;
    url = '';
    onopen: any = null;
    onclose: any = null;
    onerror: any = null;
    onmessage: any = null;
    constructor(url?: string) {
      this.url = url || '';
    }
    send() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
  }
  (globalThis as any).WebSocket = MockWebSocket;
}


