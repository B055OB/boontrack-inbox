import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mpluzajlzpregmjwpjqr.supabase.co';

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wbHV6YWpsenByZWdtandwanFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTcyMzIsImV4cCI6MjEwMTk5MzIzMn0.Tn7MREcxcOyWzkhgz5t0XOzVOBagQ7PsH-JTch0ZF0M';

export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_OXETaOPFYI_AKCrKpLEr0Q__RUHScg7';

export const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wbHV6YWpsenByZWdtandwanFyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQxNzIzMiwiZXhwIjoyMTAxOTkzMjMyfQ.TJMAEJQXeAv33EcwCt6OVyaC0ZFTROWzuljvm07i0Qg';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export function createBrowserClient() {
  return supabase;
}

export function createClientComponentClient() {
  return supabase;
}

export default supabase;
