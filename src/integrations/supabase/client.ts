import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jgycqlqextzbtekebads.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_v1Sjie9vVTS5yBfrMGzZVQ_F-H6ZCxm";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
