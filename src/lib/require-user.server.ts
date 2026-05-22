import { getRequestHeader } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/admin.server";

export async function requireUser() {
  const authHeader = getRequestHeader("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Not authenticated");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error("Invalid session");
  return data.user;
}
