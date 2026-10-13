import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { callable, routeAgentRequest } from "agents";
import { convertToModelMessages, pruneMessages, stepCountIs, streamText } from "ai";
import { createWorkersAI } from "workers-ai-provider";

const SENSITIVE_TOOL_NAME = /account|invoice|vendor.?bill|customer.?invoice|stock|inventory|purchase|sale.?order|point.?of.?sale|(^|[_:\s-])pos([_:\s-]|$)|bank|tax|zakat|payment|refund|journal|payroll|valuation|reconcile/i;
const READ_ONLY_TOOL_NAME = /search|read|list|retrieve|describe|find|lookup|count|get.?fields|get.?models|get.?context|schema|status/i;

const SYSTEM_PROMPT = [
  "أنت المساعد التقني الخاص بمتجر «جوهرة الرشاقة» داخل Odoo Online.",
  "",
  "مهمتك الأساسية هي فحص وتحسين واجهة الموقع ومحتواه المرئي اعتمادًا على ملفات المرجع الموجودة في مستودع GitHub:",
  "https://github.com/khaled19961/jawharat-alrashaqa/tree/odoo-port/reference/ui-source",
  "",
  "قواعد الهوية:",
  "- الاسم التجاري الظاهر للعميل هو «جوهرة الرشاقة» فقط.",
  "- اسم D-Nutrition-Care اسم مرجع التصميم، ولا تعرضه للزوار أو تضعه في العناوين أو النصوص أو الصور.",
  "- احتفظ بتخطيط المرجع وألوانه وأبعاده قدر الإمكان، لكن حوّل التنفيذ إلى ما تدعمه Odoo Online.",
  "",
  "قواعد الأمان والنطاق:",
  "- اعمل فقط على الموقع والصفحات والتخطيط والقوائم والبنرات ووسائط الموقع وإعدادات SEO الخاصة بالموقع.",
  "- لا تعدّل الحسابات أو الضرائب أو الزكاة أو الفواتير أو القيود أو المخزون أو تقييم المخزون أو المشتريات أو نقاط البيع أو الطلبات أو الأسعار أو صلاحيات المستخدمين.",
  "- إذا كانت أداة عامة مثل إنشاء/تحديث سجل، افحص اسم النموذج والحقول والمعرّف بعناية قبل طلب اعتماد المستخدم. لا تستخدمها على نموذج خارج نطاق الموقع.",
  "- أي أداة ليست قراءة/بحثًا يجب أن تطلب موافقة المستخدم قبل التنفيذ. اشرح التغيير الذي ستنفذه. لا تتجاوز طلب الموافقة ولا تفترض أن المستخدم وافق مسبقًا.",
  "- لا تنشر تغييرات ولا تحذف أو تستبدل أصولًا موجودة قبل مراجعة الهدف والتحقق من البديل. لا تدّعِ أنك نفذت أمرًا إذا فشلت الأداة.",
  "- إذا لم تكن أداة تعديل الموقع اللازمة متاحة عبر MCP، قل ذلك بوضوح وحدد الإجراء أو الصلاحية المفقودة.",
  "- لا تغيّر شيئًا غير متعلق بواجهة الموقع حتى لو ظهر في أدوات Odoo.",
  "",
  "الطريقة:",
  "1. افحص الصفحة الحالية والأدوات المتاحة أولًا.",
  "2. لخّص التغييرات المقترحة قبل أي تعديل.",
  "3. نفّذ التغييرات المتعلقة بالموقع فقط بعد الموافقة المطلوبة.",
  "4. تحقق من النتيجة بالأدوات المتاحة، ولا تدّعِ تحققًا بصريًا إلا إذا كان لديك دليل فعلي.",
  "أجب بالعربية وبخطوات عملية واضحة."
].join("\n");

export class JawharatOdooAgent extends AIChatAgent<Env> {
  maxPersistedMessages = 40;
  chatRecovery = true;
  waitForMcpConnections = true;

  async onStart() {
    this.mcp.configureOAuthCallback({
      customHandler: (result) => {
        if (result.authSuccess) {
          return new Response("<script>window.close();</script>", {
            headers: { "content-type": "text/html; charset=utf-8" },
            status: 200
          });
        }
        return new Response("تعذر إكمال مصادقة Odoo.", {
          headers: { "content-type": "text/plain; charset=utf-8" },
          status: 400
        });
      }
    });

    const url = this.env.ODOO_MCP_URL?.trim();
    const token = this.env.ODOO_MCP_TOKEN?.trim();
    if (!url || !token) {
      console.warn("Odoo MCP is not configured. Add ODOO_MCP_URL and ODOO_MCP_TOKEN as Worker variables/secrets.");
      return;
    }

    const existing = Object.values(this.getMcpServers().servers).find(
      (server) => server.server_url === url && server.state === "ready"
    );
    if (existing) return;

    try {
      await this.addMcpServer("Odoo — جوهرة الرشاقة", url, {
        id: "odoo",
        transport: {
          type: "streamable-http",
          headers: { Authorization: "Bearer " + token }
        }
      });
    } catch (error) {
      console.error("Odoo MCP connection failed:", error instanceof Error ? error.message : "Unknown connection error");
    }
  }

  @callable()
  async reconnectOdoo() {
    const url = this.env.ODOO_MCP_URL?.trim();
    const token = this.env.ODOO_MCP_TOKEN?.trim();
    if (!url || !token) {
      return { ok: false, message: "يلزم ضبط ODOO_MCP_URL و ODOO_MCP_TOKEN في إعدادات Worker." };
    }

    try {
      const current = this.getMcpServers();
      const found = Object.entries(current.servers).find(([, server]) => server.server_url === url && server.state === "ready");
      if (!found) {
        await this.addMcpServer("Odoo — جوهرة الرشاقة", url, {
          id: "odoo",
          transport: {
            type: "streamable-http",
            headers: { Authorization: "Bearer " + token }
          }
        });
      }
      const state = this.getMcpServers();
      const server = Object.values(state.servers).find((item) => item.server_url === url);
      return {
        ok: server?.state === "ready",
        state: server?.state ?? "connecting",
        tools: state.tools.length,
        message: server?.error ?? (server?.state === "ready" ? "تم الاتصال بخادم Odoo MCP." : "الاتصال قيد الفحص؛ راجع حالة الخادم.")
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "تعذر الاتصال بخادم Odoo MCP."
      };
    }
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const allTools = this.mcp.getAITools();
    const websiteScopedTools: Record<string, any> = {};

    for (const [name, definition] of Object.entries(allTools)) {
      // Clearly finance, tax, inventory, procurement, and POS tools are not available here.
      if (SENSITIVE_TOOL_NAME.test(name)) continue;

      const readOnlyByName =
        READ_ONLY_TOOL_NAME.test(name) &&
        !/create|update|write|delete|unlink|publish|archive|confirm|validate|post|execute|remove|move/i.test(name);

      // Any non-read tool call must request approval in the chat UI.
      websiteScopedTools[name] = readOnlyByName
        ? definition
        : { ...definition, needsApproval: true };
    }

    const workersai = createWorkersAI({ binding: this.env.AI });
    const result = streamText({
      model: workersai("@cf/zai-org/glm-4.7-flash", {
        sessionAffinity: this.sessionAffinity
      }),
      system: SYSTEM_PROMPT,
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages",
        reasoning: "before-last-message"
      }),
      tools: websiteScopedTools,
      stopWhen: stepCountIs(8),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/login" && request.method === "POST") {
      return handleLogin(request, env);
    }

    if (url.pathname === "/api/session" && request.method === "GET") {
      const authenticated = await hasValidSession(request, env);
      return Response.json({ authenticated });
    }

    if (url.pathname === "/api/logout" && request.method === "POST") {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Set-Cookie": "jra_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"
        }
      });
    }

    if (url.pathname.startsWith("/agents/")) {
      if (!(await hasValidSession(request, env))) {
        return Response.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
      }
      return (await routeAgentRequest(request, env)) ?? new Response("Not found", { status: 404 });
    }

    return new Response("Not found", { status: 404 });
  }
};

async function handleLogin(request: Request, env: Env) {
  if (!env.APP_PASSWORD || !env.SESSION_SECRET) {
    return Response.json(
      { error: "لم تكتمل إعدادات الأمان في Cloudflare Worker." },
      { status: 503 }
    );
  }

  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return Response.json({ error: "صيغة الطلب غير صحيحة." }, { status: 415 });
  }

  let body: { password?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "تعذر قراءة الطلب." }, { status: 400 });
  }

  const supplied = typeof body.password === "string" ? body.password : "";
  if (!constantTimeEqual(supplied, env.APP_PASSWORD)) {
    return Response.json({ error: "كلمة المرور غير صحيحة." }, { status: 401 });
  }

  const expires = Date.now() + 8 * 60 * 60 * 1000;
  const signature = await signExpiry(expires, env.SESSION_SECRET);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": "jra_session=" + expires + "." + signature + "; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800"
    }
  });
}

async function hasValidSession(request: Request, env: Env): Promise<boolean> {
  if (!env.SESSION_SECRET) return false;
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookie = cookieHeader
    .split(";")
    .map((piece) => piece.trim())
    .find((piece) => piece.startsWith("jra_session="))
    ?.slice("jra_session=".length);
  if (!cookie) return false;

  const separator = cookie.indexOf(".");
  if (separator < 1) return false;
  const expires = Number(cookie.slice(0, separator));
  const providedSignature = cookie.slice(separator + 1);
  if (!Number.isSafeInteger(expires) || expires <= Date.now()) return false;

  const expectedSignature = await signExpiry(expires, env.SESSION_SECRET);
  return constantTimeEqual(providedSignature, expectedSignature);
}

async function signExpiry(expires: number, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(expires)));
  const bytes = new Uint8Array(signature);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function constantTimeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;
  for (let i = 0; i < length; i++) {
    difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return difference === 0;
}
