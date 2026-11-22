const SUPABASE_CONFIG = {
  url: 'https://akrmrmkdgdbruodxztwm.supabase.co',
  publishableKey: 'sb_publishable_fFAXvdWf64GbJDg4FAFevg_SWF72M8d',
  adminEmail: 'ah10med2013@gmail.com'
};

const sb = (window.supabase && typeof window.supabase.createClient === 'function')
  ? window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.publishableKey)
  : null;
