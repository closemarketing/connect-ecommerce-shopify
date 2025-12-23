// Ejemplo completo de payload de pedido de Shopify
// Basado en la documentación oficial de Shopify
export const mockShopifyOrder = {
  "id": 5740053012723,
  "admin_graphql_api_id": "gid://shopify/Order/5740053012723",
  "app_id": 1966818,
  "browser_ip": "216.191.105.146",
  "buyer_accepts_marketing": false,
  "cancel_reason": null,
  "cancelled_at": null,
  "cart_token": "68778783ad298f1c80c3bafcddeea02f",
  "checkout_id": 33558867828979,
  "checkout_token": "bd5a8aa1ecd019dd3520ff791ee3a24c",
  "client_details": {
    "accept_language": "es-ES,es;q=0.9",
    "browser_height": 1080,
    "browser_ip": "216.191.105.146",
    "browser_width": 1920,
    "session_hash": "abc123session",
    "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
  },
  "closed_at": null,
  "company": null,
  "confirmation_number": "8XZZMTYKY",
  "confirmed": true,
  "contact_email": "juan.perez@example.com",
  "created_at": "2025-12-21T10:30:00-05:00",
  "currency": "EUR",
  "current_subtotal_price": "224.97",
  "current_total_discounts": "0.00",
  "current_total_duties_set": null,
  "current_total_price": "238.47",
  "current_total_tax": "13.50",
  "customer_locale": "es",
  "device_id": null,
  "discount_codes": [],
  "email": "juan.perez@example.com",
  "estimated_taxes": false,
  "financial_status": "paid",
  "fulfillment_status": null,
  "landing_site": "/",
  "landing_site_ref": null,
  "location_id": null,
  "merchant_of_record_app_id": null,
  "name": "#1008",
  "note": null,
  "note_attributes": [],
  "number": 1008,
  "order_number": 1008,
  "order_status_url": "https://integra-clientify.myshopify.com/80130834675/orders/abc123/authenticate?key=def456",
  "original_total_duties_set": null,
  "payment_gateway_names": ["bogus"],
  "phone": "+34612345678",
  "po_number": null,
  "presentment_currency": "EUR",
  "processed_at": "2025-12-21T10:30:00-05:00",
  "reference": null,
  "referring_site": "",
  "source_identifier": null,
  "source_name": "web",
  "source_url": null,
  "subtotal_price": "224.97",
  "tags": "",
  "tax_exempt": false,
  "tax_lines": [
    {
      "price": "13.50",
      "rate": 0.06,
      "title": "IVA",
      "price_set": {
        "shop_money": {
          "amount": "13.50",
          "currency_code": "EUR"
        },
        "presentment_money": {
          "amount": "13.50",
          "currency_code": "EUR"
        }
      },
      "channel_liable": false
    }
  ],
  "taxes_included": false,
  "test": false,
  "token": "abc123token456def789",
  "total_discounts": "0.00",
  "total_line_items_price": "224.97",
  "total_outstanding": "0.00",
  "total_price": "238.47",
  "total_shipping_price_set": {
    "shop_money": {
      "amount": "0.00",
      "currency_code": "EUR"
    },
    "presentment_money": {
      "amount": "0.00",
      "currency_code": "EUR"
    }
  },
  "total_tax": "13.50",
  "total_tip_received": "0.00",
  "total_weight": 3900,
  "updated_at": "2025-12-21T10:30:00-05:00",
  "user_id": null,
  "billing_address": {
    "first_name": "Juan",
    "address1": "Calle Mayor 123",
    "phone": "+34612345678",
    "city": "Madrid",
    "zip": "28001",
    "province": "Madrid",
    "country": "Spain",
    "last_name": "Pérez García",
    "address2": "Piso 3, Puerta B",
    "company": "Mi Empresa SL",
    "latitude": 40.4168,
    "longitude": -3.7038,
    "name": "Juan Pérez García",
    "country_code": "ES",
    "province_code": "M"
  },
  "customer": {
    "id": 7112096006387,
    "email": "juan.perez@example.com",
    "accepts_marketing": false,
    "created_at": "2025-12-20T15:20:00-05:00",
    "updated_at": "2025-12-21T10:30:00-05:00",
    "first_name": "Juan",
    "last_name": "Pérez García",
    "state": "enabled",
    "note": null,
    "verified_email": true,
    "multipass_identifier": null,
    "tax_exempt": false,
    "phone": "+34612345678",
    "email_marketing_consent": {
      "state": "not_subscribed",
      "opt_in_level": "single_opt_in",
      "consent_updated_at": null
    },
    "sms_marketing_consent": null,
    "tags": "",
    "currency": "EUR",
    "accepts_marketing_updated_at": "2025-12-20T15:20:00-05:00",
    "marketing_opt_in_level": null,
    "tax_exemptions": [],
    "admin_graphql_api_id": "gid://shopify/Customer/7112096006387",
    "default_address": {
      "id": 8976543210123,
      "customer_id": 7112096006387,
      "first_name": "Juan",
      "last_name": "Pérez García",
      "company": "Mi Empresa SL",
      "address1": "Calle Mayor 123",
      "address2": "Piso 3, Puerta B",
      "city": "Madrid",
      "province": "Madrid",
      "country": "Spain",
      "zip": "28001",
      "phone": "+34612345678",
      "name": "Juan Pérez García",
      "province_code": "M",
      "country_code": "ES",
      "country_name": "Spain",
      "default": true
    }
  },
  "discount_applications": [],
  "fulfillments": [],
  "line_items": [
    {
      "id": 14291518087411,
      "admin_graphql_api_id": "gid://shopify/LineItem/14291518087411",
      "current_quantity": 2,
      "fulfillable_quantity": 2,
      "fulfillment_service": "manual",
      "fulfillment_status": null,
      "gift_card": false,
      "grams": 1500,
      "name": "Portátil Lenovo ThinkPad - 16GB RAM",
      "price": "899.99",
      "price_set": {
        "shop_money": {
          "amount": "899.99",
          "currency_code": "EUR"
        },
        "presentment_money": {
          "amount": "899.99",
          "currency_code": "EUR"
        }
      },
      "product_exists": true,
      "product_id": 8441257214067,
      "properties": [],
      "quantity": 2,
      "requires_shipping": true,
      "sku": "LAPTOP-LENOVO-16GB",
      "taxable": true,
      "title": "Portátil Lenovo ThinkPad",
      "total_discount": "0.00",
      "total_discount_set": {
        "shop_money": {
          "amount": "0.00",
          "currency_code": "EUR"
        },
        "presentment_money": {
          "amount": "0.00",
          "currency_code": "EUR"
        }
      },
      "variant_id": 45678901234567,
      "variant_inventory_management": "shopify",
      "variant_title": "16GB RAM",
      "vendor": "Lenovo",
      "tax_lines": [
        {
          "channel_liable": false,
          "price": "10.80",
          "price_set": {
            "shop_money": {
              "amount": "10.80",
              "currency_code": "EUR"
            },
            "presentment_money": {
              "amount": "10.80",
              "currency_code": "EUR"
            }
          },
          "rate": 0.06,
          "title": "IVA"
        }
      ],
      "duties": [],
      "discount_allocations": []
    },
    {
      "id": 14291518120179,
      "admin_graphql_api_id": "gid://shopify/LineItem/14291518120179",
      "current_quantity": 1,
      "fulfillable_quantity": 1,
      "fulfillment_service": "manual",
      "fulfillment_status": null,
      "gift_card": false,
      "grams": 900,
      "name": "Mouse Inalámbrico Logitech MX Master 3",
      "price": "99.99",
      "price_set": {
        "shop_money": {
          "amount": "99.99",
          "currency_code": "EUR"
        },
        "presentment_money": {
          "amount": "99.99",
          "currency_code": "EUR"
        }
      },
      "product_exists": true,
      "product_id": 8441257246835,
      "properties": [],
      "quantity": 1,
      "requires_shipping": true,
      "sku": "MOUSE-LOGITECH-MX3",
      "taxable": true,
      "title": "Mouse Inalámbrico Logitech",
      "total_discount": "0.00",
      "total_discount_set": {
        "shop_money": {
          "amount": "0.00",
          "currency_code": "EUR"
        },
        "presentment_money": {
          "amount": "0.00",
          "currency_code": "EUR"
        }
      },
      "variant_id": 45678901234568,
      "variant_inventory_management": "shopify",
      "variant_title": "Negro",
      "vendor": "Logitech",
      "tax_lines": [
        {
          "channel_liable": false,
          "price": "2.70",
          "price_set": {
            "shop_money": {
              "amount": "2.70",
              "currency_code": "EUR"
            },
            "presentment_money": {
              "amount": "2.70",
              "currency_code": "EUR"
            }
          },
          "rate": 0.06,
          "title": "IVA"
        }
      ],
      "duties": [],
      "discount_allocations": []
    }
  ],
  "payment_terms": null,
  "refunds": [],
  "shipping_address": {
    "first_name": "Juan",
    "address1": "Calle Mayor 123",
    "phone": "+34612345678",
    "city": "Madrid",
    "zip": "28001",
    "province": "Madrid",
    "country": "Spain",
    "last_name": "Pérez García",
    "address2": "Piso 3, Puerta B",
    "company": "Mi Empresa SL",
    "latitude": 40.4168,
    "longitude": -3.7038,
    "name": "Juan Pérez García",
    "country_code": "ES",
    "province_code": "M"
  },
  "shipping_lines": [
    {
      "id": 4234567890123,
      "carrier_identifier": null,
      "code": "Standard",
      "discounted_price": "0.00",
      "discounted_price_set": {
        "shop_money": {
          "amount": "0.00",
          "currency_code": "EUR"
        },
        "presentment_money": {
          "amount": "0.00",
          "currency_code": "EUR"
        }
      },
      "phone": null,
      "price": "0.00",
      "price_set": {
        "shop_money": {
          "amount": "0.00",
          "currency_code": "EUR"
        },
        "presentment_money": {
          "amount": "0.00",
          "currency_code": "EUR"
        }
      },
      "requested_fulfillment_service_id": null,
      "source": "shopify",
      "title": "Envío Estándar",
      "tax_lines": [],
      "discount_allocations": []
    }
  ]
};
