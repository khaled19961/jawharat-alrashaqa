# D-Nutrition-Care Original UI Reference for Odoo

This folder contains copies of the original homepage UI source files from the **main** branch of https://github.com/khaled19961/-D-Nutrition-Care. These copies are reference materials for translating the design into the current Odoo Online website.

## Important

- The original D-Nutrition-Care repository has not been modified by this copy operation.
- Do not deploy this Next.js/React source as an Odoo Online addon. Odoo Online does not run this Next.js application directly.
- Rebuild the same visual layout using Odoo Website Builder/native Odoo website templates and CSS/JS features supported by the current Odoo website.
- Treat the JSX/TSX as the source of truth for content order, structure, navigation, and interaction. Treat globals.css as the source of truth for measurements, colors, spacing, responsive breakpoints, and component styling.
- Do not approximate the design by reading only this README. Read all five source files below.
- Do not change sales/accounting/stock settings as part of the UI port.
- Do not claim an exact match until desktop, tablet, and mobile screenshots have been compared side by side with the reference site.

## Files

- Original homepage entry point: app/page.tsx
- Homepage sections and product rails: components/home-storefront.tsx
- Announcement/header/footer/chrome: components/site-chrome.tsx
- Desktop/mobile navigation: components/navigation.tsx
- Full styling and responsive CSS: app/globals.css

## Required porting sequence

1. Inspect all five source files and map every visible homepage section in its existing order.
2. Recreate site-wide chrome: announcement strip, header/search, desktop navigation, mobile navigation, footer as applicable.
3. Recreate homepage hero layout, fixed banners, moving carousel, category circles/rails, promotional panels, product rails/empty catalog state, feature cards, and responsive ordering.
4. Reuse existing Odoo product and category records rather than hardcoded fake products/prices. Keep Odoo routes and commerce behavior working.
5. Convert Next.js links/state to Odoo-supported website markup/behavior. Do not copy React/Next imports into Odoo.
6. Preserve dimensions, gaps, border radii, typography, colors, RTL direction, hover behavior, and breakpoints from globals.css.
7. Test browser console and all Odoo links. Confirm the carousel does not throw a null setAttribute error.
8. Compare screenshots at desktop, tablet, and mobile widths. List each difference and correct it before calling the page finished.

## Original source URLs

- https://github.com/khaled19961/-D-Nutrition-Care/blob/main/app/page.tsx
- https://github.com/khaled19961/-D-Nutrition-Care/blob/main/components/home-storefront.tsx
- https://github.com/khaled19961/-D-Nutrition-Care/blob/main/components/site-chrome.tsx
- https://github.com/khaled19961/-D-Nutrition-Care/blob/main/components/navigation.tsx
- https://github.com/khaled19961/-D-Nutrition-Care/blob/main/app/globals.css
