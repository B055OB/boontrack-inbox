const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://mpluzajlzpregmjwpjqr.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wbHV6YWpsenByZWdtandwanFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTcyMzIsImV4cCI6MjEwMTk5MzIzMn0.Tn7MREcxcOyWzkhgz5t0XOzVOBagQ7PsH-JTch0ZF0M'
);

async function main() {
  console.log('Fetching tenant ombudi...');
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', 'ombudi')
    .single();

  if (error) {
    console.error('Error fetching tenant:', error);
    return;
  }

  const meta = tenant.metadata || {};
  
  // Update to public proxy and R2 endpoints
  const logoUrl = '/api/v1/media/ombudi/avatar.webp';
  const qrisUrl = '/api/v1/media/ombudi/qris.png';

  const updatedMeta = {
    ...meta,
    logo_url: logoUrl,
    avatar_url: logoUrl,
    qris_url: qrisUrl,
    qris_image_url: qrisUrl,
  };

  const { error: updateError } = await supabase
    .from('tenants')
    .update({ metadata: updatedMeta })
    .eq('slug', 'ombudi');

  if (updateError) {
    console.error('Error updating tenant:', updateError);
    return;
  }

  console.log('✅ Successfully updated ombudi metadata:');
  console.log('   logo_url:', updatedMeta.logo_url);
  console.log('   avatar_url:', updatedMeta.avatar_url);
  console.log('   qris_url:', updatedMeta.qris_url);
  console.log('   qris_image_url:', updatedMeta.qris_image_url);
}

main();
