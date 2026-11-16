import fs from 'fs';
import path from 'path';

describe('CI Anti-Hardcoded Production Supabase Guardrail', () => {
  const FORBIDDEN_PROD_REF = 'mpluzajlzpregmjwpjqr';
  const FORBIDDEN_MOCK_JWT_FRAGMENT = 'mock_anon_key';
  const FORBIDDEN_LEGACY_JWT_FRAGMENT = 'Tn7MREcxcOyWzkhgz5t0XOzVOBagQ7PsH-JTch0ZF0M';

  const TARGET_DIRS = ['app', 'lib', 'src', 'utils', 'scripts'];
  const TARGET_FILES = ['middleware.ts', 'next.config.ts'];

  function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
    if (!fs.existsSync(dirPath)) return arrayOfFiles;
    const files = fs.readdirSync(dirPath);

    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      if (fs.statSync(fullPath).isDirectory()) {
        if (file !== 'node_modules' && file !== '.next' && file !== '__pycache__') {
          getAllFiles(fullPath, arrayOfFiles);
        }
      } else {
        if (/\.(ts|tsx|js|mjs|cjs|py|json)$/.test(file)) {
          arrayOfFiles.push(fullPath);
        }
      }
    }

    return arrayOfFiles;
  }

  it('strictly forbids production Supabase project ref in all runtime and script files', () => {
    const rootDir = path.resolve(__dirname, '../../');
    const filesToScan: string[] = [];

    for (const d of TARGET_DIRS) {
      filesToScan.push(...getAllFiles(path.join(rootDir, d)));
    }
    for (const f of TARGET_FILES) {
      const fp = path.join(rootDir, f);
      if (fs.existsSync(fp)) {
        filesToScan.push(fp);
      }
    }

    const violations: { file: string; line: number; match: string }[] = [];

    for (const filePath of filesToScan) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        if (line.includes(FORBIDDEN_PROD_REF)) {
          violations.push({
            file: path.relative(rootDir, filePath),
            line: index + 1,
            match: line.trim(),
          });
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it('strictly forbids hardcoded mock or legacy JWT tokens in runtime client and middleware files', () => {
    const rootDir = path.resolve(__dirname, '../../');
    const runtimeFiles = [
      path.join(rootDir, 'lib/supabaseClient.ts'),
      path.join(rootDir, 'lib/supabase.ts'),
      path.join(rootDir, 'utils/supabase/client.ts'),
      path.join(rootDir, 'lib/tenant-store-data.ts'),
      path.join(rootDir, 'middleware.ts'),
    ];

    const violations: string[] = [];

    for (const filePath of runtimeFiles) {
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.includes(FORBIDDEN_MOCK_JWT_FRAGMENT)) {
        violations.push(`${path.basename(filePath)} contains forbidden mock_anon_key`);
      }
      if (content.includes(FORBIDDEN_LEGACY_JWT_FRAGMENT)) {
        violations.push(`${path.basename(filePath)} contains forbidden legacy fallback JWT`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('enforces fail-closed behavior on missing NEXT_PUBLIC_SUPABASE_URL', () => {
    const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    try {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      jest.resetModules();
      jest.unmock('@/lib/supabaseClient');
      expect(() => {
        require('@/lib/supabaseClient');
      }).toThrow(/\[Supabase Config\] Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL/);
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = origUrl;
    }
  });

  it('enforces fail-closed behavior on missing NEXT_PUBLIC_SUPABASE_ANON_KEY', () => {
    const origKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    try {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      jest.resetModules();
      jest.unmock('@/lib/supabaseClient');
      expect(() => {
        require('@/lib/supabaseClient');
      }).toThrow(/\[Supabase Config\] Missing required environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = origKey;
    }
  });
});
