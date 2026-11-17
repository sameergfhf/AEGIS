import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://sjgqmjsszlvimafqwdpi.supabase.co';
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_Zp2MDTnDkNehbXaJJny-WA_9Z5JcjZw';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
