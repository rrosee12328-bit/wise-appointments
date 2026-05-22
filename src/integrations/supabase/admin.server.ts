import { createClient } from "@supabase/supabase-js";

const url = process.env.SB_URL;
const serviceKey = process.env.SB_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error("Missing SB_URL or SB_SERVICE_ROLE_KEY environment variables");
}

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
