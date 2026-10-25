import { createMcpHandler } from "agents/mcp/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

interface Env {
  ODOO_URL: string;
  ODOO_API_KEY: string;
  MCP_ACCESS_TOKEN: string;
  ODOO_ENABLE_WRITES?: string;
  ODOO_ENABLE_ARBITRARY_METHODS?: string;
}

const MAX_RECORDS = 100;
const MODEL_NAME = /^[a-zA-Z0-9_.]+$/;
const METHOD_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function textResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function validateModel(model: string): void {
  if (!MODEL_NAME.test(model) || model.startsWith(".") || model.endsWith(".") || model.includes("..")) {
    throw new Error("اسم نموذج Odoo غير صالح.");
  }
}

function validateMethod(method: string): void {
  if (!METHOD_NAME.test(method) || method.startsWith("__")) {
    throw new Error("اسم method غير صالح أو محظور.");
  }
}

function requireWriteAccess(env: Env, action: string): void {
  if (env.ODOO_ENABLE_WRITES !== "true") {
    throw new Error(`عملية ${action} معطلة حاليًا. فعّل ODOO_ENABLE_WRITES=true في Cloudflare Secrets بعد مراجعة الصلاحيات والنسخ الاحتياطي.`);
  }
}

async function odooCall<T>(
  env: Env,
  model: string,
  method: string,
  params: Record<string, unknown>
): Promise<T> {
  validateModel(model);
  validateMethod(method);
  if (!env.ODOO_URL || !env.ODOO_API_KEY) {
    throw new Error("إعداد ODOO_URL أو ODOO_API_KEY غير موجود في Cloudflare Secrets.");
  }
  const baseUrl = env.ODOO_URL.replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/json/2/${encodeURIComponent(model)}/${encodeURIComponent(method)}`, {
    method: "POST",
    headers: {
      Authorization: `bearer ${env.ODOO_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(params)
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Odoo JSON-2 رجع HTTP ${response.status}: ${body.slice(0, 2000)}`);
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error("استجابة Odoo JSON-2 لم تكن JSON صالحًا.");
  }
}

function createServer(env: Env) {
  const server = new McpServer({
    name: "Jawharat Al Rashaqa — Full Odoo JSON-2",
    version: "0.2.0"
  });

  server.registerTool("odoo_list_models", {
    description: "اكتشاف نماذج Odoo المتاحة للمستخدم الحالي. تظهر فقط النماذج التي يمكن استرجاعها من ir.model، وتظل صلاحيات السجلات محكومة بحساب Odoo.",
    inputSchema: z.object({
      search: z.string().max(100).optional().describe("اختياري: فلترة اسم النموذج أو وصفه"),
      limit: z.number().int().min(1).max(500).optional()
    })
  }, async ({ search, limit }) => {
    const domain: unknown[] = [];
    if (search?.trim()) {
      domain.push("|", ["model", "ilike", search.trim()], ["name", "ilike", search.trim()]);
    }
    const models = await odooCall<unknown[]>(env, "ir.model", "search_read", {
      domain,
      fields: ["id", "model", "name", "state", "transient"],
      limit: limit ?? 200,
      order: "model"
    });
    return textResult({ count: models.length, models });
  });

  server.registerTool("odoo_get_fields", {
    description: "يعرض تعريفات حقول أي نموذج Odoo متاح: النوع، الاسم، العلاقة، القراءة فقط، والمتطلبات.",
    inputSchema: z.object({
      model: z.string(),
      attributes: z.array(z.enum(["string", "type", "required", "readonly", "relation", "help", "selection", "store"])).optional()
    })
  }, async ({ model, attributes }) => {
    const fields = await odooCall<Record<string, unknown>>(env, model, "fields_get", {
      attributes: attributes ?? ["string", "type", "required", "readonly", "relation", "help"]
    });
    return textResult({ model, count: Object.keys(fields).length, fields });
  });

  server.registerTool("odoo_search_read", {
    description: "بحث وقراءة سجلات من أي نموذج Odoo، مع domain وحقول وترتيب وحد أقصى 100 سجل لكل استدعاء.",
    inputSchema: z.object({
      model: z.string(),
      domain: z.array(z.unknown()).optional(),
      fields: z.array(z.string()).min(1).max(200).optional(),
      limit: z.number().int().min(1).max(MAX_RECORDS).optional(),
      offset: z.number().int().min(0).max(100000).optional(),
      order: z.string().max(200).optional(),
      context: z.record(z.string(), z.unknown()).optional()
    })
  }, async ({ model, domain, fields, limit, offset, order, context }) => {
    const records = await odooCall<unknown[]>(env, model, "search_read", {
      domain: domain ?? [],
      fields: fields ?? ["display_name"],
      limit: limit ?? 20,
      offset: offset ?? 0,
      ...(order ? { order } : {}),
      ...(context ? { context } : {})
    });
    return textResult({ model, count: records.length, records });
  });

  server.registerTool("odoo_read_records", {
    description: "قراءة سجلات محددة بمعرّفاتها من أي نموذج Odoo.",
    inputSchema: z.object({
      model: z.string(),
      ids: z.array(z.number().int().positive()).min(1).max(MAX_RECORDS),
      fields: z.array(z.string()).min(1).max(200).optional(),
      context: z.record(z.string(), z.unknown()).optional()
    })
  }, async ({ model, ids, fields, context }) => {
    const records = await odooCall<unknown[]>(env, model, "read", {
      ids: [...new Set(ids)],
      fields: fields ?? ["display_name"],
      ...(context ? { context } : {})
    });
    return textResult({ model, count: records.length, records });
  });

  server.registerTool("odoo_create_records", {
    description: "تنبيه للمساعد: لا تستدعِ أداة الإنشاء قبل أن تعرض للمستخدم النموذج والقيم والأثر المتوقع وتحصل على موافقته الصريحة في المحادثة على هذه العملية بعينها. إنشاء سجل أو أكثر في أي نموذج يملك مستخدم Odoo صلاحية الإنشاء عليه. يتطلب ODOO_ENABLE_WRITES=true. confirm_write داخل الأداة حاجز تقني إضافي وليس دليلًا مستقلًا على موافقة المستخدم.",
    inputSchema: z.object({
      model: z.string(),
      values: z.union([z.record(z.string(), z.unknown()), z.array(z.record(z.string(), z.unknown())).min(1).max(50)]),
      context: z.record(z.string(), z.unknown()).optional(),
      confirm_write: z.literal(true).describe("يجب تمرير true للتأكيد الصريح على تنفيذ الكتابة")
    })
  }, async ({ model, values, context, confirm_write }) => {
    if (confirm_write !== true) throw new Error("يلزم تأكيد الكتابة.");
    requireWriteAccess(env, "create");
    const vals = Array.isArray(values) ? values : [values];
    const ids = await odooCall<number[]>(env, model, "create", {
      vals_list: vals,
      ...(context ? { context } : {})
    });
    const records = await odooCall<unknown[]>(env, model, "read", {
      ids,
      fields: ["display_name"]
    });
    return textResult({ operation: "create", model, ids, verification: records });
  });

  server.registerTool("odoo_update_records", {
    description: "تنبيه للمساعد: لا تستدعِ أداة التعديل قبل عرض النموذج ومعرّفات السجلات والقيم الحالية والجديدة والأثر المتوقع والحصول على موافقة المستخدم الصريحة لهذه العملية بعينها. تعديل سجلات يملك مستخدم Odoo صلاحية تعديلها. يتطلب ODOO_ENABLE_WRITES=true. confirm_write حاجز إضافي وليس دليلًا مستقلًا على موافقة المستخدم.",
    inputSchema: z.object({
      model: z.string(),
      ids: z.array(z.number().int().positive()).min(1).max(MAX_RECORDS),
      values: z.record(z.string(), z.unknown()),
      context: z.record(z.string(), z.unknown()).optional(),
      confirm_write: z.literal(true).describe("يجب تمرير true للتأكيد الصريح على تنفيذ الكتابة")
    })
  }, async ({ model, ids, values, context, confirm_write }) => {
    if (confirm_write !== true) throw new Error("يلزم تأكيد الكتابة.");
    requireWriteAccess(env, "write");
    const uniqueIds = [...new Set(ids)];
    const result = await odooCall<boolean>(env, model, "write", {
      ids: uniqueIds,
      vals: values,
      ...(context ? { context } : {})
    });
    const verification = await odooCall<unknown[]>(env, model, "read", {
      ids: uniqueIds,
      fields: ["display_name"]
    });
    return textResult({ operation: "write", model, ids: uniqueIds, result, verification });
  });

  server.registerTool("odoo_delete_records", {
    description: "تنبيه للمساعد: لا تستدعِ أداة الحذف قبل عرض النموذج ومعرّفات السجلات واسمها/ملخصها والأثر غير القابل للعكس والحصول على موافقة صريحة خاصة بالحذف من المستخدم. حذف سجلات Odoo نهائيًا. يتطلب تفعيل الكتابة وتأكيدًا إضافيًا مطابقًا للنموذج والمعرّفات. هذا التأكيد التقني وحده لا يثبت موافقة المستخدم.",
    inputSchema: z.object({
      model: z.string(),
      ids: z.array(z.number().int().positive()).min(1).max(20),
      confirm_delete: z.literal(true),
      confirm_phrase: z.string().min(1).max(500)
    })
  }, async ({ model, ids, confirm_delete, confirm_phrase }) => {
    if (confirm_delete !== true) throw new Error("الحذف غير مؤكد.");
    requireWriteAccess(env, "unlink");
    const uniqueIds = [...new Set(ids)];
    const expected = `DELETE ${model} ${uniqueIds.join(",")}`;
    if (confirm_phrase !== expected) {
      throw new Error(`تأكيد الحذف غير مطابق. لتأكيد هذه العملية تحديدًا يجب أن تكون العبارة: ${expected}`);
    }
    const result = await odooCall<boolean>(env, model, "unlink", { ids: uniqueIds });
    return textResult({ operation: "unlink", model, ids: uniqueIds, result, note: "تم استدعاء unlink؛ تحقّق من النتيجة قبل اعتبار الحذف مؤكدًا." });
  });

  server.registerTool("odoo_call_method", {
    description: "تنبيه للمساعد: قبل استدعاء أي method غير قراءة، اشرح للمستخدم اسم النموذج واسم method والمعاملات والأثر المحتمل، وانتظر موافقته الصريحة على هذا الاستدعاء بعينه. قد تنفذ methods إجراءات أعمال مؤثرة. يتطلب ODOO_ENABLE_WRITES=true وODOO_ENABLE_ARBITRARY_METHODS=true. confirm_execution حاجز إضافي وليس دليلًا مستقلًا على موافقة المستخدم.",
    inputSchema: z.object({
      model: z.string(),
      method: z.string(),
      parameters: z.record(z.string(), z.unknown()).optional().describe("معاملات method المسماة كما تتطلبها واجهة Odoo JSON-2"),
      confirm_execution: z.literal(true).describe("تأكيد أن method قد تنفذ إجراء أعمال أو تغييرات")
    })
  }, async ({ model, method, parameters, confirm_execution }) => {
    if (confirm_execution !== true) throw new Error("يلزم تأكيد استدعاء method.");
    requireWriteAccess(env, "method call");
    if (env.ODOO_ENABLE_ARBITRARY_METHODS !== "true") {
      throw new Error("استدعاء methods العامة معطل. فعّل ODOO_ENABLE_ARBITRARY_METHODS=true فقط بعد مراجعة المخاطر.");
    }
    validateMethod(method);
    const result = await odooCall<unknown>(env, model, method, parameters ?? {});
    return textResult({ model, method, result });
  });

  return server;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version",
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS"
        }
      });
    }

    const configuredToken = env.MCP_ACCESS_TOKEN;
    const supplied = request.headers.get("authorization") ?? "";
    if (!configuredToken || supplied !== `Bearer ${configuredToken}`) {
      return new Response("Unauthorized", { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
    }

    const handler = createMcpHandler(() => createServer(env));
    const response = await handler(request, env as never, ctx as never);
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version");
    headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
};
