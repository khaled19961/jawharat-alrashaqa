import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { callable, routeAgentRequest } from "agents";
import { convertToModelMessages, pruneMessages, stepCountIs, streamText } from "ai";
import { createWorkersAI } from "workers-ai-provider";

const SENSITIVE_TOOL_NAME = /account|invoice|vendor.?bill|customer.?invoice|stock|inventory|purchase|sale.?order|point.?of.?sale|(^|[_:\s-])pos([_:\s-]|$)|bank|tax|zakat|payment|refund|journal|payroll|valuation|reconcile/i;
const READ_ONLY_TOOL_NAME = /search|read|list|retrieve|describe|find|lookup|count|get.?fields|get.?models|get.?context|schema|status/i;

const SAFE_SEARCH_FIELDS: Record<string, readonly string[]> = {
  "res.company": ["id", "name", "currency_id", "country_id", "partner_id"],
  "res.currency": ["id", "name", "symbol", "active", "rounding"],
  "res.country": ["id", "name", "code"],
  "ir.module.module": ["id", "name", "shortdesc", "state", "latest_version"],
  "account.account": ["id", "code", "name", "company_id", "deprecated"],
  "account.journal": ["id", "name", "type", "company_id"],
  "account.tax": ["id", "name", "type_tax_use", "company_id", "active", "amount", "amount_type"],
  "stock.warehouse": ["id", "name", "code", "partner_id", "company_id"],
  "stock.location": ["id", "name", "complete_name", "usage", "location_id", "company_id"],
  "product.product": ["id", "name", "categ_id", "company_id", "active", "product_tmpl_id"],
  "product.template": ["id", "name", "categ_id", "company_id", "active", "list_price", "sale_ok", "purchase_ok", "detailed_type", "type"],
  "product.category": ["id", "name", "parent_id"],
  "website": ["id", "name", "domain", "company_id"],
  "website.page": ["id", "name", "url", "is_published", "view_id", "website_id"],
  "website.menu": ["id", "name", "url", "parent_id", "sequence", "website_id"]
};

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
 odoo-port
  "المرحلة 3 — التنفيذ المنضبط:",
  "- افحص الأدوات الفعلية المتاحة أولًا وحدد هل توجد أدوات قراءة وإنشاء وتحديث. لا تدّع وجود قدرة غير موجودة.",
  "- القراءة والفحص مسموحان ضمن الحقول الآمنة المحددة في الكود.",
  "- يمكن إنشاء أو تحديث صفحات الموقع وقوائمه فقط إذا توفرت أداة فعلية مناسبة وظهر طلب موافقة صريح من المستخدم في واجهة المحادثة. اشرح السجل والحقول والقيم والأثر قبل التنفيذ.",
  "- يمنع الحذف. وتظل المحاسبة والضرائب والزكاة والفواتير والقيود والمخزون والطلبات والأسعار وطرق الدفع والمستخدمون والصلاحيات خارج نطاق التعديل.",
  "- إذا لم توجد أداة مناسبة أو لم تتوفر الموافقة، اعرض خطة فقط ولا تدّع التنفيذ.",

  "المرحلة 3 — إعداد النظام:",
  "- أنشئ خطة تهيئة خطوة بخطوة بالترتيب الصحيح مع متطلبات كل إعداد واعتمادياته وطريقة اختباره والتراجع عنه.",
  "- أدوات MCP المتاحة قد تكون للقراءة فقط. إذا لم توجد أداة كتابة أو تثبيت معتمدة، فلا تدّع القدرة على التنفيذ؛ اكتب تعليمات يطبقها المستخدم بنفسه في واجهة Odoo.",
  "- لا تغيّر أو تنشئ أو تحذف أو تثبّت أو تزيل أي شيء بنفسك. لا تنفذ كتابة أو إجراء تشغيلي؛ اعرض التوصية وانتظر موافقة المستخدم على الخطة التالية فقط، واشرح أن التثبيت اليدوي سيتم في Odoo.",
 main
  "",
  "المرحلة 4 — الموقع بعد اكتمال التهيئة:",
  "- لا تبدأ تخصيص الموقع حتى يراجع المستخدم تقرير الإعدادات ويؤكد أن تهيئة النظام الأساسية انتهت.",
  "- بعدها افحص الصفحة والقوائم وكتل البناء الأصلية داخل Odoo واكتب للمستخدم كودًا متوافقًا مع المكان المستهدف ليضعه يدويًا في محرر Odoo.",
  "- ملفات المرجع البصري هي https://github.com/khaled19961/jawharat-alrashaqa/tree/odoo-port/reference/ui-source . هي مرجع تصميم فقط، وليست موقع التشغيل.",
  "- الاسم التجاري الظاهر للعملاء هو «جوهرة الرشاقة» فقط. لا تعرض اسم D-Nutrition-Care للزوار.",
  "- حافظ على وظائف متجر Odoo الأصلية وروابط المنتجات والأسعار والسلة والدفع. لا تستبدل الكتل الديناميكية بمحتوى ثابت تجريبي.",
  "",
  "قواعد الأمان:",
 odoo-port
  "- لا تعدّل البيانات المالية أو الضرائب أو الزكاة أو الفواتير أو القيود أو المخزون أو الطلبات أو الأسعار أو طرق الدفع أو صلاحيات المستخدمين.",
  "- لا تسمح بإنشاء أو تحديث إلا لنماذج الموقع المدرجة في قائمة السماح داخل الكود، وبعد موافقة المستخدم من واجهة الموافقات.",
  "- لا تحذف أي سجل. لا تعتبر موافقة عامة سابقة موافقة على عملية جديدة.",
  "- قبل التعديل تحقق من اسم النموذج والحقول ومعرّف السجل والقيم والأثر. بعد التنفيذ اقرأ السجل مجددًا للتحقق إن توفرت أداة قراءة مناسبة.",

  "- لا تعدّل البيانات المالية أو الضرائب أو الزكاة أو الفواتير أو القيود أو المخزون أو الطلبات أو الأسعار أو صلاحيات المستخدمين.",
  "- لا تشغّل أداة عامة على نموذج قبل التأكد من اسم النموذج والحقول ومعرّف السجل والأثر. الأدوات العامة للقراءة لا تعدّ أدوات تعديل.",
 main
  "- لا تعرض الأسرار أو مفاتيح API أو كلمات المرور. لا تطلب من المستخدم إرسالها في المحادثة.",
  "- لا تدّعِ أن إعدادًا تغيّر أو تطبيقًا ثُبّت أو موقعًا نُشر إلا إذا كانت هناك أداة مناسبة ونتيجة مؤكدة؛ وفي هذا المشروع يطبق المستخدم التغييرات يدويًا.",
  "",
  "الطريقة:",
  "1. ابدأ بالفحص الداخلي الشامل للقراءة فقط.",
  "2. اعرض تقريرًا واقعيًا يميّز المؤكد عن غير المعروف.",
  "3. قدّم خطة تهيئة وأولويات وتطبيقات مقترحة، ثم انتظر قرار المستخدم قبل الانتقال.",
  "4. انتقل إلى الموقع في المرحلة الأخيرة فقط بعد تأكيد اكتمال تهيئة النظام.",
  "أجب بالعربية وبخطوات عملية واضحة.",
 odoo-port
  "المرفقات: حلل الصور المرفقة بصريًا عندما تصل كملفات صور. ملفات PDF تصل بعد استخراج نصها من المتصفح؛ وضح أن النص المستخرج لا يشمل بالضرورة النص داخل الصور أو الصفحات الممسوحة ضوئيًا.",
  "البحث الخارجي: استخدم أدوات البحث أو موارد MCP أو مصادر Odoo أو أدوات YouTube الفعلية إذا كانت متاحة في قائمة الأدوات الحالية. استشهد بالمصادر والروابط، ولا تدّعِ مشاهدة فيديو أو تصفح الإنترنت ما لم يحدث استدعاء أداة فعلي.",
  "التعلم المنضبط: استخلص تفضيلات التصميم والقرارات من المحادثة والوثائق، ثم اعرض ملخصًا للمستخدم ليوافق عليه كمرجع. لا تدّعِ أنك درّبت النموذج أو غيّرت أوزانه أو خزّنت ذاكرة دائمة إذا لم توجد آلية تخزين مؤكدة. لا تحفظ الأسرار أو البيانات الشخصية الحساسة، ولا تنفذ تغييرات ذاتيًا دون موافقة مستقلة.",

 main
  "",
  "قواعد تنسيق الردود:",
  "- اكتب النثر العربي من دون علامات ترقيم مثل الفاصلة والنقطة والنقطتين وعلامات السؤال والتعجب والأقواس والشرطات وعلامات Markdown.",
  "- حافظ على الأرقام كما هي، بما فيها الأعداد العشرية والتواريخ والأرقام العربية والهندية.",
  "- لا تغيّر الروابط أو الأكواد أو أسماء المتغيرات أو مسارات الملفات أو القيم التقنية؛ اعرضها كما هي كي لا تتعطل.",
  "- استخدم المسافات والأسطر الجديدة بدل علامات الترقيم، واكتب الإجابة مباشرة من دون زخرفة.",
].join("\n");

 odoo-port
function containsImageAttachment(messages: unknown): boolean {
  if (!Array.isArray(messages)) return false;
  return messages.some((message: any) =>
    message?.role === "user" &&
    Array.isArray(message.parts) &&
    message.parts.some((part: any) => part?.type === "file" && typeof part.mediaType === "string" && part.mediaType.startsWith("image/"))
  );
}

 main
function extractLatestUserText(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as { role?: unknown; parts?: unknown };
    if (message?.role !== "user" || !Array.isArray(message.parts)) continue;
    return message.parts
      .filter((part: any) => part?.type === "text" && typeof part.text === "string")
      .map((part: any) => part.text)
      .join("\n")
      .trim();
  }
  return "";
}

function chooseRequiredReadTool(userText: string, toolNames: string[]): string | undefined {
  const asksForLiveOdooData =
    /اعرض|أظهر|ابحث|استعلم|اقرأ|افحص|راجع|تحقق|كم عدد|البيانات الحالية|بيانات الشركة|التطبيقات المثبتة|المنتجات الموجودة|المنتجات في النظام|الحسابات الموجودة|دليل الحسابات|دفاتر اليومية|الضرائب الحالية|المستودعات|المخزون الحالي|داخل أودو|داخل النظام|قاعدة البيانات|سجلات النظام|الإعدادات الحالية|installed modules|database records|current records|search records|read from odoo/i.test(userText);
  if (!asksForLiveOdooData) return undefined;

  const find = (pattern: RegExp) => toolNames.find((name) => pattern.test(name));
  if (/حقول النموذج|الحقول المتاحة|تعريف الحقول|fields of|field schema/i.test(userText)) {
    return find(/get_fields/i) ?? find(/odoo_ai_tool_search|(^|[_-])search$/i);
  }
  if (/قائمة النماذج|النماذج المتاحة|اعرض النماذج|list models|available models/i.test(userText)) {
    return find(/get_models/i) ?? find(/odoo_ai_tool_search|(^|[_-])search$/i);
  }
  if (/السياق الأولي|الشركة النشطة|المنطقة الزمنية|initial context|active company|timezone/i.test(userText)) {
    return find(/mcp_retrieve_initial_context/i) ?? find(/odoo_ai_tool_search|(^|[_-])search$/i);
  }
  return find(/odoo_ai_tool_search|(^|[_-])search$/i);
}

function validateSafeSearchInput(input: unknown): { ok: true } | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "تم منع الاستعلام لأن معاملات البحث ليست كائنًا صالحًا." };
  }
  const value = input as { model_name?: unknown; fields?: unknown };
  const model = typeof value.model_name === "string" ? value.model_name : "";
  const allowedFields = SAFE_SEARCH_FIELDS[model];
  if (!allowedFields) {
    return { ok: false, error: "تم منع القراءة لهذا النموذج لحماية بيانات المعاملات والبيانات الحساسة. النموذج غير موجود في قائمة القراءة الآمنة." };
  }
  if (!Array.isArray(value.fields) || value.fields.some((field) => typeof field !== "string")) {
    return { ok: false, error: "تم منع الاستعلام لأن قائمة الحقول غير صالحة." };
  }
  const disallowed = value.fields.filter((field) => !allowedFields.includes(field));
  if (disallowed.length > 0) {
    return { ok: false, error: "تم منع الاستعلام لأنه يطلب حقولًا خارج قائمة القراءة الآمنة لهذا النموذج: " + disallowed.join(", ") };
  }
  return { ok: true };
}

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
    const savedState = this.getMcpServers();
    const savedServer =
      savedState.servers["odoo"] ??
      Object.values(savedState.servers).find((server) => /odoo/i.test(server.name + " " + server.server_url));

    if (savedServer?.state === "ready") {
      return {
        ok: true,
        state: "ready",
        tools: savedState.tools.length,
        message: "تم الاتصال بخادم Odoo MCP المحفوظ. لا يلزم إعادة إدخال بيانات الاتصال لهذا الاستدعاء.",
      };
    }

    const url = this.env.ODOO_MCP_URL?.trim();
    const token = this.env.ODOO_MCP_TOKEN?.trim();
    if (!url || !token) {
      return {
        ok: false,
        state: savedServer?.state ?? "missing",
        message: "لا يوجد اتصال MCP جاهز محفوظ، كما أن ODOO_MCP_URL أو ODOO_MCP_TOKEN غير متاح في بيئة التشغيل الحالية.",
      };
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
      const execute = (definition as any).execute as (input: any, options: any) => Promise<unknown>;
      const result = await execute({}, {
        toolCallId: "jra-context-" + crypto.randomUUID(),
        messages: [],
      });
      const toolReportedError = Boolean(
        result && typeof result === "object" && (result as { isError?: unknown }).isError === true
      );
      return {
        ok: !toolReportedError,
        source: "live MCP tool execution",
        rawToolName: rawTool.name,
        aiToolName,
        ...(toolReportedError ? { stage: "tool-result", error: "أداة MCP أعادت isError=true" } : {}),
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


  @callable()
  async runReadOnlyAudit(auditKey: string) {
    const jobs: Record<string, { pattern: RegExp; input: Record<string, unknown> }> = {
      models: { pattern: /get_models/i, input: {} },
      company_fields: { pattern: /get_fields/i, input: { model_name: "res.company" } },
      currency_fields: { pattern: /get_fields/i, input: { model_name: "res.currency" } },
      country_fields: { pattern: /get_fields/i, input: { model_name: "res.country" } },
      account_fields: { pattern: /get_fields/i, input: { model_name: "account.account" } },
      journal_fields: { pattern: /get_fields/i, input: { model_name: "account.journal" } },
      tax_fields: { pattern: /get_fields/i, input: { model_name: "account.tax" } },
      warehouse_fields: { pattern: /get_fields/i, input: { model_name: "stock.warehouse" } },
      module_fields: { pattern: /get_fields/i, input: { model_name: "ir.module.module" } },
      company_record: {
        pattern: /odoo_ai_tool_search|(^|[_-])search$/i,
        input: {
          model_name: "res.company",
          domain: "[('id', '=', 1)]",
          fields: ["id", "name", "currency_id", "country_id", "partner_id"],
          limit: 1
        }
      },
      installed_modules: {
        pattern: /odoo_ai_tool_search|(^|[_-])search$/i,
        input: {
          model_name: "ir.module.module",
          domain: "[('name', 'in', ['base', 'web', 'website', 'website_sale', 'account', 'stock'])]",
          fields: ["id", "name", "shortdesc", "state", "latest_version"],
          limit: 10
        }
      },
      account_samples: {
        pattern: /odoo_ai_tool_search|(^|[_-])search$/i,
        input: {
          model_name: "account.account",
          domain: "[('company_id', '=', 1)]",
          fields: ["id", "code", "name", "company_id", "deprecated"],
          limit: 5
        }
      },
      journal_samples: {
        pattern: /odoo_ai_tool_search|(^|[_-])search$/i,
        input: {
          model_name: "account.journal",
          domain: "[('company_id', '=', 1)]",
          fields: ["id", "name", "type", "company_id"],
          limit: 5
        }
      },
      tax_samples: {
        pattern: /odoo_ai_tool_search|(^|[_-])search$/i,
        input: {
          model_name: "account.tax",
          domain: "[('company_id', '=', 1)]",
          fields: ["id", "name", "type_tax_use", "company_id"],
          limit: 5
        }
      },
      warehouse_samples: {
        pattern: /odoo_ai_tool_search|(^|[_-])search$/i,
        input: {
          model_name: "stock.warehouse",
          domain: "[('company_id', '=', 1)]",
          fields: ["id", "name", "code", "company_id"],
          limit: 5
        }
      },
      product_samples: {
        pattern: /odoo_ai_tool_search|(^|[_-])search$/i,
        input: {
          model_name: "product.product",
          domain: "[('id', '>', 0)]",
          fields: ["id", "name", "categ_id", "company_id"],
          limit: 3
        }
      },
    };

    const job = jobs[auditKey];
    if (!job) {
      return { ok: false, stage: "validation", error: "اختبار قراءة غير مسموح به", auditKey };
    }

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
    const rawTool = rawTools.find((item) => job.pattern.test(item.name));
    if (!rawTool) {
      return {
        ok: false,
        stage: "discovery",
        auditKey,
        error: "الأداة المطلوبة غير موجودة في قائمة الأدوات الفعلية",
        availableTools: rawTools.map((item) => item.name),
      };
    }

    const toolSet = this.mcp.getAITools({ serverId: "odoo" });
    const entry = Object.entries(toolSet).find(([name, definition]) =>
      job.pattern.test(name) &&
      typeof (definition as { execute?: unknown }).execute === "function"
    );
    if (!entry) {
      return {
        ok: false,
        stage: "execution-preparation",
        auditKey,
        rawToolName: rawTool.name,
        error: "الأداة اكتُشفت في MCP لكن لم تتوفر لها دالة تنفيذ متوافقة مع AI SDK",
      };
    }

    try {
      const [aiToolName, definition] = entry;
      const execute = (definition as any).execute as (input: unknown, options: unknown) => Promise<unknown>;
      const result = await execute(job.input, {
        toolCallId: "jra-audit-" + auditKey + "-" + crypto.randomUUID(),
        messages: [],
      });
      const toolReportedError = Boolean(
        result && typeof result === "object" && (result as { isError?: unknown }).isError === true
      );
      return {
        ok: !toolReportedError,
        source: "live MCP tool execution",
        auditKey,
        rawToolName: rawTool.name,
        aiToolName,
        input: job.input,
        ...(toolReportedError ? { stage: "tool-result", error: "أداة MCP أعادت isError=true" } : {}),
        result,
      };
    } catch (error) {
      return {
        ok: false,
        stage: "tool-execution",
        auditKey,
        rawToolName: rawTool.name,
        input: job.input,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const allTools = this.mcp.getAITools();
    const websiteScopedTools: Record<string, any> = {};

    for (const [name, definition] of Object.entries(allTools)) {
      // Filter explicitly named write and sensitive tools.
      if (SENSITIVE_TOOL_NAME.test(name)) continue;
      // Aggregation is intentionally disabled in the chat agent; use explicit, limited searches for setup review.
      if (/read.?group/i.test(name)) continue;

      const readOnlyByName =
        READ_ONLY_TOOL_NAME.test(name) &&
        !/create|update|write|delete|unlink|publish|archive|confirm|validate|post|execute|remove|move/i.test(name);

      // The generic Odoo search action is constrained to setup metadata and website structure.
      if (/odoo_ai_tool_search|(^|[_-])search$/i.test(name) && typeof (definition as any).execute === "function") {
        const originalDefinition = definition as any;
        websiteScopedTools[name] = {
          ...originalDefinition,
          execute: async (input: unknown, toolOptions: unknown) => {
            const validation = validateSafeSearchInput(input);
            if (!validation.ok) {
              return { ok: false, source: "local read policy", blocked: true, error: validation.error };
            }
            return originalDefinition.execute(input, toolOptions);
          }
        };
        continue;
      }

 odoo-port
      // Write access is limited server-side to website presentation models and always requires UI approval.
      const isMutationTool = /create|update|write|delete|unlink|publish|archive|confirm|validate|post|execute|remove|move/i.test(name);
      if (isMutationTool) {
        if (/delete|unlink|remove|archive/i.test(name)) {
          websiteScopedTools[name] = {
            ...definition,
            execute: async () => ({ ok: false, blocked: true, source: "server write policy", error: "الحذف غير مسموح به في هذه الأداة." })
          };
          continue;
        }
        const originalDefinition = definition as any;
        websiteScopedTools[name] = {
          ...originalDefinition,
          needsApproval: true,
          execute: async (input: unknown, toolOptions: unknown) => {
            const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
            const model = typeof value.model_name === "string" ? value.model_name : typeof value.model === "string" ? value.model : "";
            const allowedModels = new Set(["website.page", "website.menu", "website", "ir.ui.view", "website.snippet.filter"]);
            if (!allowedModels.has(model)) {
              return { ok: false, blocked: true, source: "server write policy", error: "تم منع التعديل من الخادم. المسموح فقط صفحات الموقع وقوائمه: website.page و website.menu." };
            }
            return originalDefinition.execute(input, toolOptions);
          }
        };
        continue;
      }

      // Read tools remain available only where they pass the existing policy above.
      websiteScopedTools[name] = readOnlyByName ? definition : { ...definition, needsApproval: true };

      // Any non-read tool call must request approval in the chat UI.
      websiteScopedTools[name] = readOnlyByName
        ? definition
        : { ...definition, needsApproval: true };
 main
    }

    const lastUserText = extractLatestUserText(this.messages);
    const requiredReadToolName = chooseRequiredReadTool(lastUserText, Object.keys(websiteScopedTools));

    const workersai = createWorkersAI({ binding: this.env.AI });
    const result = streamText({
      model: workersai(containsImageAttachment(this.messages) ? "@cf/meta/llama-4-scout-17b-16e-instruct" : "@cf/zai-org/glm-4.7-flash", {
        sessionAffinity: this.sessionAffinity
      }),
      system: SYSTEM_PROMPT,
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages",
        reasoning: "before-last-message"
      }),
      tools: websiteScopedTools,
      prepareStep: ({ stepNumber }) => {
        if (stepNumber === 0 && requiredReadToolName) {
          return { toolChoice: { type: "tool", toolName: requiredReadToolName } };
        }
        return { toolChoice: "auto" };
      },
      temperature: 0,
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
