// Supabase Edge Function: manage-login
// Lets a Forge administrator set (or reset) someone's sign-in password from the portal.
// Only people already listed in the portal can be given a login, and only an
// active administrator can call this. New logins are marked as temporary so the
// portal asks the person to choose their own password after signing in.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Who is calling?
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: who } = await admin.auth.getUser(token);
  const callerEmail = who?.user?.email?.toLowerCase();
  if (!callerEmail) return json({ error: "Sign in first." }, 401);
  const { data: me } = await admin.from("people").select("role, active").eq("email", callerEmail).maybeSingle();
  if (!me || me.role !== "admin" || !me.active) return json({ error: "Only an administrator can set passwords." }, 403);

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email) return json({ error: "Missing email." }, 400);
  if (password.length < 8) return json({ error: "Use a password of at least 8 characters." }, 400);

  const { data: person } = await admin.from("people").select("id").eq("email", email).maybeSingle();
  if (!person) return json({ error: "Add this person in the portal first." }, 404);

  // Does a login already exist for this email?
  let existing: { id: string; user_metadata?: Record<string, unknown> } | null = null;
  for (let page = 1; page <= 50 && !existing; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return json({ error: error.message }, 500);
    existing = data.users.find((u) => (u.email ?? "").toLowerCase() === email) ?? null;
    if (data.users.length < 200) break;
  }

  const result = existing
    ? await admin.auth.admin.updateUserById(existing.id, {
        password, email_confirm: true, user_metadata: { ...(existing.user_metadata ?? {}), temp_password: true },
      })
    : await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { temp_password: true } });
  if (result.error) return json({ error: result.error.message }, 400);

  return json({ ok: true, created: !existing });
});
