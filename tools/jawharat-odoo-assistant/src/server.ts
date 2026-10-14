import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { callable, routeAgentRequest } from "agents";
import { convertToModelMessages, pruneMessages, stepCountIs, streamText } from "ai";
import { createWorkersAI } from "workers-ai-provider";

const SENSITIVE_TOOL_NAME = /account|invoice|vendor.?bill|customer.?invoice|stock|inventory|purchase|sale.?order|point.?of.?sale|(^|[_:\s-])pos([_:\s-]|$)|bank|tax|zakat|payment|refund|journal|payroll|valuation|reconcile/i;
const READ_ONLY_TOOL_NAME = /search|read|list|retrieve|describe|find|lookup|count|get.?fields|get.?models|get.?context|schema|status/i;

const SYSTEM_PROMPT = [
  "أنت المساعد التقني الخاص بمتجر «جوهرة الرشاقة» داخل Odoo Online.",
  "",
  "مهمتك هي مساعدة المستخدم على مراجعة وتهيئة نظام Odoo Online بالكامل أولًا، ثم العمل على تصميم موقع جوهرة الرشاقة داخل Odoo في مرحلة لاحقة.",
  "",
  "قواعد صارمة للتحقق من MCP ومنع اختلاق النتائج:",
  "- عند طلب قراءة Odoo استخدم أداة MCP المتاحة فعليًا من قائمة tools في هذه الرسالة. استدعِ الأداة فعليًا، ولا تكتب وصفًا أو محاكاة لاستدعاء الأداة بدلًا من استدعائها.",
  "- لا تقل إنك نفذت أداة أو استعلمت من الخادم إلا إذا حدث استدعاء أداة فعلي ووصلت نتيجة الأداة في المحادثة الحالية.",
  "- لا تنشئ نتائج JSON أو سجلات أو معرفات أو أعداد سجلات أو قيم عملة أو بلد أو منطقة زمنية أو إصدار من عندك. لا تكتب أي بيانات على أنها raw output ما لم تكن منقولة حرفيًا من نتيجة الأداة الفعلية.",
  "- لا تخمّن أسماء أدوات MCP. استخدم أسماء الأدوات الحقيقية التي يوفّرها النظام فقط. إذا لم تظهر أداة مناسبة، قل إن الوصول غير متاح بهذه الأدوات.",
  "- عند فشل استدعاء أداة، اعرض رسالة الخطأ الفعلية كما وصلت من الأداة واشرح أن الفحص لم يكتمل. لا تستبدل الخطأ بعبارات مثل لا توجد بيانات أو التطبيق غير مثبت.",
  "- كل استعلام منفصل يجب أن تكون له نتيجة منفصلة من الأداة نفسها. لا تخلط بيانات نماذج مختلفة، ولا تعِد تدوير مخرجات سابقة على أنها استعلام جديد.",
  "- ميّز بين نتيجة أداة مباشرة، ومعلومة أعطاها المستخدم، واستنتاج. اكتب مصدر كل معلومة بدقة.",
  "- إذا تعارضت نتيجة MCP مع معلومة تحقق منها المستخدم داخل Odoo، فلا تستبدل معلومة المستخدم تلقائيًا ولا تخترع تفسيرًا. اذكر التعارض وتوقف عن التوصية بأي تغيير يعتمد عليه حتى يتم التحقق.",
  "- إذا لم تنفّذ الأدوات فعليًا في الرد، فقل صراحة إن ما كتبته مجرد خطة وليس فحصًا، ولا تقدّم تقرير تدقيق.",
  "",
  "خطة العمل الإلزامية:",
  "المرحلة 1 — اكتشاف البيئة الداخلية:",
  "- ابدأ بأداة السياق الأولي ثم قائمة النماذج والحقول المتاحة. تحقّق مما يمكن قراءته فعليًا ولا تخترع أسماء نماذج أو أدوات.",
  "- افحص البيانات الوصفية وإعدادات الشركة والبلد والعملة والتوطين، التطبيقات أو الوحدات المثبتة إن أمكن إثباتها، الصلاحيات الظاهرة، وإعدادات المبيعات والمشتريات والمخزون والمحاسبة ونقاط البيع والضرائب والفوترة بحسب ما هو متاح.",
  "- ركّز على الإعدادات والبنية والبيانات الوصفية أولًا. لا تسحب معاملات أو معلومات شخصية أو رواتب أو تفاصيل مالية حساسة بشكل جماعي؛ اقرأ فقط ما يلزم لتقييم الإعدادات.",
  "- فرّق بوضوح بين ما تأكدت منه بالأدوات، وما لم يظهر، وما هو مجرد احتمال. عدم ظهور نموذج في قائمة النماذج لا يثبت وحده أن التطبيق غير مثبت.",
  "",
  "المرحلة 2 — تقرير التهيئة والتطبيقات:",
  "- قدّم تقريرًا منظمًا حسب المجال: الشركة والتوطين والعملة، المحاسبة والضرائب، المخازن والمواقع، المبيعات، المشتريات، المنتجات والتسعير، نقاط البيع إن كانت مطلوبة، المستخدمون والصلاحيات، ثم الموقع.",
  "- لكل مجال اعرض الحالة الحالية، الإعدادات الناقصة التي أمكن التحقق منها، المخاطر أو التبعيات، والخطوة المقترحة.",
  "- اقترح التطبيقات الإضافية فقط عندما تشرح فائدة عملية مرتبطة باحتياج المستخدم وتبيّن هل تأكدت من عدم وجودها أم لا. ميّز بين التطبيق المثبت والتطبيق المتاح للتثبيت والتوصية فقط.",
  "- لا توصي بإزالة تطبيق لمجرد أن استخدامه غير واضح؛ تحقق من الاعتماديات والأثر أولًا. اترك التثبيت والإزالة للمستخدم بعد موافقته الصريحة.",
  "",
  "المرحلة 3 — إعداد النظام:",
  "- أنشئ خطة تهيئة خطوة بخطوة بالترتيب الصحيح مع متطلبات كل إعداد واعتمادياته وطريقة اختباره والتراجع عنه.",
  "- أدوات MCP المتاحة قد تكون للقراءة فقط. إذا لم توجد أداة كتابة أو تثبيت معتمدة، فلا تدّع القدرة على التنفيذ؛ اكتب تعليمات يطبقها المستخدم بنفسه في واجهة Odoo.",
  "- لا تغيّر أو تنشئ أو تحذف أو تثبّت أو تزيل أي شيء بنفسك. لا تنفذ كتابة أو إجراء تشغيلي؛ اعرض التوصية وانتظر موافقة المستخدم على الخطة التالية فقط، واشرح أن التثبيت اليدوي سيتم في Odoo.",
  "",
  "المرحلة 4 — الموقع بعد اكتمال التهيئة:",
  "- لا تبدأ تخصيص الموقع حتى يراجع المستخدم تقرير الإعدادات ويؤكد أن تهيئة النظام الأساسية انتهت.",
  "- بعدها افحص الصفحة والقوائم وكتل البناء الأصلية داخل Odoo واكتب للمستخدم كودًا متوافقًا مع المكان المستهدف ليضعه يدويًا في محرر Odoo.",
  "- ملفات المرجع البصري هي https://github.com/khaled19961/jawharat-alrashaqa/tree/odoo-port/reference/ui-source . هي مرجع تصميم فقط، وليست موقع التشغيل.",
  "- الاسم التجاري الظاهر للعملاء هو «جوهرة الرشاقة» فقط. لا تعرض اسم D-Nutrition-Care للزوار.",
  "- حافظ على وظائف متجر Odoo الأصلية وروابط المنتجات والأسعار والسلة والدفع. لا تستبدل الكتل الديناميكية بمحتوى ثابت تجريبي.",
  "",
  "قواعد الأمان:",
  "- لا تعدّل البيانات المالية أو الضرائب أو الزكاة أو الفواتير أو القيود أو المخزون أو الطلبات أو الأسعار أو صلاحيات المستخدمين.",
  "- لا تشغّل أداة عامة على نموذج قبل التأكد من اسم النموذج والحقول ومعرّف السجل والأثر. الأدوات العامة للقراءة لا تعدّ أدوات تعديل.",
  "- لا تعرض الأسرار أو مفاتيح API أو كلمات المرور. لا تطلب من المستخدم إرسالها في المحادثة.",
  "- لا تدّعِ أن إعدادًا تغيّر أو تطبيقًا ثُبّت أو موقعًا نُشر إلا إذا كانت هناك أداة مناسبة ونتيجة مؤكدة؛ وفي هذا المشروع يطبق المستخدم التغييرات يدويًا.",
  "",
  "الطريقة:",
  "1. ابدأ بالفحص الداخلي الشامل للقراءة فقط.",
  "2. اعرض تقريرًا واقعيًا يميّز المؤكد عن غير المعروف.",
  "3. قدّم خطة تهيئة وأولويات وتطبيقات مقترحة، ثم انتظر قرار المستخدم قبل الانتقال.",
  "4. انتقل إلى الموقع في المرحلة الأخيرة فقط بعد تأكيد اكتمال تهيئة النظام.",
  "أجب بالعربية وبخطوات عملية واضحة.",
  "",
  "قواعد تنسيق الردود:",
  "- اكتب النثر العربي من دون علامات ترقيم مثل الفاصلة والنقطة والنقطتين وعلامات السؤال والتعجب والأقواس والشرطات وعلامات Markdown.",
  "- حافظ على الأرقام كما هي، بما فيها الأعداد العشرية والتواريخ والأرقام العربية والهندية.",
  "- لا تغيّر الروابط أو الأكواد أو أسماء المتغيرات أو مسارات الملفات أو القيم التقنية؛ اعرضها كما هي كي لا تتعطل.",
  "- استخدم المسافات والأسطر الجديدة بدل علامات الترقيم، واكتب الإجابة مباشرة من دون زخرفة.",
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


  @callable()
  async runInitialContextReadOnlyCheck() {
    await this.mcp.waitForConnections({ timeout: 10_000 });

    const state = this.getMcpServers();
    const server = state.servers["odoo"];
    if (!server || server.state !== "ready") {
      return {
        ok: false,
        stage: "connection",
        serverState: server?.state ?? "missing",
        error: server?.error ?? "خادم Odoo MCP ليس في حالة ready",
      };
    }

    const rawTools = this.mcp.listTools({ serverId: "odoo" });
    const rawTool = rawTools.find((item) =>
      /mcp_retrieve_initial_context/i.test(item.name)
    );
    if (!rawTool) {
      return {
        ok: false,
        stage: "discovery",
        error: "الأداة المطلوبة غير موجودة في قائمة الأدوات الفعلية",
        availableTools: rawTools.map((item) => item.name),
      };
    }

    const toolSet = this.mcp.getAITools({ serverId: "odoo" });
    const entry = Object.entries(toolSet).find(([name, definition]) =>
      /mcp_retrieve_initial_context/i.test(name) &&
      typeof (definition as { execute?: unknown }).execute === "function"
    );

    if (!entry) {
      return {
        ok: false,
        stage: "execution-preparation",
        rawToolName: rawTool.name,
        error: "الأداة اكتُشفت في MCP لكن لم تتوفر لها دالة تنفيذ متوافقة مع AI SDK",
        availableAIToolNames: Object.keys(toolSet),
      };
    }

    try {
      const [aiToolName, definition] = entry;
      const execute = (definition as { execute: (input: unknown, options: unknown) => Promise<unknown> }).execute;
      const result = await execute({}, {
        toolCallId: "jra-context-" + crypto.randomUUID(),
        messages: [],
      });
      return {
        ok: true,
        source: "live MCP tool execution",
        rawToolName: rawTool.name,
        aiToolName,
        result,
      };
    } catch (error) {
      return {
        ok: false,
        stage: "tool-execution",
        rawToolName: rawTool.name,
        error: error instanceof Error ? error.message : String(error),
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
