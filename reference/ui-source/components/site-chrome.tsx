import Link from "next/link";
import { MainNav, MobileNav } from "@/components/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function SiteChrome({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  const isSignedIn = Boolean(claims?.claims?.sub);
  const { data: settings } = await supabase.from("site_settings").select("setting_key,setting_value");
  const values = Object.fromEntries((settings ?? []).map((item) => [item.setting_key, typeof item.setting_value === "string" ? item.setting_value : JSON.stringify(item.setting_value)]));
  const siteName = values.site_name?.replace(/^"|"$/g, "") || "D-Nutrition-Care";
  const siteLogo = values.site_logo_url?.replace(/^"|"$/g, "") || "";
  const tagline = values.site_tagline?.replace(/^"|"$/g, "") || "رعاية غذائية تبدأ من احتياجك";

  return (
    <div className="site-shell">
      <div className="top-strip">
        <div className="moving-strip-track">
          <span>استشارات غذائية أونلاين</span><span>خطط غذائية شخصية</span><span>متابعة غذائية مستمرة</span><span>أخصائيون تغذية</span><span>برامج غذائية</span><span>استشارات غذائية أونلاين</span><span>خطط غذائية شخصية</span><span>متابعة غذائية مستمرة</span>
        </div>
      </div>
      <div className="quick-header-links">
        <div className="container quick-header-links-inner">
          <Link href="/categories">التغذية العلاجية</Link>
          <Link href="/programs">إنقاص الوزن</Link>
          <Link href="/nutritionists">أخصائيو التغذية</Link>
          <Link href="/booking">احجز استشارتك</Link>
          <Link href="/articles">نصائح غذائية</Link>
        </div>
      </div>
      <header className="main-header">
        <div className="container header-inner">
          <Link href="/" className="brand" aria-label={siteName}>
            {siteLogo ? <img src={siteLogo} alt={siteName} className="brand-logo" /> : <span className="brand-mark">D</span>}
            <span><strong>{siteName}</strong><small>CARE</small></span>
          </Link>
          <MainNav />
          <div className="header-actions">
            <form action="/store" method="get" className="header-search">
              <input name="q" aria-label="ابحث عن المنتجات" placeholder="ابحث في المتجر" />
              <button type="submit">بحث</button>
            </form>
            <div className="header-account-links" aria-label="حساب العميل">
              <Link href={isSignedIn ? "/dashboard" : "/auth/login?next=/dashboard"} className="header-account-link">حسابي</Link>
            </div>
            <Link href="/booking" className="primary-btn">احجز استشارتك</Link>
          </div>
        </div>
      </header>
      <nav className="section-nav" aria-label="أقسام الموقع">
        <div className="container section-nav-inner">
          <Link href="/categories">تسوق حسب الفئة</Link><Link href="/brands">تسوق بالعلامة التجارية</Link><Link href="/branches">فروعنا</Link><Link href="/bundles">عروض الباقات</Link><Link href="/health-weight">حساب الوزن الصحي</Link><Link href="/booking">حجز موعد</Link><Link href="/offers">العروض والخصومات</Link><Link href="/stacks">ستاك وكومبو</Link><Link href="/beauty">عناية وجمال</Link><Link href="/store">المتجر</Link>
        </div>
      </nav>
      {children}
      <footer className="footer">
        <div className="container footer-grid">
          <div><Link href="/" className="brand footer-brand">{siteLogo ? <img src={siteLogo} alt={siteName} className="brand-logo" /> : <span className="brand-mark">D</span>}<span><strong>{siteName}</strong><small>CARE</small></span></Link><p>{tagline}</p></div>
          <div><h4>الخدمات</h4><Link href="/categories">الفئات</Link><Link href="/nutritionists">الأخصائيون</Link><Link href="/booking">الحجز</Link></div>
          <div><h4>المحتوى</h4><Link href="/articles">المقالات</Link><Link href="/programs">البرامج</Link><Link href="/about">من نحن</Link></div>
          <div><h4>المساعدة</h4><Link href="/more#faq">الأسئلة الشائعة</Link><Link href="/more#contact">تواصل معنا</Link><Link href="/more#policies">السياسات</Link><Link href="/admin-login">دخول الإدارة</Link></div>
        </div>
        <div className="container footer-bottom"><span>© {siteName}</span><span>{tagline}</span></div>
      </footer>
      <MobileNav />
    </div>
  );
}
