// Supabase Edge Function: send-notifications
// Sends queued family emails (created by the database when a report is
// published, a coach sends a request, or a meeting is confirmed) through Resend.
//
// The portal calls this right after those actions. Any signed-in user may
// trigger it; it only ever sends what the database has already queued.
//
// Secrets to set (Dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY   from resend.com
//   FROM_EMAIL       e.g.  The Forge <portal@rochellewrestlingclub.com>
//   SITE_URL         the portal's address, e.g. https://forge-portal.vercel.app
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function emailHtml(subject: string, body: string, site: string) {
  return `<!doctype html><html><body style="margin:0;background:#f1f4f0;font-family:Helvetica,Arial,sans-serif;color:#18231c">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:10px;overflow:hidden">
    <tr><td style="background:#142019;padding:18px 24px;color:#F1F4F0;font-weight:800;letter-spacing:.16em;font-size:15px">THE FORGE
      <div style="font-weight:400;letter-spacing:.12em;font-size:10px;color:#AAB8AD;margin-top:2px">ATHLETE DEVELOPMENT PORTAL</div></td></tr>
    <tr><td style="padding:24px">
      <h1 style="font-size:19px;margin:0 0 10px">${esc(subject)}</h1>
      <p style="font-size:15px;line-height:1.5;margin:0 0 20px">${esc(body)}</p>
      <a href="${esc(site)}" style="display:inline-block;background:#628D7C;color:#0f1a14;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:8px">Open the portal</a>
      <p style="font-size:12px;color:#5d6b62;margin:22px 0 0">For privacy, report details are only shown after you sign in.
      You can turn these emails off in the portal under “How we reach you.”</p>
    </td></tr>
    <tr><td style="padding:14px 24px;background:#f6f8f6;font-size:11px;color:#5d6b62">The Forge · Rochelle Wrestling Club · 1135 Lincoln Hwy, Rochelle, IL 61068</td></tr>
  </table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("FROM_EMAIL");
  const site = Deno.env.get("SITE_URL") ?? "";
  if (!key || !from) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY and FROM_EMAIL secrets are not set" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: queued, error } = await admin
    .from("notifications").select("*").eq("status", "queued").order("created_at").limit(50);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }

  let sent = 0, failed = 0;
  for (const n of queued ?? []) {
    // Claim the row first so two calls at once never send the same email twice.
    const { data: claimed } = await admin.from("notifications")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", n.id).eq("status", "queued").select("id");
    if (!claimed?.length) continue;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: [n.address], subject: n.subject,
        html: emailHtml(n.subject, n.body, site),
        text: `${n.body}\n\nOpen the portal: ${site}\n\nFor privacy, report details are only shown after you sign in.`,
      }),
    });
    if (res.ok) sent++;
    else {
      failed++;
      await admin.from("notifications").update({ status: "failed", error: (await res.text()).slice(0, 500) }).eq("id", n.id);
    }
  }

  return new Response(JSON.stringify({ sent, failed }), { headers: { ...cors, "Content-Type": "application/json" } });
});
