"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const items = [
  ["/", "الرئيسية"],
  ["/nutritionists", "الأخصائيون"],
  ["/dashboard", "حسابي"],
  ["/cart", "السلة"],
  ["/more", "المزيد"],
] as const;

const mobileItems = [
  ["/", "⌂", "الرئيسية"],
  ["/categories", "▦", "الفئات"],
  ["/offers", "٪", "العروض"],
  ["/cart", "🛒", "السلة"],
  ["/more", "⋯", "المزيد"],
] as const;

function useCartCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem("dnc-cart");
        const cart = raw ? JSON.parse(raw) : [];
        setCount(Array.isArray(cart) ? cart.reduce((sum, item) => sum + Math.max(0, Number(item?.quantity) || 0), 0) : 0);
      } catch {
        setCount(0);
      }
    };
    load();
    window.addEventListener("dnc-cart-updated", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("dnc-cart-updated", load);
      window.removeEventListener("storage", load);
    };
  }, []);
  return count;
}

export function MainNav() {
  const pathname = usePathname();
  const count = useCartCount();
  return (
    <nav className="desktop-nav" aria-label="التنقل الرئيسي">
      {items.map(([href, label]) => (
        <Link key={href} href={href} className={pathname === href ? "active" : undefined}>
          {label}{href === "/cart" && count > 0 ? <small className="cart-count">{count}</small> : null}
        </Link>
      ))}
    </nav>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const count = useCartCount();
  return (
    <nav className="mobile-nav" aria-label="التنقل للجوال">
      {mobileItems.map(([href, icon, label]) => (
        <Link key={href} href={href} className={pathname === href ? "active" : undefined}>
          <span className="mobile-nav-icon">{icon}{href === "/cart" && count > 0 ? <b className="cart-count">{count}</b> : null}</span>
          <small>{label}</small>
        </Link>
      ))}
    </nav>
  );
}
