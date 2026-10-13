# Original UI Reference for the Jawharat Al-Rashaqa Odoo Store

This folder contains copies of the original homepage UI source files from the main branch of https://github.com/khaled19961/-D-Nutrition-Care. They are retained strictly as a **design and layout reference** for rebuilding the current Odoo Online store.

## Target brand is Jawharat Al-Rashaqa

- The actual storefront brand must be **جوهرة الرشاقة** (Jawharat Al-Rashaqa where English is needed).
- **D-Nutrition-Care is only the name of the reference source project. It is not the new store's brand.**
- Do not show D-Nutrition-Care anywhere visible to customers: logo, site name, announcement bar, navigation, footer, browser title, SEO metadata, Open Graph, alt text, or page copy.
- Inspect banner/image artwork for embedded source branding. If present, do not show it as-is; use commercially authorized artwork carrying Jawharat Al-Rashaqa branding while preserving the reference layout, banner dimensions, and positioning.
- This reference copy did not modify the original D-Nutrition-Care repository.

## Technical constraints

- Do not deploy this Next.js/React source as an Odoo Online addon. Odoo Online does not run this Next.js application directly.
- Rebuild the same visual layout using Odoo Website Builder/native Odoo website templates and CSS/JS features supported by the current Odoo website.
- Treat the JSX/TSX as the source of truth for content order, structure, navigation, and interaction. Treat globals.css as the source of truth for measurements, colors, spacing, responsive breakpoints, and component styling.
- Read all five source files; do not approximate the design from this README alone.
- Do not change sales/accounting/stock settings as part of the UI port.
- Do not claim an exact match until desktop, tablet, and mobile screenshots have been compared side by side with the reference and the new Jawharat Al-Rashaqa brand has been checked.

## Files

- Original homepage entry point: app/page.tsx
- Homepage sections and product rails: components/home-storefront.tsx
- Announcement/header/footer/chrome: components/site-chrome.tsx
- Desktop/mobile navigation: components/navigation.tsx
- Full styling and responsive CSS: app/globals.css

## Required porting sequence

1. Inspect all five source files and map every visible homepage section in order.
2. Recreate site-wide chrome: announcement strip, header/search, desktop navigation, mobile navigation, and footer as applicable, branded as **جوهرة الرشاقة**.
3. Recreate homepage hero layout, fixed banners, moving carousel, category circles/rails, promotional panels, product rails/empty catalog state, feature cards, and responsive ordering.
4. Reuse existing Odoo product and category records rather than hardcoded fake products/prices. Keep Odoo routes and commerce behavior working.
5. Convert Next.js links/state to Odoo-supported website markup/behavior. Do not copy React/Next imports into Odoo.
6. Preserve dimensions, gaps, border radii, typography, colors, RTL direction, hover behavior, and breakpoints from globals.css as closely as possible without retaining the source brand.
7. Check image assets and replace any source-branded artwork with authorized Jawharat Al-Rashaqa artwork without redesigning the layout.
8. Test browser console and all Odoo links. Confirm the carousel does not throw a null setAttribute error.
9. Compare screenshots at desktop, tablet, and mobile widths. List and correct each visible difference before calling the page finished.

## Original source URLs

- https://github.com/khaled19961/-D-Nutrition-Care/blob/main/app/page.tsx
- https://github.com/khaled19961/-D-Nutrition-Care/blob/main/components/home-storefront.tsx
- https://github.com/khaled19961/-D-Nutrition-Care/blob/main/components/site-chrome.tsx
- https://github.com/khaled19961/-D-Nutrition-Care/blob/main/components/navigation.tsx
- https://github.com/khaled19961/-D-Nutrition-Care/blob/main/app/globals.css
