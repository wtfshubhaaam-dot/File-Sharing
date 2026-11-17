# Multi-server checklist (Koyeb + Render, ONE bot)

Exactly ONE server is the gateway. It owns the Telegram webhook, the admin panel and the share links.
If the gateway is down, the whole bot is down (workers only get updates FROM the gateway).

| Server | NODE_ID | NODE_ROLE | BASE_URL |
|---|---|---|---|
| Koyeb #1 (most stable) | n1 | **gateway** | https://<its own>.koyeb.app |
| Koyeb #2 | n2 | worker | its own koyeb url |
| Koyeb #3 | n3 | worker | its own koyeb url |
| Render | n4 | worker | leave empty (auto) |

Same on ALL: BOT_TOKEN, MONGO_URI, DB_NAME, OWNER_ID, API_ID, API_HASH, CLUSTER_SECRET.
Different on each: NODE_ID, BASE_URL (and NODE_ROLE only on the gateway).

After changing env: redeploy the GATEWAY last-but-one, check `https://<gateway>/health`, then open the bot -> Panel -> Servers:
all 4 servers must be listed with their own names. If you see only 1, NODE_ID is duplicated.

Set WORKER_URL + WORKER_SECRET (Cloudflare Worker) so share links do not depend on any one server's domain.
