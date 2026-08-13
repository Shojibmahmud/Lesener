import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Vite inlines these at build time, so a missing .env fails as a confusing
// "Invalid URL" from deep inside supabase-js. Say what is actually wrong.
if (!url || !publishableKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.',
  );
}

// Defaults are what we want: the session lives in localStorage and the access
// token refreshes itself, so a reload keeps the reader signed in.
export const supabase = createClient(url, publishableKey);
