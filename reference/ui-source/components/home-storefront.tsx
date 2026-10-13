"use client";

import Link from "next/link";
import { useState } from "react";

type Product = {
  id: string;
  name_ar: string;
  slug: string;
  price: number;
  compare_at_price: number | null;
  currency: string;
  stock_quantity: number;
  is_new: boolean;
  is_featured: boolean;
  image_url?: string | null;
  image_alt?: string | null;
  rating?: number | null;
  reviews_count?: number | null;
};

type Category = {
  name: string;
  slug: string;
  icon: "dumbbell" | "food" | "wellness" | "weight" | "beauty" | "sport";
};

type ProductSection = {
  key: string;
  title: string;
  products: Product[];
  href?: string;
};

const categoryIcons: Record<Category["icon"], React.ReactNode> = {
  dumbbell: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" /></svg>,
  food: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4v7M8 4v7M6.5 11v9M18 4c-3 2-4 4-4 7h3v9M17 11h3" /></svg>,
  wellness: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z" /><path d="M12 9v5M9.5 11.5h5" /></svg>,
  weight: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 20h10l-1.2-11a3.8 3.8 0 0 0-7.6 0L7 20Z" /><path d="M9 9h6M12 9v3" /></svg>,
  beauty: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8l-1 4H9L8 4ZM10 8v12M14 8v12M7 20h10" /></svg>,
  sport: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16M17 4v16M4 7h6M14 7h6M4 17h6M14 17h6" /></svg>,
};

export function HomeStorefront({
  products,
  beautyProducts,
  categories,
  productSections,
}: {
  products: Product[];
  beautyProducts: Product[];
  categories: Category[];
  productSections: Record<string, Product[]>;
}) {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [added, setAdded] = useState<string | null>(null);

  function toggleFavorite(productId: string) {
    setFavorites((current) => current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]);
  }

  function addToCart(product: Product) {
    try {
      const raw = localStorage.getItem("dnc-cart");
      const parsed = raw ? JSON.parse(raw) : [];
      const cart = Array.isArray(parsed) ? parsed : [];
      const existing = cart.find((item) => item?.productId === product.id);
      if (existing) existing.quantity = Number(existing.quantity || 0) + 1;
      else cart.push({
        productId: product.id,
        slug: product.slug,
        name: product.name_ar,
        price: Number(product.price),
        currency: product.currency || "SAR",
        imageUrl: product.image_url || undefined,
        quantity: 1,
      });
      localStorage.setItem("dnc-cart", JSON.stringify(cart));
      window.dispatchEvent(new Event("dnc-cart-updated"));
      setAdded(product.id);
      window.setTimeout(() => setAdded(null), 1400);
    } catch {
      setAdded(null);
    }
  }

  function ProductCard({ product }: { product: Product }) {
    const discount = product.compare_at_price && product.compare_at_price > product.price
      ? Math.round((1 - Number(product.price) / Number(product.compare_at_price)) * 100)
      : null;
    const isFavorite = favorites.includes(product.id);

    return (
      <article className="home-product-card">
        <div className="home-product-media">
          <Link href={`/store/${product.slug}`} className="home-product-image">
            {product.image_url ? <img src={product.image_url} alt={product.image_alt || product.name_ar} loading="lazy" /> : <span className="home-product-placeholder">صورة المنتج</span>}
          </Link>
          <div className="home-product-badges">
            {discount ? <span className="discount-badge">خصم {discount}%</span> : null}
            {product.stock_quantity > 0 && product.is_new ? <span className="shipping-badge">شحن سريع</span> : null}
          </div>
          <button type="button" className={`home-favorite ${isFavorite ? "is-favorite" : ""}`} aria-label={isFavorite ? "إزالة من المفضلة" : "إضافة إلى المفضلة"} onClick={() => toggleFavorite(product.id)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.8c0 5.5-8.8 10.3-8.8 10.3S3.2 14.3 3.2 8.8A4.7 4.7 0 0 1 12 6.1a4.7 4.7 0 0 1 8.8 2.7Z" /></svg>
          </button>
        </div>
        <div className="home-product-body">
          <div className="home-product-rating" aria-label={`تقييم ${product.rating || 4.8} من 5`}>
            <span>★</span><span>★</span><span>★</span><span>★</span><span>★</span>
            {product.reviews_count ? <small>({product.reviews_count})</small> : null}
          </div>
          <Link href={`/store/${product.slug}`} className="home-product-name">{product.name_ar}</Link>
          <div className="home-product-price">
            <strong>{Number(product.price).toLocaleString("ar-SA")} {product.currency || "SAR"}</strong>
            {product.compare_at_price ? <del>{Number(product.compare_at_price).toLocaleString("ar-SA")} {product.currency || "SAR"}</del> : null}
          </div>
          <button type="button" className="home-add-cart" onClick={() => addToCart(product)}>
            <span>{added === product.id ? "تمت الإضافة" : "أضف إلى السلة"}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.2 10.5h10.6L21 7H7" /><circle cx="10" cy="19" r="1.5" /><circle cx="18" cy="19" r="1.5" /></svg>
          </button>
        </div>
      </article>
    );
  }

  function ProductRail({ items, emptyLabel }: { items: Product[]; emptyLabel: string }) {
    if (!items.length) {
      return <div className="home-product-empty">{emptyLabel}</div>;
    }
    return <div className="home-product-rail">{items.map((product) => <ProductCard key={product.id} product={product} />)}</div>;
  }

  function RequestedSection({ title, items, href = "/store" }: { title: string; items: Product[]; href?: string }) {
    return (
      <section className="home-store-section home-requested-section">
        <div className="container">
          <div className="home-store-heading">
            <h2>{title}</h2>
            <Link href={href}>عرض الكل ←</Link>
          </div>
          <ProductRail items={items} emptyLabel="ستظهر المنتجات هنا بعد نشر المنتجات وربطها بالقسم من لوحة الإدارة." />
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="home-category-icons">
        <div className="container">
          <div className="home-category-rail">
            {categories.map((category) => (
              <Link href={`/store?category=${category.slug}`} className="home-category-item" key={category.slug}>
                <span className="home-category-icon">{categoryIcons[category.icon]}</span>
                <strong>{category.name}</strong>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="home-store-section">
        <div className="container">
          <div className="home-store-heading"><h2>عروض مميزة</h2><Link href="/store">عرض الكل ←</Link></div>
          <ProductRail items={products} emptyLabel="ستظهر المنتجات المميزة هنا بعد نشر المنتجات من لوحة الإدارة." />
        </div>
      </section>

      <section className="home-promo home-promo-purple">
        <div className="container home-promo-inner">
          <div><span>عروض المتجر</span><h2>عروض قوية لا تفوت</h2><p>اكتشف منتجات مختارة بأسعار مميزة لفترة محدودة.</p><Link href="/offers">تسوق العروض</Link></div>
          <div className="home-promo-orbs"><i /><i /><i /></div>
        </div>
      </section>

      <section className="home-store-section home-beauty-section">
        <div className="container">
          <div className="home-store-heading"><h2>الأفضل مبيعًا! - الجمال والعناية</h2><Link href="/store?category=beauty">عرض الكل ←</Link></div>
          <ProductRail items={beautyProducts} emptyLabel="ستظهر منتجات الجمال والعناية هنا بعد نشرها من لوحة الإدارة." />
        </div>
      </section>

      <section className="home-dual-promos">
        <div className="container home-dual-grid">
          <Link href="/beauty" className="home-dual-promo home-summer">
            <div><span>العناية والجمال</span><h3>ركن الصيف</h3><p>ترطيب عميق وعناية متكاملة لبشرة صحية</p><b>اطلبي الآن</b></div>
          </Link>
          <Link href="/store?category=supplements" className="home-dual-promo home-supplements">
            <div><span>المكملات الرياضية</span><h3>اختر مكملات موثوقة</h3><p>صحتك تستحق الأفضل</p><b>اطلبه الآن</b></div>
          </Link>
        </div>
      </section>

      <section className="home-discount-section">
        <div className="container">
          <div className="home-discount-heading"><h2>تصفح حسب الخصم</h2></div>
          <div className="home-discount-rail">
            {[["حتى 20%","حتى 20%"],["21% - 30%","من 21% حتى 30%"],["31% - 40%","من 31% حتى 40%"],["41% - 50%","من 41% حتى 50%"],["50%+","أكثر من 50%"]].map(([value,label]) => (
              <Link href={`/offers?discount=${encodeURIComponent(value)}`} className="home-discount-card" key={value}>
                <strong>{value}</strong><span>{label}</span><small>تصفح الآن ←</small>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="home-requested-sections">
        <RequestedSection title="الكومبوهات الأكثر مبيعًا!!" items={productSections.combos ?? []} href="/store?category=best-selling-combos" />
        <RequestedSection title="امباور نيوتريشن" items={productSections.empower ?? []} href="/store?brand=empower-nutrition" />
        <RequestedSection title="اكثر المنتجات مبيعا!! - قبل التمرين" items={productSections["pre-workout"] ?? []} href="/store?category=pre-workout" />
        <RequestedSection title="اكثر المنتجات مبيعا!! - فيتامين" items={productSections.vitamins ?? []} href="/store?category=vitamins" />
        <RequestedSection title="اكثر المنتجات مبيعا!! - البروتينات" items={productSections.proteins ?? []} href="/store?category=proteins" />
        <RequestedSection title="اكثر المنتجات مبيعا!! - الأحماض الأمينية" items={productSections["amino-acids"] ?? []} href="/store?category=amino-acids" />
        <RequestedSection title="اكثر المنتجات مبيعا!! - سناك بروتين" items={productSections["protein-snacks"] ?? []} href="/store?category=protein-snacks" />
        <RequestedSection title="اكثر المنتجات مبيعا!! - معدات رياضية" items={productSections["sports-equipment"] ?? []} href="/store?category=sports-equipment" />
        <RequestedSection title="منتجات مميزة" items={productSections.featured ?? []} href="/store?featured=true" />
      </div>
    </>
  );
}
