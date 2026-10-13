from urllib.parse import urlparse

from odoo import api, fields, models
from odoo.exceptions import ValidationError


class JawharatBanner(models.Model):
    _name = "jawharat.banner"
    _description = "Jawharat Storefront Banner"
    _order = "sequence, id"

    name = fields.Char(string="Banner name", required=True, translate=True)
    image_1920 = fields.Image(string="Banner image", required=True, max_width=3000, max_height=3000)
    alt_text = fields.Char(string="Image description", translate=True)
    link_url = fields.Char(string="Destination URL")
    placement = fields.Selection(
        [("fixed", "Fixed banner"), ("moving", "Moving banner")],
        string="Placement",
        required=True,
        default="moving",
    )
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)

    @api.constrains("link_url")
    def _check_link_url(self):
        for record in self:
            value = (record.link_url or "").strip()
            if not value:
                continue
            if value.startswith("/") and not value.startswith("//"):
                continue
            parsed = urlparse(value)
            if parsed.scheme != "https" or not parsed.netloc:
                raise ValidationError("Use a site-relative path or a full HTTPS URL for the banner destination.")
