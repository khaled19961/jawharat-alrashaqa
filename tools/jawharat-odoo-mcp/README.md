# Jawharat Al Rashaqa — Odoo JSON-2 MCP

A separate Cloudflare Worker exposing a small authenticated, read-only MCP server for Odoo 20 through the documented External JSON-2 API. This does not assume that Odoo Online provides a built-in `/mcp` endpoint.

## Safety scope

- Bearer token required for MCP clients (`MCP_ACCESS_TOKEN`).
- Odoo API key stored only as a Cloudflare secret (`ODOO_API_KEY`).
- Odoo URL stored as a Cloudflare secret (`ODOO_URL`).
- Strict allowlist of models and fields in `src/index.ts`.
- Read-only tools only: list allowed models, get field metadata, search/read, read by IDs.
- No create, update, delete, posting, stock movement, or payment tools are implemented.
- Not yet deployed or tested against the live database by this commit.

## Deploy

From this directory, run `npm install`, then `npx wrangler secret put ODOO_URL` and enter `https://jawharat-alrashaqa.odoo.com`. Run `npx wrangler secret put ODOO_API_KEY` and paste the API key into the secure prompt. Run `npx wrangler secret put MCP_ACCESS_TOKEN` and set a separate long random token for MCP clients. Never commit either key or send it in chat.

Run `npm run typecheck`, then `npm run dev` for local verification. After verification, run `npm run deploy`. The MCP endpoint path is `/mcp`; use the exact URL Wrangler prints with `/mcp` appended, and do not guess the hostname.

Set the existing assistant Worker's `ODOO_MCP_URL` to that deployed URL and `ODOO_MCP_TOKEN` to the same value as `MCP_ACCESS_TOKEN`. Then verify an actual MCP tool call before claiming the connection works.

Odoo requests use `POST {ODOO_URL}/json/2/{model}/{method}` with `Authorization: bearer {ODOO_API_KEY}` and a JSON body. Odoo access is still governed by the API user's permissions. Use a dedicated minimally privileged Odoo user for this integration.

Writes require a separate reviewed implementation with explicit approval, model-specific validation, and read-back verification. Changing environment variables does not enable writes in this code.