/**
 * targetcast.jp — contact form relay
 *
 * Sits between the public form and Rocket.Chat so the incoming-webhook URL is
 * never exposed in page source. Deploy to Cloudflare Workers and route it at
 * https://forms.targetcast.jp/enquiry (match ENDPOINT in index.html).
 *
 *   wrangler secret put ROCKETCHAT_WEBHOOK
 *   wrangler deploy
 *
 * CHANNEL
 * Enquiries land in #targetcast, never in the MAN.W channel. Create a *separate*
 * incoming-webhook integration in Rocket.Chat bound to #targetcast and use that
 * URL here — do not reuse the MAN.W webhook. The payload deliberately carries no
 * `channel` field: this server rejects any payload that names a channel
 * ("overriding destination channel is disabled"), so the webhook binding alone
 * decides where a message lands — and a re-pointed webhook fails loudly instead
 * of posting somewhere unexpected.
 *
 * Optional binding: RATE (a KV namespace) enables the per-IP limit below.
 */

const ALLOWED_ORIGINS = [
  "https://targetcast.jp",
  "https://www.targetcast.jp",
];

const MAX_LEN = { name: 120, company: 160, email: 200, message: 4000 };

function cors(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

const json = (body, status, origin) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin) },
  });

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405, origin);
    }
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return json({ error: "Origin not allowed" }, 403, origin);
    }

    // one submission per IP per 60s, when a KV namespace is bound
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (env.RATE) {
      const key = `enquiry:${ip}`;
      if (await env.RATE.get(key)) {
        return json({ error: "Too many requests" }, 429, origin);
      }
      await env.RATE.put(key, "1", { expirationTtl: 60 });
    }

    let data;
    try {
      data = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400, origin);
    }

    if (data.website) return json({ ok: true }, 200, origin); // bot trap, fail silently

    const clean = (v, max) => String(v ?? "").trim().slice(0, max);
    const name = clean(data.name, MAX_LEN.name);
    const company = clean(data.company, MAX_LEN.company);
    const email = clean(data.email, MAX_LEN.email);
    const message = clean(data.message, MAX_LEN.message);

    if (!name || !email || !message) {
      return json({ error: "Missing required fields" }, 400, origin);
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ error: "Invalid email" }, 400, origin);
    }

    const text = [
      "*targetcast.jp — お問い合わせ*",
      `*Name:* ${name}`,
      company ? `*Company:* ${company}` : null,
      `*Email:* ${email}`,
      "",
      message,
    ]
      .filter(Boolean)
      .join("\n");

    const res = await fetch(env.ROCKETCHAT_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        alias: "targetcast.jp",
        emoji: ":envelope:",
      }),
    });

    if (!res.ok) {
      console.error("Rocket.Chat relay failed", res.status, await res.text());
      return json({ error: "Delivery failed" }, 502, origin);
    }

    return json({ ok: true }, 200, origin);
  },
};
