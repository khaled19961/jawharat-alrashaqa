import Link from "next/link";
import { SiteChrome } from "@/components/site-chrome";
import { HomeStorefront } from "@/components/home-storefront";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const revalidate = 60;

type Banner = {
  id: string;
  image_url: string;
  alt_ar: string;
  title_ar: string | null;
  subtitle_ar: string | null;
  link_url: string | null;
};

function safeBannerHref(value: string | null) {
  const href = value?.trim();
  if (!href || href.startsWith("#")) return null;
  if (href.startsWith("/") && !href.startsWith("//")) return href;

  try {
    const parsed = new URL(href);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function HomeBanner({ banner, className, loading }: { banner: Banner; className: string; loading: "eager" | "lazy" }) {
  const content = (
    <>
      <img src={banner.image_url} alt={banner.alt_ar || banner.title_ar || "عرض"} loading={loading} decoding="async" />
      {(banner.title_ar || banner.subtitle_ar) && (
        <div className="home-main-banner-caption">
          {banner.title_ar ? <strong>{banner.title_ar}</strong> : null}
          {banner.subtitle_ar ? <span>{banner.subtitle_ar}</span> : null}
        </div>
      )}
    </>
  );
  const href = safeBannerHref(banner.link_url);

  return href
    ? <Link href={href} className={className}>{content}</Link>
    : <div className={className}>{content}</div>;
}

const homeCategories = [
  { name: "مكملات الرياضيين", slug: "supplements", icon: "dumbbell" as const },
  { name: "الجمال والعناية", slug: "beauty", icon: "beauty" as const },
  { name: "التحكم في الوزن", slug: "weight-control", icon: "weight" as const },
  { name: "الصحة والعافية", slug: "health-wellness", icon: "wellness" as const },
  { name: "الأغذية الصحية", slug: "healthy-food", icon: "food" as const },
  { name: "معدات رياضية", slug: "sports-equipment", icon: "sport" as const },
];

const homeProductSections: Array<{ key: string; title: string; categorySlug?: string; brandSlug?: string; featured?: boolean }> = [
  { key: "combos", title: "الكومبوهات الأكثر مبيعًا!!", categorySlug: "best-selling-combos" },
  { key: "empower", title: "امباور نيوتريشن", brandSlug: "empower-nutrition" },
  { key: "pre-workout", title: "اكثر المنتجات مبيعا!! - قبل التمرين", categorySlug: "pre-workout" },
  { key: "vitamins", title: "اكثر المنتجات مبيعا!! - فيتامين", categorySlug: "vitamins" },
  { key: "proteins", title: "اكثر المنتجات مبيعا!! - البروتينات", categorySlug: "proteins" },
  { key: "amino-acids", title: "اكثر المنتجات مبيعا!! - الأحماض الأمينية", categorySlug: "amino-acids" },
  { key: "protein-snacks", title: "اكثر المنتجات مبيعا!! - سناك بروتين", categorySlug: "protein-snacks" },
  { key: "sports-equipment", title: "اكثر المنتجات مبيعا!! - معدات رياضية", categorySlug: "sports-equipment" },
  { key: "featured", title: "منتجات مميزة", featured: true },
];

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();

  const [{ data: banners }, { data: allProducts }, { data: categories }, { data: brands }] = await Promise.all([
    supabase.from("site_banners").select("id,image_url,alt_ar,title_ar,subtitle_ar,link_url").eq("is_active", true).order("sort_order", { ascending: true }).order("created_at", { ascending: false }),
    supabase
      .from("store_products")
      .select("id,name_ar,slug,price,compare_at_price,currency,stock_quantity,is_featured,is_new,brand_id,store_product_images(image_url,alt_ar,sort_order),store_product_categories(category_id)")
      .eq("is_active", true)
      .gt("stock_quantity", 0)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("store_categories").select("id,name_ar,slug").eq("is_active", true),
    supabase.from("store_brands").select("id,name_ar,slug").eq("is_active", true),
  ]);

  const normalizeProducts = (items: any[]) => items.map((product) => {
    const image = [...(product.store_product_images ?? [])].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];
    return {
      id: product.id,
      name_ar: product.name_ar,
      slug: product.slug,
      price: Number(product.price),
      compare_at_price: product.compare_at_price == null ? null : Number(product.compare_at_price),
      currency: product.currency || "SAR",
      stock_quantity: product.stock_quantity,
      is_new: Boolean(product.is_new),
      is_featured: Boolean(product.is_featured),
      image_url: image?.image_url ?? null,
      image_alt: image?.alt_ar ?? null,
    };
  });

  const rawProducts = (allProducts ?? []) as any[];
  const normalizedAll = normalizeProducts(rawProducts);
  const categoryIdBySlug = new Map((categories ?? []).map((item) => [item.slug, item.id]));
  const brandIdBySlug = new Map((brands ?? []).map((item) => [item.slug, item.id]));

  const productsByCategory = (slug: string) => {
    const categoryId = categoryIdBySlug.get(slug);
    if (!categoryId) return [];
    return normalizeProducts(rawProducts.filter((product) =>
      (product.store_product_categories ?? []).some((link: any) => link.category_id === categoryId)
    ).slice(0, 8));
  };

  const productsByBrand = (slug: string) => {
    const brandId = brandIdBySlug.get(slug);
    if (!brandId) return [];
    return normalizeProducts(rawProducts.filter((product) => product.brand_id === brandId).slice(0, 8));
  };

  const featuredProducts = normalizedAll.filter((product) => product.is_featured).slice(0, 8);
  const productSections = Object.fromEntries(homeProductSections.map((section) => [
    section.key,
    section.featured
      ? featuredProducts
      : section.brandSlug
        ? productsByBrand(section.brandSlug)
        : productsByCategory(section.categorySlug!),
  ]));

  const activeBanners = (banners ?? []) as Banner[];
  const fixedBanners = activeBanners.slice(0, 2);
  const movingBanners = activeBanners.slice(2, 10);

  return (
    <SiteChrome>
      <main>
        <section className="hero-storefront" aria-label="البنر الرئيسي">
          <div className="container">
            {activeBanners.length ? (
              <div className="home-hero-layout">
                <div className="home-hero-fixed">
                  {fixedBanners.map((banner, index) => (
                    <HomeBanner key={`${banner.id}-fixed-${index}`} banner={banner} className="home-hero-fixed-banner" loading="eager" />
                  ))}
                </div>
                <div className="home-hero-slider" aria-label="عروض متحركة">
                  <div className="home-hero-slider-track">
                    {[...movingBanners, ...movingBanners].map((banner, index) => (
                      <HomeBanner key={`${banner.id}-slide-${index}`} banner={banner} className="home-hero-slide" loading={index === 0 ? "eager" : "lazy"} />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="hero-banner-empty"><div><span>ابدأ رحلتك الصحية</span><h1>منتجات مختارة لصحتك وعافيتك</h1><p>تصفح المنتجات والعروض من مكان واحد.</p></div></div>
            )}
          </div>
        </section>
        <HomeStorefront
          products={featuredProducts}
          beautyProducts={productsByCategory("beauty")}
          categories={homeCategories}
          productSections={productSections}
        />
      </main>
    </SiteChrome>
  );
}
