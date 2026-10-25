import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import type { MCPServersState } from "agents";
import type { JawharatOdooAgent } from "./server";

type SessionResponse = { authenticated?: boolean; error?: string };
type LoginResponse = { ok?: boolean; error?: string };


const READ_ONLY_AUDIT_OPTIONS = [
  { key: "models", label: "قائمة النماذج" },
  { key: "company_fields", label: "حقول الشركة" },
  { key: "currency_fields", label: "حقول العملة" },
  { key: "country_fields", label: "حقول البلد" },
  { key: "account_fields", label: "حقول الحسابات" },
  { key: "journal_fields", label: "حقول الدفاتر" },
  { key: "tax_fields", label: "حقول الضرائب" },
  { key: "warehouse_fields", label: "حقول المستودعات" },
  { key: "module_fields", label: "حقول التطبيقات" },
  { key: "company_record", label: "قراءة سجل الشركة مباشرة" },
  { key: "installed_modules", label: "قراءة التطبيقات المثبتة مباشرة" },
  { key: "account_samples", label: "عينة دليل الحسابات المباشرة" },
  { key: "journal_samples", label: "قراءة دفاتر اليومية مباشرة" },
  { key: "tax_samples", label: "قراءة الضرائب مباشرة" },
  { key: "warehouse_samples", label: "قراءة المستودعات مباشرة" },
  { key: "product_samples", label: "عينة المنتجات المباشرة" }
] as const;

function removeAssistantPunctuation(text: string): string {
  const protectedParts: string[] = [];
  const protect = (value: string) => {
    const marker = "JRAKEEP" + "X".repeat(protectedParts.length + 1) + "TOKEN";
    protectedParts.push(value);
    return marker;
  };

  let cleaned = text
    .replace(/```[\s\S]*?```|`[^`\n]*`/gu, protect)
    .replace(/https?:\/\/[^\s<>"'`]+/gu, protect)
    .replace(/\b[A-Za-z][A-Za-z0-9]*(?:[_./:@+-][A-Za-z0-9]+)+\b/gu, protect)
    .replace(/\p{N}+(?:[.,٫٬:/-]\p{N}+)*/gu, protect)
    .replace(/[\p{P}|~<>=]+/gu, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  protectedParts.forEach((value, index) => {
    const marker = "JRAKEEP" + "X".repeat(index + 1) + "TOKEN";
    cleaned = cleaned.replace(marker, value);
  });

  return cleaned;
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ password })
      });
      const data = (await response.json()) as LoginResponse;
      if (!response.ok || !data.ok) {
        setError(data.error || "تعذر تسجيل الدخول.");
        return;
      }
      setPassword("");
      onLogin();
    } catch {
      setError("تعذر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-mark" aria-hidden="true">ج</div>
        <p className="eyebrow">JAWAHARAT AL-RASHAQA</p>
        <h1>مساعد جوهرة الرشاقة</h1>
        <p className="muted">وكيل خاص لمساعدة الإدارة في مهام واجهة المتجر.</p>
        <label htmlFor="agent-password">كلمة مرور الدخول</label>
        <input
          id="agent-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="أدخل كلمة مرور المساعد"
        />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? "جارٍ التحقق…" : "دخول"}
        </button>
        <p className="security-note">تُحفظ بيانات الاتصال بـ Odoo في إعدادات الخادم ولا تظهر داخل المتصفح.</p>
      </form>
    </main>
  );
}

function ToolPart({
  part,
  approve
}: {
  part: UIMessage["parts"][number];
  approve: (response: { id: string; approved: boolean }) => void;
}) {
  if (!isToolUIPart(part)) return null;
  const item = part as unknown as {
    state?: string;
    input?: unknown;
    output?: unknown;
    errorText?: string;
    approval?: { id?: string; approved?: boolean };
  };
  const name = getToolName(part);
  const approvalId = item.approval?.id;

  if (item.state === "approval-requested") {
    return (
      <div className="tool-card approval-card">
        <strong>موافقة مطلوبة قبل التنفيذ</strong>
        <p className="tool-name">{name}</p>
        <pre>{JSON.stringify(item.input ?? {}, null, 2)}</pre>
        <div className="tool-actions">
          <button type="button" className="primary-button small" disabled={!approvalId}
            onClick={() => approvalId && approve({ id: approvalId, approved: true })}>موافقة</button>
          <button type="button" className="secondary-button small" disabled={!approvalId}
            onClick={() => approvalId && approve({ id: approvalId, approved: false })}>رفض</button>
        </div>
        <p className="security-note">لا توافق إلا إذا كان التغيير متعلقًا بواجهة الموقع ولم يمسّ المحاسبة أو المخزون أو الطلبات.</p>
      </div>
    );
  }

  if (item.state === "output-available") {
    return (
      <details className="tool-card">
        <summary>نتيجة الأداة: {name}</summary>
        <pre>{JSON.stringify(item.output, null, 2)}</pre>
      </details>
    );
  }

  if (item.state === "output-error") {
    return <div className="tool-card error">تعذر تنفيذ الأداة {name}: {item.errorText || "خطأ غير معروف"}</div>;
  }

  return <div className="tool-progress">يعمل على الأداة: {name}…</div>;
}

function Chat({ onLogout }: { onLogout: () => void }) {
  const [connected, setConnected] = useState(false);
  const [mcpState, setMcpState] = useState<MCPServersState>({
    prompts: [],
    resources: [],
    servers: {},
    tools: []
  });
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [contextAuditResult, setContextAuditResult] = useState<unknown>(null);
  const [contextAuditBusy, setContextAuditBusy] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [copyErrorMessageId, setCopyErrorMessageId] = useState<string | null>(null);
  const agent = useAgent<JawharatOdooAgent>({
    agent: "JawharatOdooAgent",
    name: "main",
    onOpen: useCallback(() => setConnected(true), []),
    onClose: useCallback(() => setConnected(false), []),
    onMcpUpdate: useCallback((state: MCPServersState) => setMcpState(state), [])
  });

  const { messages, sendMessage, clearHistory, addToolApprovalResponse, stop, status } = useAgentChat({ agent });
  const busy = status === "streaming" || status === "submitted";
  const servers = useMemo(() => Object.values(mcpState.servers), [mcpState]);
  const odooServer = servers.find((server) => /odoo/i.test(server.name + " " + server.server_url));
  const isOdooReady = odooServer?.state === "ready";
  const toolNames = mcpState.tools.map((tool) => tool.name);
  const readToolCount = toolNames.filter((name) => /search|read|list|retrieve|get.?models|get.?fields|describe|lookup/i.test(name) && !/create|update|write|delete|unlink/i.test(name)).length;
  const createToolCount = toolNames.filter((name) => /create/i.test(name) && !/delete/i.test(name)).length;
  const updateToolCount = toolNames.filter((name) => /update|write/i.test(name) && !/delete/i.test(name)).length;

  async function copyAssistantMessage(message: UIMessage) {
    const textToCopy = message.parts
      .map((part) => part.type === "text" ? removeAssistantPunctuation(part.text) : "")
      .filter((text) => text.trim().length > 0)
      .join("\n\n");

    if (!textToCopy) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = textToCopy;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("Clipboard unavailable");
      }

      setCopiedMessageId(message.id);
      setCopyErrorMessageId(null);
    } catch {
      setCopyErrorMessageId(message.id);
      setCopiedMessageId(null);
    }
  }

  async function runInitialContextReadOnlyCheck() {
    setContextAuditBusy(true);
    setContextAuditResult(null);
    try {
      const result = await agent.stub.runInitialContextReadOnlyCheck();
      setContextAuditResult(result);
    } catch (error) {
      setContextAuditResult({
        ok: false,
        stage: "client-call",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setContextAuditBusy(false);
    }
  }


  async function runReadOnlyAudit(auditKey: string) {
    setContextAuditBusy(true);
    setContextAuditResult(null);
    try {
      const result = await agent.stub.runReadOnlyAudit(auditKey);
      setContextAuditResult(result);
    } catch (error) {
      setContextAuditResult({
        ok: false,
        stage: "client-call",
        auditKey,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setContextAuditBusy(false);
    }
  }

  async function reconnect() {
    setConnectionMessage("جارٍ فحص الاتصال...");
    try {
      const result = await agent.stub.reconnectOdoo();
      setConnectionMessage(result.message || (result.ok ? "الاتصال جاهز." : "لم يتأكد الاتصال."));
    } catch {
      setConnectionMessage("تعذر الوصول إلى خدمة Odoo. راجع إعدادات الخادم.");
    }
  }

  async function logout() {
    try {
      await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
    } finally {
      onLogout();
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if ((!text && attachments.length === 0) || busy) return;
    setAttachmentError("");
    try {
      const parts: any[] = [{ type: "text", text: text || "حلل الملفات المرفقة واستخرج منها الهوية البصرية والمعلومات المهمة. لا تنفذ أي تغيير في Odoo دون عرض التفاصيل وطلب الموافقة." }];
      for (const file of attachments) {
        if (file.type === "application/pdf") {
          const buffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: buffer, isEvalSupported: false }).promise;
          const pages: string[] = [];
          for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 40); pageNumber += 1) {
            const page = await pdf.getPage(pageNumber);
            const content = await page.getTextContent();
            const pageText = content.items.map((item: any) => typeof item.str === "string" ? item.str : "").join(" ");
            pages.push("صفحة " + pageNumber + ": " + pageText);
          }
          parts[0].text += "\n\nمحتوى PDF: " + file.name + "\n" + pages.join("\n").slice(0, 80000);
          if (pdf.numPages > 40) parts[0].text += "\nتم استخراج أول 40 صفحة فقط.";
        } else {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error("تعذرت قراءة الملف " + file.name));
            reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("صيغة الملف غير مدعومة"));
            reader.readAsDataURL(file);
          });
          parts.push({ type: "file", mediaType: file.type, filename: file.name, url: dataUrl });
        }
      }
      sendMessage({ role: "user", parts });
      setInput("");
      setAttachments([]);
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "تعذر تجهيز الملفات");
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">ج</div>
          <div>
            <strong>مساعد جوهرة الرشاقة</strong>
            <span>واجهة المتجر وOdoo</span>
          </div>
        </div>
        <div className="header-actions">
          <span className={connected ? "connection-pill online" : "connection-pill"}>{connected ? "الاتصال بالخدمة قائم" : "جارٍ الاتصال…"}</span>
          <button className="secondary-button" type="button" onClick={logout}>خروج</button>
        </div>
      </header>

      <section className="connection-panel">
        <div>
          <strong>{isOdooReady ? "Odoo متصل" : "اتصال Odoo غير مؤكد"}</strong>
          <p>{isOdooReady ? "أدوات Odoo المتاحة: " + mcpState.tools.length : "راجع عنوان MCP ومفتاحه وصلاحيات الأدوات في إعدادات الخادم."}</p>
          <p>أزرار القراءة المباشرة تستدعي أدوات MCP من الخادم بمعاملات ثابتة وتعرض النتيجة المعادة دون تمريرها عبر النموذج اللغوي</p>
          {connectionMessage && <p className="connection-message">{connectionMessage}</p>}
        </div>
        <div className="connection-actions">
          <button className="secondary-button" type="button" onClick={reconnect}>فحص الاتصال</button>
          <button className="primary-button" type="button" onClick={() => void runInitialContextReadOnlyCheck()} disabled={contextAuditBusy}>
            {contextAuditBusy ? "جارٍ تنفيذ قراءة MCP..." : "اختبار قراءة السياق"}
          </button>
          {READ_ONLY_AUDIT_OPTIONS.map((option) => (
            <button
              key={option.key}
              className="secondary-button"
              type="button"
              onClick={() => void runReadOnlyAudit(option.key)}
              disabled={contextAuditBusy}
            >
              {option.label}
            </button>
          ))}
        </div>
 odoo-port
      </section>
      {contextAuditResult !== null && (
        <section className="tool-card mcp-audit-result">
          <div className="message-heading">
            <strong>نتيجة الاستدعاء المباشر من خادم MCP</strong>
            <button
              type="button"
              className="copy-message-button"
              onClick={() => {
                void navigator.clipboard?.writeText(JSON.stringify(contextAuditResult, null, 2));
              }}
            >
              نسخ النتيجة
            </button>
          </div>
          <pre>{JSON.stringify(contextAuditResult, null, 2)}</pre>
        </section>
      )}

      <section className="connection-panel capability-panel">
        <div>
          <strong>قدرات الأدوات المتاحة فعليًا</strong>
          <p>الأرقام مستخرجة من قائمة أدوات MCP المتصلة وليست تقديرًا من النموذج</p>
        </div>
        <div className="capability-list">
          <span className="capability-chip">قراءة وفحص <b>{readToolCount}</b></span>
          <span className="capability-chip">إنشاء <b>{createToolCount}</b></span>
          <span className="capability-chip">تحديث <b>{updateToolCount}</b></span>
          <span className="capability-chip">إجمالي الأدوات <b>{mcpState.tools.length}</b></span>
        </div>

 main
      </section>
      {contextAuditResult !== null && (
        <section className="tool-card mcp-audit-result">
          <div className="message-heading">
            <strong>نتيجة الاستدعاء المباشر من خادم MCP</strong>
            <button
              type="button"
              className="copy-message-button"
              onClick={() => {
                void navigator.clipboard?.writeText(JSON.stringify(contextAuditResult, null, 2));
              }}
            >
              نسخ النتيجة
            </button>
          </div>
          <pre>{JSON.stringify(contextAuditResult, null, 2)}</pre>
        </section>
      )}

      <section className="safety-banner">
        <strong>نطاق آمن</strong>
        <span>المساعد مخصص للموقع. أي أداة تعديل تحتاج موافقتك، وأدوات المحاسبة والمخزون والطلبات مستبعدة بالاسم.</span>
      </section>

      <section className="chat-panel" aria-label="محادثة المساعد">
        {messages.length === 0 ? (
          <div className="empty-chat">
            <div className="empty-icon">✦</div>
            <h1>كيف نطوّر واجهة المتجر؟</h1>
            <p>يمكنك أن تطلب فحص صفحة الموقع أو مراجعة تصميم جوهرة الرشاقة. سيعرض المساعد طلب الموافقة قبل أي إجراء تعديل متاح.</p>
            <button type="button" className="suggestion" onClick={() => setInput("افحص أدوات Odoo المتاحة وحدد هل توجد أدوات آمنة لتعديل الصفحة الرئيسية فقط دون تغيير المنتجات أو المحاسبة أو المخزون.")}>
              افحص الأدوات المتاحة لتعديل الصفحة الرئيسية
            </button>
          </div>
        ) : (
          <div className="messages">
            {messages.map((message) => (
              <article className={message.role === "user" ? "message user-message" : "message assistant-message"} key={message.id}>
                <div className="message-heading">
                  <div className="message-role">{message.role === "user" ? "أنت" : "مساعد جوهرة الرشاقة"}</div>
                  {message.role === "assistant" && message.parts.some((part) => part.type === "text" && part.text.trim().length > 0) && (
                    <button
                      type="button"
                      className="copy-message-button"
                      title="نسخ نص رد المساعد"
                      onClick={() => void copyAssistantMessage(message)}
                      aria-label="نسخ رسالة المساعد"
                    >
                      {copiedMessageId === message.id
                        ? "تم النسخ ✓"
                        : copyErrorMessageId === message.id
                          ? "تعذر النسخ"
                          : "نسخ الرسالة"}
                    </button>
                  )}
                </div>
                {message.parts.map((part, index) => {
                  if (part.type === "text") return <div className="message-text" key={message.id + "-" + index}>{message.role === "assistant" ? removeAssistantPunctuation(part.text) : part.text}</div>;
                  return <ToolPart key={message.id + "-" + index} part={part} approve={addToolApprovalResponse} />;
                })}
              </article>
            ))}
          </div>
        )}
        <form className="composer" onSubmit={submit}>
          <input
            id="assistant-attachments"
            className="attachment-input"
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            multiple
            onChange={(event) => {
              const chosen = Array.from(event.currentTarget.files ?? []);
              const valid = chosen.filter((file) => file.size <= 12 * 1024 * 1024 && (file.type === "application/pdf" || ["image/png", "image/jpeg", "image/webp"].includes(file.type)));
              setAttachments((current) => [...current, ...valid].slice(0, 8));
              setAttachmentError(chosen.length !== valid.length ? "الملفات المسموحة صور PNG/JPG/WEBP وPDF بحجم أقصى 12MB للملف وبحد أقصى 8 ملفات." : "");
              event.currentTarget.value = "";
            }}
          />
          <label className="attach-button" htmlFor="assistant-attachments">إرفاق صور أو PDF</label>
          {attachments.length > 0 && <div className="attachment-list">{attachments.map((file, index) => <span className="attachment-chip" key={file.name + file.size + index}>{file.name}<button type="button" aria-label={"إزالة " + file.name} onClick={() => setAttachments((current) => current.filter((_, i) => i !== index))}>×</button></span>)}</div>}
          {attachmentError && <p className="error" role="alert">{attachmentError}</p>}
          <textarea
            rows={2}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="اكتب طلبك بالعربية…"
            aria-label="اكتب رسالتك"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <div className="composer-footer">
            <span>Enter للإرسال · Shift+Enter لسطر جديد</span>
            <div className="composer-actions">
              {messages.length > 0 && <button type="button" className="secondary-button" onClick={() => void clearHistory()}>مسح المحادثة</button>}
              {busy && <button type="button" className="secondary-button" onClick={() => stop()}>إيقاف</button>}
              <button className="primary-button" type="submit" disabled={busy || (!input.trim() && attachments.length === 0)}>{busy ? "جارٍ العمل…" : "إرسال"}</button>
            </div>
          </div>
        </form>
      </section>
      <footer className="page-footer">تأكد من قراءة تفاصيل أي إجراء ومراجعته قبل الموافقة عليه.</footer>
    </main>
  );
}

export default function App() {
  const [checked, setChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  const checkSession = useCallback(async () => {
    try {
      const response = await fetch("/api/session", { credentials: "same-origin", cache: "no-store" });
      const data = (await response.json()) as SessionResponse;
      setAuthenticated(data.authenticated === true);
    } catch {
      setAuthenticated(false);
    } finally {
      setChecked(true);
    }
  }, []);

  useEffect(() => { void checkSession(); }, [checkSession]);

  if (!checked) return <main className="loading-shell">جارٍ تحميل مساعد جوهرة الرشاقة…</main>;
  if (!authenticated) return <Login onLogin={() => { setAuthenticated(true); }} />;
  return <Chat onLogout={() => { setAuthenticated(false); }} />;
}
