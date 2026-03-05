/**
 * supabase.js – Supabase client singleton.
 *
 * Uses Vite environment variables (prefixed with VITE_).
 * These are embedded at build time, so they're safe for frontend use.
 * The anon key is public in the client bundle. RLS policies are currently
 * open (using (true)), so access control relies on each team hosting their
 * own Supabase instance rather than database-level restrictions.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "[TimeTracker] Missing Supabase config! Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env",
  );
}

export const supabase = createClient(supabaseUrl || "", supabaseKey || "");
