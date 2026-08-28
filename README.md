# targetcast.jp

Corporate site for 株式会社ターゲットキャスト (TargetCast KK) — Japan market entry
consulting for technology companies. Static, single page, no build step —
`index.html` is the site.

## Publishing (GitHub Pages)

This folder is already a git repo with one commit on `main`. Add your remote and push:

    git remote add origin git@github.com:<account>/targetcast.jp.git
    git push -u origin main

Then:
1. Settings → Pages → Source: **Deploy from a branch** → `main` / `/ (root)`.
2. Settings → Pages → Custom domain: `targetcast.jp` → Save.
   (`CNAME` in this repo already holds the domain.)
3. Tick **Enforce HTTPS** once the certificate is issued.

## DNS

Apex (`targetcast.jp`) — four A records:

    185.199.108.153
    185.199.109.153
    185.199.110.153
    185.199.111.153

Optional IPv6 — four AAAA records:

    2606:50c0:8000::153
    2606:50c0:8001::153
    2606:50c0:8002::153
    2606:50c0:8003::153

`www` — one CNAME record pointing to `<account>.github.io`.

Add the custom domain in GitHub Pages **before** pointing DNS at it. Propagation can
take up to 24 hours. Verify with `dig targetcast.jp +noall +answer -t A`.

## Contact form

The form posts JSON to `ENDPOINT` in `index.html`, currently
`https://forms.targetcast.jp/enquiry`. That address should be the Cloudflare Worker in
`worker/`, which relays to Rocket.Chat.

**Don't point the form straight at a Rocket.Chat incoming webhook.** Anything in
`index.html` is public, so the webhook URL would be too, and anyone could post into the
channel. The Worker keeps it as a secret.

    cd worker
    wrangler secret put ROCKETCHAT_WEBHOOK    # paste the Rocket.Chat incoming webhook URL
    wrangler deploy

The Worker checks Origin, validates and truncates fields, drops honeypot submissions,
and optionally rate-limits per IP if you bind a KV namespace (see `wrangler.toml`).

## Before going live

- [ ] 会社概要 copy — drafted from a one-line brief; read it and adjust the voice
- [ ] The form is now the **only** way to reach the company — no phone, no email, no
      social. Test a real submission end to end after deploying the Worker, and check
      the Rocket.Chat channel is one someone actually watches.
- [ ] Rocket.Chat webhook set as a Worker secret, Worker deployed
- [ ] `forms.targetcast.jp` DNS record pointing at the Worker
- [ ] Decide whether Paper Flow stays on the public site
- [ ] `assets/card.jpg` (1280×800) for the og:image, then add the meta tag
- [ ] 沿革 section removed for now — restore when there's history to show

## Files

    .gitignore                 keeps .dev.vars / .wrangler out of the repo
    index.html                 the site
    404.html                   not-found page
    worker/enquiry-relay.js    Cloudflare Worker — form → Rocket.Chat
    worker/wrangler.toml       Worker config
    CNAME          custom domain for GitHub Pages
    .nojekyll      skip Jekyll processing
    robots.txt     crawl policy + sitemap pointer
    sitemap.xml    single URL
