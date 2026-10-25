import { createMcpHandler } from "agents/mcp/server";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

interface Env {
  ODOO_URL: string;
  ODOO_API_KEY: string;
  MCP_ACCESS_TOKEN: string;
  ODOO_READ_ONLY?: string;
}

type OdooModel = keyof typeof MODEL_FIELDS;

/**
 * Intentionally narrow allowlist for the first release.
 * No arbitrary model/method access and no write/delete tools.
 */
const MODEL_FIELDS = {
  "res.company": ["id", "name", "currency_id", "country_id", "partner_id"],
  "res.currency": ["id", "name", "symbol", "active", "rounding"],
  "res.country": ["id", "name", "code"],
  "ir.module.module": ["id", "name", "shortdesc", "state", "latest_version"],
  "product.product": ["id", "name", "default_code", "barcode", "categ_id", "active", "product_tmpl_id"],
  "product.template": ["id", "name", "default_code", "barcode", "categ_id", "active", "list_price", "sale_ok", "purchase_ok", "detailed_type", "type"],
  "product.category": ["id", "name", "parent_id"],
  "stock.warehouse": ["id", "name", "code", "partner_id", "company_id"],
  "stock.location": ["id", "name", "complete_name", "usage", "location_id", "company_id"],
  "website": ["id", "name", "domain", "company_id"],
  "website.page": ["id", "name", "url", "is_published", "view_id", "website_id"],
  "website.menu": ["id", "name", "url", "parent_id", "sequence", "website_id"]
} as const;

const MODEL_NAMES = Object.keys(MODEL_FIELDS) as OdooModel[];
const SAFE_FIELD_NAMES = new Set([
  "id", "name", "default_code", "barcode", "categ_id", "active",
  "product_tmpl_id", "list_price", "sale_ok", "purchase_ok", "detailed_type",
  "type", "currency_id", "country_id", "partner_id", "symbol", "rounding",
  "code", "shortdesc", "state", "latest_version", "company_id", "location_id",
  "complete_name", "usage", "domain", "url", "is_published", "view_id",
  "website_id", "parent_id", "sequence"
]);

function textResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function assertModel(model: string): asserts model is OdooModel {
  if (!MODEL_NAMES.includes(model as OdooModel)) {
    throw new Error(`النموذج غير مسموح في نسخة القراءة الآمنة: ${model}. النماذج المسموحة: ${MODEL_NAMES.join(", ")}`);
  }
}

function allowedFields(model: OdooModel, requested?: string[]) {
  const allowed = MODEL_FIELDS[model] as readonly string[];
  if (!requested || requested.length === 0) return [...allowed];
  const invalid = requested.filter((field) => !allowed.includes(field) || !SAFE_FIELD_NAMES.has(field));
  if (invalid.length) throw new Error(`حقول غير مسموح بها للنموذج ${model}: ${invalid.join(", ")}`);
  return [...new Set(requested)];
}

async function odooCall<T>(env: Env, model: OdooModel, method: "fields_get" | "search_read" | "read", params: Record<string, unknown>): Promise<T> {
  if (!env.ODOO_URL || !env.ODOO_API_KEY) throw new Error("إعداد ODOO_URL أو ODOO_API_KEY غير موجود في Cloudflare Secrets.");
  const baseUrl = env.ODOO_URL.replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/json/2/${encodeURIComponent(model)}/${method}`, {
    method: "POST",
    headers: {
      "Authorization": `bearer ${env.ODOO_API_KEY}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(params)
  });
  const body = await response.text();
  if (!response.ok) {
    // Do not leak request headers or credentials. Preserve Odoo's useful error body.
    throw new Error(`Odoo JSON-2 رجع HTTP ${response.status}: ${body.slice(0, 1500)}`);
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error("استجابة Odoo JSON-2 لم تكن JSON صالحًا.");
  }
}

function createServer(env: Env) {
  const server = new McpServer({
    name: "Jawharat Al Rashaqa — Odoo JSON-2",
    version: "0.1.0"
  });

  server.registerTool(
    "odoo_list_allowed_models",
    {
      description: "يعرض النماذج المسموح بقراءتها في إصدار MCP الآمن الحالي. لا يجري أي تغيير في Odoo.",
      inputSchema: z.object({})
    },
    async () => textResult({ mode: "read-only", models: MODEL_NAMES })
  );

  server.registerTool(
    "odoo_get_fields",
    {
      description: "يجلب وصف الحقول الآمنة لنموذج مسموح به في Odoo 20 عبر JSON-2.",
      inputSchema: z.object({
        model: z.string().describe("اسم النموذج مثل product.template"),
        fields: z.array(z.string()).optional().describe("أسماء الحقول المطلوبة؛ يجب أن تكون ضمن القائمة الآمنة")
      })
    },
    async ({ model, fields }) => {
      assertModel(model);
      const requested = allowedFields(model, fields);
      const metadata = await odooCall<Record<string, unknown>>(env, model, "fields_get", {
        attributes: ["string", "type", "required", "readonly", "relation"]
      });
      const filtered = Object.fromEntries(Object.entries(metadata).filter(([key]) => requested.includes(key)));
      return textResult({ model, fields: filtered });
    }
  );

  server.registerTool(
    "odoo_search_read",
    {
      description: "يبحث عن سجلات Odoo ويقرأ حقولًا محددة فقط من النماذج المسموحة. الحد الأقصى 100 سجل، ولا ينفذ أي كتابة.",
      inputSchema: z.object({
        model: z.string().describe("اسم النموذج المسموح"),
        domain: z.array(z.array(z.unknown())).optional().describe("قائمة شروط Odoo domain؛ استخدم شروطًا بسيطة فقط"),
        fields: z.array(z.string()).optional().describe("حقول من القائمة الآمنة للنموذج"),
        limit: z.number().int().min(1).max(100).optional().describe("عدد السجلات، بحد أقصى 100"),
        offset: z.number().int().min(0).max(10000).optional(),
        order: z.string().max(100).optional().describe("ترتيب باستخدام حقول آمنة فقط")
      })
    },
    async ({ model, domain, fields, limit, offset, order }) => {
      assertModel(model);
      const selectedFields = allowedFields(model, fields);
      if (order) {
        const orderFields = order.split(",").map((part) => part.trim().split(/\s+/)[0]);
        if (orderFields.some((field) => !selectedFields.includes(field))) {
          throw new Error("حقل الترتيب يجب أن يكون ضمن الحقول المطلوبة المسموحة.");
        }
      }
      const records = await odooCall<unknown[]>(env, model, "search_read", {
        domain: domain ?? [],
        fields: selectedFields,
        limit: limit ?? 20,
        offset: offset ?? 0,
        ...(order ? { order } : {})
      });
      return textResult({ model, count: records.length, records });
    }
  );

  server.registerTool(
    "odoo_read_records",
    {
      description: "يقرأ سجلات محددة بالمعرّفات من نموذج مسموح وحقول آمنة فقط.",
      inputSchema: z.object({
        model: z.string(),
        ids: z.array(z.number().int().positive()).min(1).max(100),
        fields: z.array(z.string()).optional()
      })
    },
    async ({ model, ids, fields }) => {
      assertModel(model);
      const selectedFields = allowedFields(model, fields);
      const records = await odooCall<unknown[]>(env, model, "read", {
        ids: [...new Set(ids)],
        fields: selectedFields
      });
      return textResult({ model, count: records.length, records });
    }
  );

  return server;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id", "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS" } });
    }

    const configuredToken = env.MCP_ACCESS_TOKEN;
    const supplied = request.headers.get("authorization") ?? "";
    if (!configuredToken || supplied !== `Bearer ${configuredToken}`) {
      return new Response("Unauthorized", { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
    }

    if (env.ODOO_READ_ONLY === "false") {
      // Writes are deliberately not implemented in this release; this flag never enables them.
      return new Response("This MCP build is read-only; write tools are not implemented.", { status: 403 });
    }

    const handler = createMcpHandler(() => createServer(env));
    const response = await handler(request, env as never, ctx as never);
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Mcp-Session-Id");
    headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
};
