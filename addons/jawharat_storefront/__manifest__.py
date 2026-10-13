{
    "name": "Jawharat Al Rashaqa Storefront",
    "summary": "Arabic RTL storefront theme and Odoo Website integration for Jawharat Al Rashaqa",
    "version": "20.0.1.0.0",
    "category": "Website/eCommerce",
    "author": "Jawharat Al Rashaqa",
    "license": "LGPL-3",
    "depends": ["website", "website_sale"],
    "data": [
        "views/layout.xml",
        "views/homepage.xml"
    ],
    "assets": {
        "web.assets_frontend": [
            "jawharat_storefront/static/src/css/storefront.css",
            "jawharat_storefront/static/src/js/storefront.js"
        ]
    },
    "installable": true,
    "application": false
}
