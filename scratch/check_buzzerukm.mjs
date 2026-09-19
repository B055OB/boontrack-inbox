import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mpluzajlzpregmjwpjqr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wbHV6YWpsenByZWdtandwanFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTcyMzIsImV4cCI6MjEwMTk5MzIzMn0.Tn7MREcxcOyWzkhgz5t0XOzVOBagQ7PsH-JTch0ZF0M';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, slug, metadata')
    .eq('slug', 'buzzerukm')
    .maybeSingle();

  console.log('Tenant products:');
  tenant?.metadata?.products?.forEach(p => {
    console.log({
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: p.price,
      is_free: p.is_free,
      cta_label: p.cta_label,
    });
  });
}

run();
