# Holded API — Complete Documentation

> **Base URL:** `https://api.holded.com/api/v2`  
> **Authentication:** Bearer Token  
> **Format:** JSON  
> **Version:** v2

---

## Table of Contents

- [Holded API — Complete Documentation](#holded-api--complete-documentation)
	- [Table of Contents](#table-of-contents)
	- [Guides](#guides)
		- [Getting started](#getting-started)
			- [Prerequisites](#prerequisites)
			- [1. Base URL](#1-base-url)
			- [2. Authentication](#2-authentication)
			- [3. Make your first call](#3-make-your-first-call)
		- [Authentication](#authentication)
			- [Getting your API key](#getting-your-api-key)
			- [Using your API key](#using-your-api-key)
			- [Permissions](#permissions)
			- [Security best practices](#security-best-practices)
		- [Pagination](#pagination)
			- [How it works](#how-it-works)
			- [Query parameters](#query-parameters)
			- [Example: Fetch all pages](#example-fetch-all-pages)
		- [Error handling](#error-handling)
			- [Error format](#error-format)
			- [HTTP status codes](#http-status-codes)
		- [API limits](#api-limits)
			- [Limits per plan](#limits-per-plan)
			- [Two counter types](#two-counter-types)
			- [429 response example](#429-response-example)
			- [Rate limit headers](#rate-limit-headers)
			- [Best practices](#best-practices)
		- [Webhooks](#webhooks)
	- [API Reference](#api-reference)
	- [ACCOUNTING](#accounting)
		- [Accounting](#accounting-1)
			- [POST `/api/v2/accounting-accounts` — Create an accounting account](#post-apiv2accounting-accounts--create-an-accounting-account)
		- [Expenses Accounts](#expenses-accounts)
		- [Payment](#payment)
		- [Purchases](#purchases)
		- [Tax](#tax)
		- [Inbox](#inbox)
	- [TREASURY](#treasury)
		- [Banking accounts](#banking-accounts)
		- [Payment Methods](#payment-methods)
		- [Remittances](#remittances)
		- [Invoicing Forecast](#invoicing-forecast)
	- [SALES](#sales)
		- [Invoices](#invoices)
		- [Recurring Invoices](#recurring-invoices)
		- [Sales Receipts](#sales-receipts)
		- [Receipt Notes](#receipt-notes)
		- [Estimates](#estimates)
		- [Proformas](#proformas)
		- [Credit Notes](#credit-notes)
		- [Services](#services)
		- [Sales Channels](#sales-channels)
		- [Numbering Series](#numbering-series)
	- [INVENTORY](#inventory)
		- [Products](#products)
		- [Price Lists](#price-lists)
		- [Warehouses](#warehouses)
		- [Sales Orders](#sales-orders)
		- [Waybills](#waybills)
		- [Purchase Orders](#purchase-orders)
		- [Purchase Shipments](#purchase-shipments)
		- [Documents](#documents)
		- [Production Orders](#production-orders)
	- [CONTACTS](#contacts)
		- [Contact](#contact)
		- [Contact Group](#contact-group)
		- [Tags](#tags)
	- [CRM](#crm)
		- [Funnels](#funnels)
		- [Leads](#leads)
	- [PROJECTS](#projects)
		- [Projects](#projects-1)
		- [Tasks](#tasks)
		- [Project Time Tracking](#project-time-tracking)
	- [TEAM \& HR](#team--hr)
		- [Employees](#employees)
		- [Employee Time Tracking](#employee-time-tracking)
		- [Salary records](#salary-records)
	- [CALENDAR](#calendar)
		- [Events](#events)
		- [Bookings](#bookings)
	- [INBOX (module)](#inbox-module)
	- [Quick Reference — All Endpoints by Module](#quick-reference--all-endpoints-by-module)
	- [Common Response Codes](#common-response-codes)
	- [Useful Links](#useful-links)

---

## Guides

### Getting started

Everything you need to make your first API call to Holded.

#### Prerequisites

- A Holded account with API access enabled
- Your API key from the Holded dashboard (`Settings → API`)
- A tool for making HTTP requests (curl, Postman, or your preferred language)

#### 1. Base URL

All API requests are made to:

```
https://api.holded.com
```

#### 2. Authentication

Include your API key in the `Authorization` header of every request:

```bash
Authorization: Bearer YOUR_API_KEY
```

#### 3. Make your first call

List your invoices to verify everything is working:

```bash
curl -X GET "https://api.holded.com/api/v2/invoices?limit=5" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: application/json"
```

```javascript
const res = await fetch("https://api.holded.com/api/v2/invoices?limit=5", {
  headers: { "Authorization": "Bearer YOUR_API_KEY" }
});
const data = await res.json();
```

```python
import requests
response = requests.get(
    "https://api.holded.com/api/v2/invoices",
    params={"limit": 5},
    headers={"Authorization": "Bearer YOUR_API_KEY"}
)
print(response.json())
```

---

### Authentication

The Holded API uses **Bearer token** authentication. Every request must include a valid API key in the `Authorization` header.

#### Getting your API key

1. Go to `Settings → API` in your Holded account
2. Click "Generate new key"
3. Copy the key and store it securely — it won't be shown again

#### Using your API key

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://api.holded.com/api/v2/invoices
```

#### Permissions

Each API key has scoped permissions. Endpoints document which permission they require (e.g., `sales:invoices.read`). If your key lacks the required permission, you'll receive a `403 Forbidden` response.

#### Security best practices

- Never expose your API key in client-side code
- Use environment variables to store keys
- Rotate keys periodically
- Use the minimum required permissions for each key

---

### Pagination

The Holded API uses **cursor-based pagination** for list endpoints.

#### How it works

Every list endpoint response includes:

| Field | Type | Description |
|-------|------|-------------|
| `items` | array | Array of results for the current page |
| `cursor` | string | Opaque string to pass as a query parameter for the next page |
| `has_more` | boolean | Whether more results exist |

#### Query parameters

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `limit` | integer | 25 | 100 | Number of results per page |
| `cursor` | string | — | — | Cursor returned from the previous response |

#### Example: Fetch all pages

```javascript
let cursor = null;
let allInvoices = [];

do {
  const url = new URL("https://api.holded.com/api/v2/invoices");
  url.searchParams.set("limit", "50");
  if (cursor) url.searchParams.set("cursor", cursor);

  const res = await fetch(url, {
    headers: { "Authorization": "Bearer YOUR_API_KEY" },
  });
  const data = await res.json();

  allInvoices.push(...data.items);
  cursor = data.cursor;
} while (cursor);

console.log(`Fetched ${allInvoices.length} invoices`);
```

```python
import requests

cursor = None
all_invoices = []

while True:
    params = {"limit": 50}
    if cursor:
        params["cursor"] = cursor

    res = requests.get(
        "https://api.holded.com/api/v2/invoices",
        params=params,
        headers={"Authorization": "Bearer YOUR_API_KEY"}
    )
    data = res.json()
    all_invoices.extend(data["items"])
    cursor = data.get("cursor")
    if not cursor:
        break
```

---

### Error handling

The Holded API uses **standard HTTP status codes** and returns error details in a consistent JSON format.

#### Error format

```json
{
  "type": "https://api.holded.com/problems/not-found",
  "title": "Not Found",
  "status": 404,
  "detail": "The requested invoice was not found."
}
```

#### HTTP status codes

| Code | Name | Description |
|------|------|-------------|
| `400` | Bad Request | Invalid parameters or malformed request body |
| `401` | Unauthorized | Missing or invalid API key |
| `403` | Forbidden | Valid API key but insufficient permissions |
| `404` | Not Found | The requested resource does not exist |
| `422` | Unprocessable Entity | Valid JSON but semantic validation failed |
| `429` | Too Many Requests | Rate limit exceeded — wait and retry |
| `500` | Internal Server Error | Something went wrong on Holded's end |

---

### API limits

The Holded API enforces **two limits in parallel**: a per-minute burst window and a monthly quota.

#### Limits per plan

| Plan | Req / minute | Calls / month |
|------|-------------|---------------|
| Plus | 60 | 500 |
| Basic | 60 | 2,000 |
| Standard | 120 | 7,500 |
| Advanced | 120 | 30,000 |
| Premium | 600 | 100,000+ (overage billed) |

> Limits apply **account-wide**. All API keys on the same account share the same counters — adding more keys does not increase your budget.

#### Two counter types

**Per minute (burst):** Catches short spikes of activity. The first counter to fill up returns `429`.

**Per month (quota):** Your total monthly call budget. Lower plans return `429` once the cap is reached. Premium plans bill overage automatically with no hard stop.

#### 429 response example

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60
X-RateLimit-Limit: 1500
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1715692800
X-RateLimit-Window: minute

{
  "type": "https://api.holded.com/problems/rate-limit",
  "title": "Rate limit exceeded",
  "status": 429,
  "detail": "You have reached the per-minute limit (1500). Retry in 60 seconds."
}
```

#### Rate limit headers

| Header | Description |
|--------|-------------|
| `Retry-After` | Seconds to wait before retrying |
| `X-RateLimit-Limit` | The cap of the window that was hit |
| `X-RateLimit-Remaining` | Requests remaining in the current window |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |
| `X-RateLimit-Window` | Which window triggered: `minute` or `month` |

#### Best practices

- **Honor `Retry-After`**: Always wait the exact number of seconds returned — do not retry sooner
- **Exponential backoff**: For repeated 429s, increase wait time on each retry: 1s, 2s, 4s, 8s — add jitter to avoid thundering herds
- **Batch when possible**: Combine multiple operations in a single request where the endpoint allows it
- **Use webhooks for events**: Don't poll — subscribe to webhooks for real-time updates without consuming your quota
- **Cache reads**: Reference data (products, contacts, tax rates) changes rarely — cache locally and refresh on schedule
- **Monitor `X-RateLimit-Remaining`**: Check on every response and slow down proactively when it drops

---

### Webhooks

> **Status:** Under development — coming soon

Webhooks will provide real-time event notifications so your apps react instantly.

**Planned features:** Real-time delivery, signed payloads, auto-retry, event filtering

**Planned events:** `invoice.created`, `payment.received`, `contact.updated`, `product.stock_changed`, `treasury.synced`

---

## API Reference

> **Base URL:** `https://api.holded.com`  
> **Authentication:** `Bearer <api-key>`  
> All endpoints use `application/json`

---

## ACCOUNTING

### Accounting

Chart of accounts and ledger entries — **4 endpoints**

| Method | Endpoint | Description | Scope |
|--------|----------|-------------|-------|
| `POST` | `/api/v2/accounting-accounts` | Create an accounting account | `accounting:chart-of-accounts.write` |
| `POST` | `/api/v2/ledger-entries` | Create a ledger entry | |
| `GET` | `/api/v2/accounting-accounts` | List chart of accounts | |
| `GET` | `/api/v2/ledger-entries` | List ledger entries | |

#### POST `/api/v2/accounting-accounts` — Create an accounting account

Creates a new accounting account in your chart of accounts. Accounting accounts categorize financial transactions for reporting and comply with your country's accounting plan. The response returns the new account `id`.

> **Note:** `prefix` is the chart-of-accounts GROUP code (1–4 digits), NOT the full account number. To create an account with a specific number, use the `number` field and set `prefix` to the group it belongs to (the leading digits of the number, e.g. for number `70000013` use prefix `7000`).

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prefix` | integer | ✅ | Chart-of-accounts group code (1–4 digits). The full account number is auto-assigned within this group when `number` is absent |
| `number` | integer\|null | ❌ | Exact account number to assign (e.g. `70000013`). Must start with `prefix`. When provided the number is used as-is and must be unique |
| `name` | string | ✅ | Display name for the accounting account |
| `description` | string\|null | ❌ | Optional description of the account purpose |
| `color` | string\|null | ❌ | Hex color code for UI display |

**Success response `201`:**

```json
{
  "id": "507f1f77bcf86cd799439011"
}
```

**Error responses:** `400` Bad request · `401` Invalid/missing API key · `403` Insufficient permissions · `422` Validation error · `429` Rate limit exceeded

**Example:**

```bash
curl -X POST "https://api.holded.com/api/v2/accounting-accounts" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prefix": 7, "name": "Product Sales"}'
```

```python
import requests

url = "https://api.holded.com/api/v2/accounting-accounts"
headers = {
    "Authorization": "Bearer YOUR_API_KEY",
    "Accept": "application/json",
}
payload = {
    "prefix": 0,
    "number": 0,
    "name": "string",
    "description": "string",
    "color": "string"
}
response = requests.post(url, headers=headers, json=payload)
print(response.json())
```

---

### Expenses Accounts

Expense account management — **5 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/expenses-accounts` | Create an expenses account |
| `PUT` | `/api/v2/expenses-accounts/{expensesAccountId}` | Update an expenses account |
| `GET` | `/api/v2/expenses-accounts` | List all expenses accounts |
| `GET` | `/api/v2/expenses-accounts/{expensesAccountId}` | Get an expenses account by ID |
| `DELETE` | `/api/v2/expenses-accounts/{expensesAccountId}` | Delete an expenses account |

---

### Payment

Payment management — **5 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/payments` | Create a payment |
| `PUT` | `/api/v2/payments/{paymentId}` | Update a payment |
| `GET` | `/api/v2/payments` | List payments |
| `GET` | `/api/v2/payments/{paymentId}` | Get a payment by ID |
| `DELETE` | `/api/v2/payments/{paymentId}` | Delete a payment |

---

### Purchases

Purchase invoice management — **12 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/purchases` | Create a purchase |
| `POST` | `/api/v2/purchases/{purchaseId}/payments` | Create a payment for a purchase |
| `POST` | `/api/v2/purchases/{purchaseId}/approve` | Approve a purchase |
| `POST` | `/api/v2/purchases/{purchaseId}/attachments` | Attach a file to a purchase |
| `POST` | `/api/v2/purchases/refund` | Create a purchase refund |
| `PUT` | `/api/v2/purchases/{purchaseId}` | Update a purchase |
| `PUT` | `/api/v2/purchases/{purchaseId}/pipeline` | Set purchase pipeline |
| `GET` | `/api/v2/purchases/{purchaseId}/attachments` | List purchase attachments |
| `GET` | `/api/v2/purchases` | List purchases |
| `GET` | `/api/v2/purchases/{purchaseId}` | Get a purchase |
| `GET` | `/api/v2/purchases/{purchaseId}/attachments/{attachmentId}` | Get purchase attachment |
| `DELETE` | `/api/v2/purchases/{purchaseId}` | Delete a purchase |

---

### Tax

Tax configuration and compliance management — **1 endpoint**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v2/taxes` | List all taxes |

---

### Inbox

Incoming document management (OCR, scan and verify) — **8 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/inbox` | Upload a document |
| `POST` | `/api/v2/inbox/{incomingDocumentId}/attach` | Attach incoming document to a document |
| `PUT` | `/api/v2/inbox/{incomingDocumentId}` | Update an incoming document |
| `GET` | `/api/v2/inbox` | List inbox incoming documents |
| `GET` | `/api/v2/inbox/{incomingDocumentId}` | Get an incoming document by ID |
| `GET` | `/api/v2/inbox/{incomingDocumentId}/files/{filename}/download` | Download a file from an inbox document |
| `GET` | `/api/v2/inbox/{incomingDocumentId}/files/{filename}/preview` | Get a processed thumbnail of a file from an inbox document |
| `DELETE` | `/api/v2/inbox/{incomingDocumentId}` | Delete an incoming document |

---

## TREASURY

### Banking accounts

Banking account management within the Treasury product — **10 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/treasury/accounts` | Create a banking account |
| `POST` | `/api/v2/treasury/accounts/{id}/archive` | Archive a banking account |
| `POST` | `/api/v2/treasury/accounts/{bankingAccountId}/bank-movements` | Create one or multiple manual bank movements |
| `POST` | `/api/v2/treasury/accounts/{bankingAccountId}/bank-movements/{movementId}/reconcile` | Reconcile a bank movement |
| `GET` | `/api/v2/treasury/accounts` | List banking accounts |
| `GET` | `/api/v2/treasury/accounts/{id}` | Get a banking account by ID |
| `GET` | `/api/v2/treasury/accounts/{id}/bank-movements` | List banking account movements |
| `GET` | `/api/v2/treasury/accounts/{id}/cash-movements` | List banking account cash movements |
| `PUT` | `/api/v2/treasury/accounts/{id}` | Update a banking account |
| `DELETE` | `/api/v2/treasury/accounts/{id}` | Delete a banking account |

---

### Payment Methods

Payment method configuration and management — **5 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/payment-methods` | Create a payment method |
| `PUT` | `/api/v2/payment-methods/{paymentMethodId}` | Update a payment method |
| `GET` | `/api/v2/payment-methods` | List payment methods |
| `GET` | `/api/v2/payment-methods/{paymentMethodId}` | Get a payment method by ID |
| `DELETE` | `/api/v2/payment-methods/{paymentMethodId}` | Delete a payment method |

---

### Remittances

Remittance management within the Treasury product — **2 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v2/treasury/remittances` | List remittances |
| `GET` | `/api/v2/treasury/remittances/{remittanceId}` | Get a remittance |

---

### Invoicing Forecast

Invoicing forecast management for cashflow planning — **5 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/treasury/cashflow/invoicing-forecasts` | Create an invoicing forecast |
| `PUT` | `/api/v2/treasury/cashflow/invoicing-forecasts/{forecastId}` | Edit an invoicing forecast |
| `GET` | `/api/v2/treasury/cashflow/invoicing-forecasts` | List invoicing forecasts |
| `GET` | `/api/v2/treasury/cashflow/invoicing-forecasts/{forecastId}` | Get an invoicing forecast |
| `DELETE` | `/api/v2/treasury/cashflow/invoicing-forecasts/{forecastId}` | Delete an invoicing forecast |

---

## SALES

### Invoices

Sales invoice management — **18 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/invoices` | Create an invoice |
| `POST` | `/api/v2/invoices/{invoiceId}/payments` | Create a payment for an invoice |
| `POST` | `/api/v2/invoices/{invoiceId}/approve` | Approve an invoice |
| `POST` | `/api/v2/invoices/{invoiceId}/attachments` | Attach a file to an invoice |
| `POST` | `/api/v2/invoices/{invoiceId}/send` | Send an invoice by email |
| `POST` | `/api/v2/invoices/{invoiceId}/cancel` | Cancel an invoice |
| `POST` | `/api/v2/invoices/bulk/cancel` | Bulk cancel invoices |
| `POST` | `/api/v2/invoices/bulk/approve` | Bulk approve invoices |
| `PUT` | `/api/v2/invoices/{invoiceId}` | Update an invoice |
| `PUT` | `/api/v2/invoices/{invoiceId}/pipeline` | Set invoice pipeline |
| `GET` | `/api/v2/invoices` | List invoices |
| `GET` | `/api/v2/invoices/{invoiceId}` | Get an invoice |
| `GET` | `/api/v2/invoices/{invoiceId}/attachments` | List invoice attachments |
| `GET` | `/api/v2/invoices/{invoiceId}/attachments/{attachmentId}` | Get invoice attachment |
| `GET` | `/api/v2/invoices/{invoiceId}/pdf` | Get invoice PDF |
| `GET` | `/api/v2/invoices/find-by-number` | Find invoices by document number |
| `DELETE` | `/api/v2/invoices/{invoiceId}` | Delete an invoice |
| `DELETE` | `/api/v2/invoices` | Bulk delete invoices |

---

### Recurring Invoices

Recurring invoice management — **7 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/recurring-invoices` | Create a recurring invoice |
| `POST` | `/api/v2/recurring-invoices/{invoiceRecurringId}/skip` | Skip a recurring invoice occurrence |
| `PUT` | `/api/v2/recurring-invoices/{invoiceRecurringId}` | Update a recurring invoice |
| `GET` | `/api/v2/recurring-invoices` | List recurring invoices |
| `GET` | `/api/v2/recurring-invoices/{invoiceRecurringId}` | Get a recurring invoice |
| `GET` | `/api/v2/recurring-invoices/{invoiceRecurringId}/schedule` | Get recurring invoice schedule |
| `DELETE` | `/api/v2/recurring-invoices/{invoiceRecurringId}` | Delete a recurring invoice |

---

### Sales Receipts

Sales receipt management — **13 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/sales-receipts` | Create a sales receipt |
| `POST` | `/api/v2/sales-receipts/{salesReceiptId}/payments` | Create a payment for a sales receipt |
| `POST` | `/api/v2/sales-receipts/{salesReceiptId}/approve` | Approve a sales receipt |
| `POST` | `/api/v2/sales-receipts/{salesReceiptId}/attachments` | Attach a file to a sales receipt |
| `POST` | `/api/v2/sales-receipts/{salesReceiptId}/send` | Send a sales receipt by email |
| `PUT` | `/api/v2/sales-receipts/{salesReceiptId}` | Update a sales receipt |
| `PUT` | `/api/v2/sales-receipts/{salesReceiptId}/pipeline` | Set sales receipt pipeline |
| `GET` | `/api/v2/sales-receipts` | List sales receipts |
| `GET` | `/api/v2/sales-receipts/{salesReceiptId}` | Get a sales receipt |
| `GET` | `/api/v2/sales-receipts/{salesReceiptId}/attachments` | List sales receipt attachments |
| `GET` | `/api/v2/sales-receipts/{salesReceiptId}/attachments/{attachmentId}` | Get sales receipt attachment |
| `GET` | `/api/v2/sales-receipts/{salesReceiptId}/pdf` | Get sales receipt PDF |
| `DELETE` | `/api/v2/sales-receipts/{salesReceiptId}` | Delete a sales receipt |

---

### Receipt Notes

Receipt note management — **13 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/receipt-notes` | Create a receipt note |
| `POST` | `/api/v2/receipt-notes/{receiptNoteId}/approve` | Approve a receipt note |
| `POST` | `/api/v2/receipt-notes/{receiptNoteId}/attachments` | Attach a file to a receipt note |
| `POST` | `/api/v2/receipt-notes/{receiptNoteId}/payments` | Create a payment for a receipt note |
| `POST` | `/api/v2/receipt-notes/{receiptNoteId}/send` | Send a receipt note by email |
| `PUT` | `/api/v2/receipt-notes/{receiptNoteId}` | Update a receipt note |
| `PUT` | `/api/v2/receipt-notes/{receiptNoteId}/pipeline` | Set receipt note pipeline |
| `GET` | `/api/v2/receipt-notes` | List receipt notes |
| `GET` | `/api/v2/receipt-notes/{receiptNoteId}` | Get a receipt note |
| `GET` | `/api/v2/receipt-notes/{receiptNoteId}/attachments` | List receipt note attachments |
| `GET` | `/api/v2/receipt-notes/{receiptNoteId}/attachments/{attachmentId}` | Get receipt note attachment |
| `GET` | `/api/v2/receipt-notes/{receiptNoteId}/pdf` | Get receipt note PDF |
| `DELETE` | `/api/v2/receipt-notes/{receiptNoteId}` | Delete a receipt note |

---

### Estimates

Estimate management — **13 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/estimates` | Create an estimate |
| `POST` | `/api/v2/estimates/{estimateId}/accept` | Accept an estimate |
| `POST` | `/api/v2/estimates/{estimateId}/attachments` | Attach a file to an estimate |
| `POST` | `/api/v2/estimates/{estimateId}/reject` | Reject an estimate |
| `POST` | `/api/v2/estimates/{estimateId}/send` | Send an estimate by email |
| `PUT` | `/api/v2/estimates/{estimateId}` | Update an estimate |
| `PUT` | `/api/v2/estimates/{estimateId}/pipeline` | Set estimate pipeline |
| `GET` | `/api/v2/estimates` | List estimates |
| `GET` | `/api/v2/estimates/{estimateId}` | Get an estimate |
| `GET` | `/api/v2/estimates/{estimateId}/attachments` | List estimate attachments |
| `GET` | `/api/v2/estimates/{estimateId}/attachments/{attachmentId}` | Get estimate attachment |
| `GET` | `/api/v2/estimates/{estimateId}/pdf` | Get estimate PDF |
| `DELETE` | `/api/v2/estimates/{estimateId}` | Delete an estimate |

---

### Proformas

Proforma invoice management — **12 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/proformas` | Create a proforma |
| `POST` | `/api/v2/proformas/{proformaId}/approve` | Approve a proforma |
| `POST` | `/api/v2/proformas/{proformaId}/attachments` | Attach a file to a proforma |
| `POST` | `/api/v2/proformas/{proformaId}/send` | Send a proforma by email |
| `PUT` | `/api/v2/proformas/{proformaId}` | Update a proforma |
| `PUT` | `/api/v2/proformas/{proformaId}/pipeline` | Set proforma pipeline |
| `GET` | `/api/v2/proformas` | List proformas |
| `GET` | `/api/v2/proformas/{proformaId}` | Get a proforma |
| `GET` | `/api/v2/proformas/{proformaId}/attachments` | List proforma attachments |
| `GET` | `/api/v2/proformas/{proformaId}/attachments/{attachmentId}` | Get proforma attachment |
| `GET` | `/api/v2/proformas/{proformaId}/pdf` | Get proforma PDF |
| `DELETE` | `/api/v2/proformas/{proformaId}` | Delete a proforma |

---

### Credit Notes

Credit note management — **13 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/credit-notes` | Create a credit note |
| `POST` | `/api/v2/credit-notes/{creditNoteId}/payments` | Create a payment for a credit note |
| `POST` | `/api/v2/credit-notes/{creditNoteId}/approve` | Approve a credit note |
| `POST` | `/api/v2/credit-notes/{creditNoteId}/attachments` | Attach a file to a credit note |
| `POST` | `/api/v2/credit-notes/{creditNoteId}/send` | Send a credit note by email |
| `PUT` | `/api/v2/credit-notes/{creditNoteId}` | Update a credit note |
| `PUT` | `/api/v2/credit-notes/{creditNoteId}/pipeline` | Set credit note pipeline |
| `GET` | `/api/v2/credit-notes` | List credit notes |
| `GET` | `/api/v2/credit-notes/{creditNoteId}` | Get a credit note |
| `GET` | `/api/v2/credit-notes/{creditNoteId}/attachments` | List credit note attachments |
| `GET` | `/api/v2/credit-notes/{creditNoteId}/attachments/{attachmentId}` | Get credit note attachment |
| `GET` | `/api/v2/credit-notes/{creditNoteId}/pdf` | Get credit note PDF |
| `DELETE` | `/api/v2/credit-notes/{creditNoteId}` | Delete a credit note |

---

### Services

Service catalog management — **5 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/services` | Create a service |
| `PUT` | `/api/v2/services/{serviceId}` | Update a service |
| `GET` | `/api/v2/services` | List services |
| `GET` | `/api/v2/services/{serviceId}` | Get a service |
| `DELETE` | `/api/v2/services/{serviceId}` | Delete a service |

---

### Sales Channels

Sales channel management — **5 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/sales-channels` | Create a sales channel |
| `PUT` | `/api/v2/sales-channels/{salesChannelId}` | Update a sales channel |
| `GET` | `/api/v2/sales-channels` | List all sales channels |
| `GET` | `/api/v2/sales-channels/{salesChannelId}` | Get a sales channel by ID |
| `DELETE` | `/api/v2/sales-channels/{salesChannelId}` | Delete a sales channel |

---

### Numbering Series

Document numbering series configuration — **4 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/numbering-series/{type}` | Create a numbering series |
| `PUT` | `/api/v2/numbering-series/{type}/{numberingSeriesId}` | Update a numbering series |
| `GET` | `/api/v2/numbering-series/{type}` | List numbering series by document type |
| `DELETE` | `/api/v2/numbering-series/{type}/{numberingSeriesId}` | Delete a numbering series |

---

## INVENTORY

### Products

Product management — **12 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/products` | Create a product |
| `POST` | `/api/v2/products/{productId}/images` | Upload a product image |
| `PUT` | `/api/v2/products/{productId}` | Update a product |
| `PUT` | `/api/v2/products/{productId}/stock` | Update stock for a product |
| `GET` | `/api/v2/products` | List all products |
| `GET` | `/api/v2/products/{productId}` | Get a product by ID |
| `GET` | `/api/v2/products/{productId}/images` | List product images |
| `GET` | `/api/v2/products/{productId}/images/{imageId}` | Get a product image by ID |
| `GET` | `/api/v2/products/{productId}/image` | Get the main product image |
| `GET` | `/api/v2/products/{productId}/stock` | Get stock availability for a product |
| `GET` | `/api/v2/products/{productId}/stock/transit` | Get stock in transit for a product |
| `DELETE` | `/api/v2/products/{productId}` | Delete a product |

---

### Price Lists

Product price list management — **5 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/price-lists` | Create a price list |
| `PATCH` | `/api/v2/price-lists/{priceListId}` | Update a price list |
| `GET` | `/api/v2/price-lists` | List price lists |
| `GET` | `/api/v2/price-lists/{priceListId}` | Get a price list by ID |
| `DELETE` | `/api/v2/price-lists/{priceListId}` | Delete a price list |

---

### Warehouses

Warehouse and stock management — **6 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/warehouses` | Create a warehouse |
| `PATCH` | `/api/v2/warehouses/{warehouseId}` | Update a warehouse |
| `GET` | `/api/v2/warehouses` | List all warehouses |
| `GET` | `/api/v2/warehouses/{warehouseId}` | Get a warehouse by ID |
| `GET` | `/api/v2/warehouses/{warehouseId}/stock` | Get stock levels for a warehouse |
| `DELETE` | `/api/v2/warehouses/{warehouseId}` | Delete a warehouse |

---

### Sales Orders

Sales order management — **16 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/sales-orders` | Create a sales order |
| `POST` | `/api/v2/sales-orders/{salesOrderId}/approve` | Approve a sales order |
| `POST` | `/api/v2/sales-orders/{salesOrderId}/attachments` | Attach a file to a sales order |
| `POST` | `/api/v2/sales-orders/{salesOrderId}/send` | Send a sales order by email |
| `POST` | `/api/v2/sales-orders/{salesOrderId}/ship` | Ship all items in a sales order |
| `POST` | `/api/v2/sales-orders/{salesOrderId}/ship-by-lines` | Ship specific lines in a sales order |
| `PUT` | `/api/v2/sales-orders/{salesOrderId}` | Update a sales order |
| `PUT` | `/api/v2/sales-orders/{salesOrderId}/pipeline` | Set sales order pipeline |
| `PUT` | `/api/v2/sales-orders/{salesOrderId}/tracking` | Update sales order tracking information |
| `GET` | `/api/v2/sales-orders` | List sales orders |
| `GET` | `/api/v2/sales-orders/{salesOrderId}` | Get a sales order |
| `GET` | `/api/v2/sales-orders/{salesOrderId}/attachments` | List sales order attachments |
| `GET` | `/api/v2/sales-orders/{salesOrderId}/attachments/{attachmentId}` | Get sales order attachment |
| `GET` | `/api/v2/sales-orders/{salesOrderId}/pdf` | Get sales order PDF |
| `GET` | `/api/v2/sales-orders/{salesOrderId}/shipped-items` | Get shipped items for a sales order |
| `DELETE` | `/api/v2/sales-orders/{salesOrderId}` | Delete a sales order |

---

### Waybills

Waybill and shipment management — **13 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/waybills` | Create a waybill |
| `POST` | `/api/v2/waybills/{waybillId}/approve` | Approve a waybill |
| `POST` | `/api/v2/waybills/{waybillId}/attachments` | Attach a file to a waybill |
| `POST` | `/api/v2/waybills/{waybillId}/send` | Send a waybill by email |
| `PUT` | `/api/v2/waybills/{waybillId}` | Update a waybill |
| `PUT` | `/api/v2/waybills/{waybillId}/pipeline` | Set waybill pipeline |
| `PUT` | `/api/v2/waybills/{waybillId}/tracking` | Update waybill tracking information |
| `GET` | `/api/v2/waybills` | List waybills |
| `GET` | `/api/v2/waybills/{waybillId}` | Get a waybill |
| `GET` | `/api/v2/waybills/{waybillId}/attachments` | List waybill attachments |
| `GET` | `/api/v2/waybills/{waybillId}/attachments/{attachmentId}` | Get waybill attachment |
| `GET` | `/api/v2/waybills/{waybillId}/pdf` | Get waybill PDF |
| `DELETE` | `/api/v2/waybills/{waybillId}` | Delete a waybill |

---

### Purchase Orders

Purchase order management — **14 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/purchase-orders` | Create a purchase order |
| `POST` | `/api/v2/purchase-orders/{purchaseOrderId}/approve` | Approve a purchase order |
| `POST` | `/api/v2/purchase-orders/{purchaseOrderId}/attachments` | Attach a file to a purchase order |
| `POST` | `/api/v2/purchase-orders/{purchaseOrderId}/receive` | Receive units of a purchase order |
| `POST` | `/api/v2/purchase-orders/{purchaseOrderId}/send` | Send a purchase order by email |
| `PUT` | `/api/v2/purchase-orders/{purchaseOrderId}` | Update a purchase order |
| `PUT` | `/api/v2/purchase-orders/{purchaseOrderId}/pipeline` | Set purchase order pipeline |
| `GET` | `/api/v2/purchase-orders` | List purchase orders |
| `GET` | `/api/v2/purchase-orders/{purchaseOrderId}` | Get a purchase order |
| `GET` | `/api/v2/purchase-orders/{purchaseOrderId}/attachments` | List purchase order attachments |
| `GET` | `/api/v2/purchase-orders/{purchaseOrderId}/attachments/{attachmentId}` | Get purchase order attachment |
| `GET` | `/api/v2/purchase-orders/{purchaseOrderId}/pdf` | Get purchase order PDF |
| `GET` | `/api/v2/purchase-orders/{purchaseOrderId}/received-items` | Get received items for a purchase order |
| `DELETE` | `/api/v2/purchase-orders/{purchaseOrderId}` | Delete a purchase order |

---

### Purchase Shipments

Purchase shipment and receiving management — **6 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/purchase-shipments` | Create a purchase shipment |
| `POST` | `/api/v2/purchase-shipments/{purchaseShipmentId}/approve` | Approve a purchase shipment |
| `PUT` | `/api/v2/purchase-shipments/{purchaseShipmentId}` | Update a purchase shipment |
| `GET` | `/api/v2/purchase-shipments` | List purchase shipments |
| `GET` | `/api/v2/purchase-shipments/{purchaseShipmentId}` | Get a purchase shipment |
| `DELETE` | `/api/v2/purchase-shipments/{purchaseShipmentId}` | Delete a purchase shipment |

---

### Documents

Cross-document operations — **1 endpoint**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/documents/convert` | Convert a document to another type |

---

### Production Orders

Production order and manufacturing pipeline management — **5 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/production-orders` | Create a production order |
| `PUT` | `/api/v2/production-orders/{productionOrderId}` | Update a production order |
| `GET` | `/api/v2/production-orders` | List production orders |
| `GET` | `/api/v2/production-orders/{productionOrderId}` | Get a production order |
| `DELETE` | `/api/v2/production-orders/{productionOrderId}` | Delete a production order |

---

## CONTACTS

### Contact

Contact management (clients, suppliers, leads) — **12 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/contacts` | Create a contact |
| `POST` | `/api/v2/contacts/{contactId}/attachments` | Attach a file to a contact |
| `POST` | `/api/v2/contacts/bulk-archive` | Bulk archive contacts |
| `POST` | `/api/v2/contacts/bulk-delete` | Bulk delete contacts |
| `PUT` | `/api/v2/contacts/{contactId}` | Update a contact |
| `GET` | `/api/v2/contacts` | List contacts |
| `GET` | `/api/v2/contacts/{contactId}` | Get a contact by ID |
| `GET` | `/api/v2/contacts/{contactId}/attachments` | List contact attachments |
| `GET` | `/api/v2/contacts/{contactId}/attachments/{filename}` | Get a contact attachment |
| `GET` | `/api/v2/contacts/{contactId}/portal-link` | Get client portal link for a contact |
| `GET` | `/api/v2/contacts/search` | Search contacts by name |
| `DELETE` | `/api/v2/contacts/{contactId}` | Delete a contact |

---

### Contact Group

Contact group management — **5 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/contact-groups` | Create a contact group |
| `PUT` | `/api/v2/contact-groups/{contactGroupId}` | Update a contact group |
| `GET` | `/api/v2/contact-groups` | List contact groups |
| `GET` | `/api/v2/contact-groups/{contactGroupId}` | Get a contact group |
| `DELETE` | `/api/v2/contact-groups/{contactGroupId}` | Delete a contact group |

---

### Tags

Tag management — **3 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/tags` | Create a tag |
| `GET` | `/api/v2/tags` | List all tags |
| `DELETE` | `/api/v2/tags/{tag}` | Delete a tag |

---

## CRM

### Funnels

CRM funnel and pipeline stage management — **5 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/funnels` | Create a funnel |
| `PUT` | `/api/v2/funnels/{funnelId}` | Update a funnel |
| `GET` | `/api/v2/funnels` | List all funnels |
| `GET` | `/api/v2/funnels/{funnelId}` | Get a funnel |
| `DELETE` | `/api/v2/funnels/{funnelId}` | Delete a funnel |

---

### Leads

CRM lead tracking and lifecycle management — **12 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/leads` | Create a lead |
| `POST` | `/api/v2/leads/{leadId}/notes` | Create a lead note |
| `POST` | `/api/v2/leads/{leadId}/tasks` | Create a lead task |
| `PUT` | `/api/v2/leads/{leadId}` | Update a lead |
| `PUT` | `/api/v2/leads/{leadId}/notes` | Update a lead note |
| `PUT` | `/api/v2/leads/{leadId}/tasks` | Update a lead task |
| `PUT` | `/api/v2/leads/{leadId}/dates` | Update lead dates |
| `PUT` | `/api/v2/leads/{leadId}/stage` | Update a lead stage |
| `GET` | `/api/v2/leads` | List all leads |
| `GET` | `/api/v2/leads/{leadId}` | Get a lead |
| `DELETE` | `/api/v2/leads/{leadId}/tasks` | Delete a lead task |
| `DELETE` | `/api/v2/leads/{leadId}` | Delete a lead |

---

## PROJECTS

### Projects

Project management — **6 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/projects` | Create a project |
| `PUT` | `/api/v2/projects/{projectId}` | Update a project |
| `GET` | `/api/v2/projects` | List projects |
| `GET` | `/api/v2/projects/{projectId}` | Get a project |
| `GET` | `/api/v2/projects/{projectId}/summary` | Get a project summary |
| `DELETE` | `/api/v2/projects/{projectId}` | Delete a project |

---

### Tasks

Task management within projects — **5 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/tasks` | Create a task |
| `PUT` | `/api/v2/tasks/{taskId}` | Update a task |
| `GET` | `/api/v2/tasks` | List all tasks |
| `GET` | `/api/v2/tasks/{taskId}` | Get a task |
| `DELETE` | `/api/v2/tasks/{taskId}` | Delete a task |

---

### Project Time Tracking

Time tracking entries for projects — **6 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/projects/{projectId}/times` | Create a time entry for a project |
| `PUT` | `/api/v2/projects/{projectId}/times/{timeId}` | Update a project time entry |
| `GET` | `/api/v2/projects/{projectId}/times` | List time entries for a project |
| `GET` | `/api/v2/project-times` | List all project time entries |
| `GET` | `/api/v2/projects/{projectId}/times/{timeId}` | Get a project time entry |
| `DELETE` | `/api/v2/projects/{projectId}/times/{timeId}` | Delete a project time entry |

---

## TEAM & HR

### Employees

Employee CRUD management — **5 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/employees` | Create an employee |
| `PUT` | `/api/v2/employees/{employeeId}` | Update an employee |
| `GET` | `/api/v2/employees` | List all employees |
| `GET` | `/api/v2/employees/{employeeId}` | Get an employee |
| `DELETE` | `/api/v2/employees/{employeeId}` | Delete an employee |

---

### Employee Time Tracking

Employee time tracking, clock-in/out and pause management — **10 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/employees/{employeeId}/clock-in` | Clock in an employee |
| `POST` | `/api/v2/employees/{employeeId}/clock-out` | Clock out an employee |
| `POST` | `/api/v2/employees/{employeeId}/times` | Create a time entry for an employee |
| `POST` | `/api/v2/employees/{employeeId}/pause` | Pause an employee time session |
| `POST` | `/api/v2/employees/{employeeId}/unpause` | Resume an employee time session |
| `PUT` | `/api/v2/employee-times/{timeId}` | Update an employee time entry |
| `GET` | `/api/v2/employees/{employeeId}/times` | List time entries for an employee |
| `GET` | `/api/v2/employee-times` | List all employee time entries |
| `GET` | `/api/v2/employee-times/{timeId}` | Get an employee time entry |
| `DELETE` | `/api/v2/employee-times/{timeId}` | Delete an employee time entry |

---

### Salary records

Salary record management (non-payslip payroll documents) — **5 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/salary-records` | Create a salary record |
| `PUT` | `/api/v2/salary-records/{salaryRecordId}` | Update a salary record |
| `GET` | `/api/v2/salary-records` | List salary records |
| `GET` | `/api/v2/salary-records/{salaryRecordId}` | Get a salary record |
| `DELETE` | `/api/v2/salary-records/{salaryRecordId}` | Delete a salary record |

---

## CALENDAR

### Events

Calendar events management — **5 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/events` | Create an event |
| `PUT` | `/api/v2/events/{eventId}` | Update an event |
| `GET` | `/api/v2/events` | List all events |
| `GET` | `/api/v2/events/{eventId}` | Get an event by ID |
| `DELETE` | `/api/v2/events/{eventId}` | Delete an event |

---

### Bookings

Booking and reservation management — **7 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/bookings` | Create a booking |
| `PUT` | `/api/v2/bookings/{bookingId}` | Update a booking |
| `GET` | `/api/v2/bookings` | List all bookings |
| `GET` | `/api/v2/booking-locations` | List all booking locations |
| `GET` | `/api/v2/bookings/{bookingId}` | Get a booking by ID |
| `GET` | `/api/v2/booking-locations/{locationId}/slots` | Get available slots for a location |
| `DELETE` | `/api/v2/bookings/{bookingId}` | Cancel a booking |

---

## INBOX (module)

Incoming document management (OCR, scan and verify) — **8 endpoints**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/inbox` | Upload a document |
| `POST` | `/api/v2/inbox/{incomingDocumentId}/attach` | Attach incoming document to a document |
| `PUT` | `/api/v2/inbox/{incomingDocumentId}` | Update an incoming document |
| `GET` | `/api/v2/inbox` | List inbox incoming documents |
| `GET` | `/api/v2/inbox/{incomingDocumentId}` | Get an incoming document by ID |
| `GET` | `/api/v2/inbox/{incomingDocumentId}/files/{filename}/download` | Download a file from an inbox document |
| `GET` | `/api/v2/inbox/{incomingDocumentId}/files/{filename}/preview` | Get a processed thumbnail of a file from an inbox document |
| `DELETE` | `/api/v2/inbox/{incomingDocumentId}` | Delete an incoming document |

---

## Quick Reference — All Endpoints by Module

| Module | Resource | Endpoints |
|--------|----------|-----------|
| Accounting | Accounting | 4 |
| Accounting | Expenses Accounts | 5 |
| Accounting | Payment | 5 |
| Accounting | Purchases | 12 |
| Accounting | Tax | 1 |
| Accounting | Inbox | 8 |
| Treasury | Banking accounts | 10 |
| Treasury | Payment Methods | 5 |
| Treasury | Remittances | 2 |
| Treasury | Invoicing Forecast | 5 |
| Sales | Invoices | 18 |
| Sales | Recurring Invoices | 7 |
| Sales | Sales Receipts | 13 |
| Sales | Receipt Notes | 13 |
| Sales | Estimates | 13 |
| Sales | Proformas | 12 |
| Sales | Credit Notes | 13 |
| Sales | Services | 5 |
| Sales | Sales Channels | 5 |
| Sales | Numbering Series | 4 |
| Inventory | Products | 12 |
| Inventory | Price Lists | 5 |
| Inventory | Warehouses | 6 |
| Inventory | Sales Orders | 16 |
| Inventory | Waybills | 13 |
| Inventory | Purchase Orders | 14 |
| Inventory | Purchase Shipments | 6 |
| Inventory | Documents | 1 |
| Inventory | Production Orders | 5 |
| Contacts | Contact | 12 |
| Contacts | Contact Group | 5 |
| Contacts | Tags | 3 |
| CRM | Funnels | 5 |
| CRM | Leads | 12 |
| Projects | Projects | 6 |
| Projects | Tasks | 5 |
| Projects | Project Time Tracking | 6 |
| Team & HR | Employees | 5 |
| Team & HR | Employee Time Tracking | 10 |
| Team & HR | Salary records | 5 |
| Calendar | Events | 5 |
| Calendar | Bookings | 7 |
| Inbox | Inbox | 8 |
| **TOTAL** | | **~337** |

---

## Common Response Codes

| Code | Meaning |
|------|---------|
| `200` | OK — successful GET, PUT, PATCH |
| `201` | Created — resource successfully created (POST) |
| `204` | No Content — successful DELETE |
| `400` | Bad Request — invalid parameters or malformed body |
| `401` | Unauthorized — missing or invalid API key |
| `403` | Forbidden — valid key, insufficient permissions |
| `404` | Not Found — resource does not exist |
| `422` | Unprocessable Entity — validation failed |
| `429` | Too Many Requests — rate limit exceeded |
| `500` | Internal Server Error — error on Holded's side |

---

## Useful Links

- **Getting started:** https://www.holded.com/developers/getting-started
- **Authentication:** https://www.holded.com/developers/authentication
- **Pagination:** https://www.holded.com/developers/pagination
- **Error handling:** https://www.holded.com/developers/errors
- **API limits:** https://www.holded.com/developers/rate-limiting
- **Webhooks:** https://www.holded.com/developers/webhooks
- **Full API Reference:** https://www.holded.com/developers/api-reference