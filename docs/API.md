# BuyNow API reference

Interactive docs: run `npm run dev` and open `http://localhost:4500/api/v1/docs` (raw spec: `/api/v1/openapi.json`). Request schemas are generated from the Zod validators in `src/modules/*/*.validation.js`; the spec is disabled when `NODE_ENV=production` unless `API_DOCS=true`. This file remains the source for behavioral rules the spec cannot express.

## Conventions

Base URL: `http://localhost:4500/api/v1`. JSON writes use `Content-Type: application/json`. Protected routes require `Authorization: Bearer <accessToken>`. Access tokens expire after one day. Admin routes additionally require `role: admin`. Unknown request-body fields are rejected; PATCH needs at least one supported field. Strings are not implicitly converted to booleans/numbers in bodies. Query pagination and numeric filters accept numeric strings. Null is not a substitute for an optional omitted field.

Every completed API response has exactly these top-level fields:

```json
{
  "success": true,
  "message": "Products fetched",
  "data": [],
  "error": null,
  "meta": { "page": 1, "limit": 20, "total": 0, "pages": 0, "hasNext": false },
  "requestId": "uuid"
}
```

```json
{
  "success": false,
  "message": "Please correct the invalid fields",
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [{ "field": "email", "message": "Invalid email address" }]
  },
  "meta": null,
  "requestId": "uuid"
}
```

| Field         | Type                  | Meaning                                                                   |
| ------------- | --------------------- | ------------------------------------------------------------------------- |
| success       | boolean               | Whether the operation succeeded                                           |
| message       | string                | Human-readable result; clients should branch on error.code, not this text |
| data          | object / array / null | Result payload, null on errors and acknowledgement-only operations        |
| error         | object / null         | On failure, stable string `code` and array `details`; otherwise null      |
| error.details | array                 | Validation items `{field: string, message: string}`, otherwise empty      |
| meta          | object / null         | Pagination for list endpoints; otherwise null                             |
| requestId     | UUID string           | Correlation identifier, also sent as `X-Request-Id`                       |

No successful DELETE uses HTTP 204: it returns HTTP 200 with the standard envelope. Dates are ISO 8601 UTC strings. MongoDB user/address/order IDs are 24 hexadecimal characters. Product/category IDs are 1–80 letters, digits, underscores or hyphens. Prices are numeric NGN amounts, not kobo. Mutating requests must not include client-generated totals, roles, user IDs or timestamps.

## Shared validation and pagination

- Email: valid email string, up to 254 characters, normalized to lowercase.
- New passwords: 12–72 characters and at most 72 UTF-8 bytes, at least one lowercase letter, uppercase letter and digit; case-sensitive, never trimmed. Confirmation must match exactly.
- Phone: optional leading `+`, nonzero first digit and 8–15 total digits.
- Page: integer 1–10000, default 1. Limit: integer 1–100, default 20.
- Pagination response: `page`, `limit`, `total`, `pages` (ceil(total/limit)), `hasNext`.
- Uploads: one multipart field `image`, maximum 5 MiB, JPEG/PNG/WebP, minimum 80×80 and maximum 25 million pixels. Converted to WebP, metadata removed, maximum 1600×1600 keeping aspect ratio.

## Authentication

### POST /auth/register — create a customer

Public. Returns 201, `data: {user, accessToken}`. Does not send an email automatically; call resend-verification after registration. The account starts unverified and can browse/manage its cart but cannot place orders.

| Field    | Type   | Required | Meaning / rules                        |
| -------- | ------ | -------- | -------------------------------------- |
| username | string | Yes      | Display name, trimmed, 2–60 characters |
| email    | string | Yes      | Unique login and OTP delivery address  |
| password | string | Yes      | New-password rules above               |
| phone    | string | No       | Contact number; not a login identifier |

Duplicate email: 409 CONFLICT. No `role` or `verified` field is accepted.

### POST /auth/login — obtain a session

Public. Body: `email` (email string, required), `password` (string, 1–72 characters, required). Returns 200 `{user, accessToken}`. Wrong email/password: 401 INVALID_CREDENTIALS. Login does not require prior email verification.

### POST /auth/resend-verification — request email verification OTP

Public. Body: `email` (email string, required). Returns 200 with null data and the same eligibility message whether the account exists or is already verified. Eligible users receive a six-digit code valid for ten minutes. One minute between deliveries. A new OTP replaces the previous OTP, including a password-reset OTP.

### POST /auth/verify — verify the email address

Public. Body: `email` (email string, required), `otp` (exactly six numeric characters as a string, required). Returns 200 with null data. Consumes the verification OTP and sets `verified=true`. A reset OTP cannot be used here. Invalid, expired, reused or exhausted OTP: 400 INVALID_OTP.

### POST /auth/forgot-password — request password-reset OTP

Public. Body: `email` (email string, required). Returns 200 with null data and the same eligibility message for existing/nonexistent accounts. An eligible account receives a reset code. Does not change the password. BREVO_API_KEY and a valid BREVO_SENDER_EMAIL must be configured (the sender must be verified in Brevo); otherwise returns 503 EMAIL_UNAVAILABLE. Delivery failure returns 502 EMAIL_DELIVERY_FAILED. Cooldown requests return the generic acknowledgement without sending another code.

### POST /auth/reset-password — verify OTP and reset in one operation

Public. There is no separate password-reset OTP verification endpoint.

| Field           | Type   | Required | Meaning / rules                             |
| --------------- | ------ | -------- | ------------------------------------------- |
| email           | string | Yes      | Account email                               |
| otp             | string | Yes      | Exactly six digits; leading zeros preserved |
| newPassword     | string | Yes      | New-password rules                          |
| confirmPassword | string | Yes      | Exact match to newPassword                  |

```json
{
  "email": "customer@example.com",
  "otp": "123456",
  "newPassword": "ExampleNewPass123",
  "confirmPassword": "ExampleNewPass123"
}
```

Returns 200 with null data. An atomic conditional update changes the password, clears OTP fields and revokes all sessions. A code is limited to five attempts and cannot be reused. Wrong purpose, expiry, wrong code, missing account or exhausted attempts returns 400 INVALID_OTP. Mismatched confirmation returns 422 before an OTP attempt is consumed. Only HMAC hashes of OTPs are stored; plaintext codes are never returned by the API.

### POST /auth/logout — revoke all account sessions

Authenticated. Empty body or `{}`. Returns 200/null. All current access tokens become invalid, including the one used for this request.

## Profile

### GET /me — current user

Authenticated. No body. Returns 200 with a User object.

### PATCH /me — update profile and preferences

Authenticated. All fields optional, at least one required; returns updated User.

| Field                     | Type    | Rules / meaning                                                           |
| ------------------------- | ------- | ------------------------------------------------------------------------- |
| username                  | string  | Display name, trimmed 2–60                                                |
| phone                     | string  | Contact number, shared phone rules                                        |
| avatar                    | string  | HTTPS Cloudinary URL; upload via /uploads/image first                     |
| preferences               | object  | Only `language` and `notifications` accepted; merged with existing values |
| preferences.language      | string  | `en`, `fr`, or `es`; preferred UI language                                |
| preferences.notifications | boolean | Stored notification preference                                            |

Email and privileges cannot be changed through profile updates. Avatar URLs are Cloudinary HTTPS URLs; the service does not claim ownership of externally supplied Cloudinary assets.

### POST /me/change-password — change using current password

Authenticated. Required fields: `currentPassword` (string 1–72), `newPassword` (new-password rules), `confirmPassword` (matching string). New password must differ from current password. Returns 200/null and revokes all sessions and pending OTPs. Wrong current password: 400 INCORRECT_PASSWORD. A simultaneous password change can return 409 CONFLICT.

## Catalog

### GET /products — browse/search/filter

Public. Returns a Product array and pagination metadata. Only active products are returned.

| Query      | Type        | Default | Meaning                                                                                          |
| ---------- | ----------- | ------- | ------------------------------------------------------------------------------------------------ |
| page       | integer     | 1       | One-based result page                                                                            |
| limit      | integer     | 20      | Number of records, max 100                                                                       |
| categoryId | string      | omitted | Exact category ID                                                                                |
| q          | string      | omitted | Literal case-insensitive product-name substring, trimmed 1–100; regex metacharacters are escaped |
| minPrice   | number      | omitted | Inclusive minimum NGN price, ≥0                                                                  |
| maxPrice   | number      | omitted | Inclusive maximum price, ≥minPrice                                                               |
| minRating  | number      | omitted | Inclusive rating minimum, 0–5                                                                    |
| inStock    | string      | omitted | `true` means stock >0; `false` means stock=0                                                     |
| sort       | string enum | newest  | newest, oldest, price_asc, price_desc, rating; ties use ID                                       |

Example: `/products?categoryId=electronics&minPrice=10000&maxPrice=500000&inStock=true&sort=price_asc&page=1&limit=10`. New arrivals use `sort=newest`. Empty/out-of-range pages return 200 with an empty array and accurate metadata.

### GET /products/:id — product details

Public. Path ID is the product's stable string ID (e.g. PROD001). Returns Product; missing/inactive: 404.

### GET /categories — category grid

Public. Accepts page/limit. Returns Category array. `total` is computed from currently active product records, not the original provider's placeholder count.

### POST /admin/products — create product

Admin. Returns 201 Product.

| Field       | Type     | Required | Meaning / limits                                        |
| ----------- | -------- | -------- | ------------------------------------------------------- |
| id          | string   | Yes      | Unique stable catalog ID                                |
| categoryId  | string   | Yes      | Existing category ID                                    |
| name        | string   | Yes      | Trimmed product name, 2–150                             |
| description | string   | Yes      | Trimmed description, 10–5000                            |
| images      | string[] | Yes      | 1–10 HTTPS Cloudinary URLs; upload first                |
| price       | number   | Yes      | NGN, 0–1,000,000,000, maximum two decimal places        |
| stock       | integer  | Yes      | Available units, 0–1,000,000                            |
| colors      | string[] | No       | Up to 20 `#RRGGBB` values, defaults []                  |
| active      | boolean  | No       | Defaults true; false hides from public catalog/checkout |

Ratings/review counts are not client-editable. Unknown category: 422 INVALID_CATEGORY. Duplicate ID: 409 CONFLICT.

### PATCH /admin/products/:id — edit/deactivate product

Admin. Same product fields except `id`, all optional, at least one required. Returns updated Product; missing: 404. Use `{ "active": false }` to deactivate while preserving order history. Price/stock values replace existing values.

### POST /admin/categories — create category

Admin. Required body: `id` (stable ID), `name` (trimmed string 2–100), `image` (HTTPS Cloudinary URL). Returns 201 Category. Upload the image first. Newly created categories are not automatically populated; the 10-products guarantee belongs to the seed.

### PATCH /admin/categories/:id — update category

Admin. Optional `name` and `image`, same rules as creation; at least one. Returns updated Category or 404. IDs are immutable; category deletion is not exposed.

## File storage

### POST /uploads/image — upload image

Authenticated. `multipart/form-data`, exactly one file under `image`, no other fields. Returns 201 `{url: string, publicId: string, width: integer, height: integer}`. Use the returned URL in product/category/profile requests. Binary contents are inspected rather than trusting filename or MIME declarations. Missing file: 422 IMAGE_REQUIRED; unsupported/corrupt image: 422 INVALID_IMAGE; over 5 MiB: 413 PAYLOAD_TOO_LARGE; storage failure: 502 UPLOAD_FAILED. Uploaded assets remain in Cloudinary if a later catalog write fails; no automatic deletion endpoint is provided.

## Addresses

All endpoints authenticated. Records are scoped to the signed-in account; another user's ID returns 404.

| Endpoint              | Purpose                            | Result        |
| --------------------- | ---------------------------------- | ------------- |
| GET /addresses        | List own saved addresses           | 200 Address[] |
| POST /addresses       | Create an address                  | 201 Address   |
| PATCH /addresses/:id  | Edit supplied fields, at least one | 200 Address   |
| DELETE /addresses/:id | Delete address; empty body         | 200 null      |

POST requires every field below except line2. PATCH accepts any subset. IDs are MongoDB object IDs.

| Field      | Type   | Meaning / rules                                  |
| ---------- | ------ | ------------------------------------------------ |
| name       | string | Recipient name, trimmed 2–100                    |
| phone      | string | Recipient contact, shared phone rules            |
| line1      | string | Street address, trimmed 3–200                    |
| line2      | string | Optional additional information, trimmed max 200 |
| city       | string | City, trimmed 2–100                              |
| state      | string | State/region, trimmed 2–100                      |
| postalCode | string | Postal code, trimmed 2–20; retain leading zeros  |
| country    | string | Two uppercase letters (country code)             |

## Cart

### GET /cart

Authenticated. Returns `{items: [{product: Product|null, productId: string, quantity: integer}], total: number, currency: "NGN"}`. A missing cart is an empty cart. Total is a current-price preview; unavailable products may appear and checkout revalidates them.

### PUT /cart

Authenticated. Replaces the entire cart. Required `items` is an array of 0–100 strict objects, each containing `productId` (catalog ID) and `quantity` (integer 1–99). Product IDs must be unique. `[]` clears the cart. Products must be active with sufficient stock; otherwise 409 INSUFFICIENT_STOCK. Returns Cart with IDs and quantities, not a reserved stock allocation. Stock is reserved only on order placement.

```json
{ "items": [{ "productId": "PROD001", "quantity": 1 }] }
```

## Favorites

Authenticated, scoped to current user.

| Endpoint              | Body/query  | Behavior                                                                                                              |
| --------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------- |
| GET /favorites        | page, limit | Product[] with pagination; inactive/deleted products are omitted, so array may be shorter than the saved-record total |
| PUT /favorites/:id    | Empty       | Save active product; repeat is safe; 200/null or 404                                                                  |
| DELETE /favorites/:id | Empty       | Remove product from favorites; repeat is safe; 200/null                                                               |

## Orders and checkout

### POST /orders — place order

Authenticated and email-verified. Required body:

| Field          | Type            | Meaning                                              |
| -------------- | --------------- | ---------------------------------------------------- |
| addressId      | ObjectId string | Own saved shipping address                           |
| paymentMethod  | string          | `cash_on_delivery` or `paystack` (pay online now)    |
| idempotencyKey | UUID string     | Generate once per checkout; reuse on network retries |

Returns 201 Order. The server reads the cart, atomically checks/decrements stock, snapshots product prices and address, calculates the total, creates the order and notification, then clears the cart. All writes share a transaction. Item prices are converted to integer kobo during addition, then returned in NGN. No shipping/tax charge is added. No client price or paid-status claim is trusted.

Repeating a successful idempotency key returns the existing order even if the cart is now empty; use a new key for a new order. A conflicting concurrent duplicate can return 409; retry the same key to retrieve the committed order. Empty cart: 400 EMPTY_CART; insufficient/unavailable stock: 409 INSUFFICIENT_STOCK; missing/foreign address: 404; unverified user: 403 EMAIL_NOT_VERIFIED. These failures do not consume stock or clear the cart.

### Paystack checkout

With `paymentMethod: "paystack"` the order is created exactly as above (stock reserved, cart cleared) and the response also contains `payment`: `{reference, authorizationUrl, accessCode, expiresAt}`. Missing `PAYSTACK_SECRET_KEY`: 503 PAYMENT_UNAVAILABLE before anything is reserved. If Paystack cannot be reached, the order is still saved and the response is 502 PAYMENT_PROVIDER_ERROR; retry `POST /orders` with the **same** idempotencyKey to get the checkout.

1. Open `payment.authorizationUrl` in a WebView or the browser (or pass `accessCode` to a Paystack mobile SDK).
2. When the customer finishes, or the WebView navigates to `PAYSTACK_CALLBACK_URL`, call `POST /orders/:id/payment/verify`.
3. Show success only when the returned order has `paymentStatus: "paid"`. `unpaid` means not completed yet.

The server never trusts the app's claim of payment. An order becomes paid only when Paystack itself reports a successful charge for the exact amount in NGN, either via the verify endpoint or the signed webhook. A different amount returns 409 PAYMENT_MISMATCH and the order stays unpaid. Unpaid Paystack orders are cancelled and their stock released after `PAYSTACK_ORDER_TTL_MINUTES` (default 30); the server re-checks Paystack before cancelling. Money arriving after cancellation sets `paymentStatus: "refund_due"` and is logged as `REFUND_DUE` for an admin to refund in the Paystack dashboard.

### POST /orders/:id/payment — resume payment

Authenticated, empty body. Returns the Order with its Paystack checkout, reusing the existing one. For a "Pay now" button on an unpaid order. Cash order: 409 PAYMENT_NOT_REQUIRED; already paid: 409 ORDER_ALREADY_PAID; expired/cancelled: 409 ORDER_NOT_PAYABLE.

### POST /orders/:id/payment/verify — confirm payment

Authenticated, empty body. Asks Paystack for the transaction state and returns the updated Order. Message is `Payment confirmed` when paid, otherwise `Payment not completed yet`. Safe to call repeatedly.

### POST /payments/paystack/webhook — Paystack events

Called by Paystack, not the app. Register `https://<your-host>/api/v1/payments/paystack/webhook` in the Paystack dashboard. Requests without a valid `x-paystack-signature` (HMAC-SHA512 of the raw body with the secret key) get 401 INVALID_SIGNATURE. `charge.success` events are re-verified with Paystack before the order is marked paid. This keeps orders correct even if the app closes before calling verify.

### GET /orders — own order list

Authenticated. Query page/limit and optional `status`: pending, processing, shipped, delivered, cancelled. Returns Order[] and metadata, newest first.

### GET /orders/:id — own order details

Authenticated. ObjectId path. Returns Order or 404, including immutable item/address snapshots.

### POST /orders/:id/cancel — cancel pending order

Authenticated. Empty body. Only an owned pending, unpaid order can be cancelled (a paid Paystack order needs a refund through support). Transactionally changes status and restores each product's quantity once. Returns updated Order. Already cancelled/non-pending/missing/foreign order: 409 ORDER_NOT_CANCELLABLE. Retrying cannot restore stock twice.

### GET /admin/orders — manage orders

Admin. Same filters/pagination as own order list, but returns all users' orders.

### PATCH /admin/orders/:id/status — advance fulfillment

Admin. Required `status` string: processing, shipped or delivered. Allowed sequence: pending → processing → shipped → delivered. No skipping/backtracking. Invalid transition: 409 INVALID_ORDER_TRANSITION. A Paystack order cannot move to processing until paid: 409 PAYMENT_REQUIRED. Marking delivered also records the cash-on-delivery payment as paid, so only do so after collection. Returns updated Order.

## Notifications and support

| Endpoint                 | Access | Body/query                                                                  | Purpose/result                                                             |
| ------------------------ | ------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| GET /notifications       | User   | page/limit                                                                  | Own notifications, newest first; Notification[] + metadata                 |
| PATCH /notifications/:id | Owner  | required `read`: boolean                                                    | Mark read/unread; updated Notification, or 404                             |
| POST /support            | User   | required `subject`: trimmed string 3–150; `message`: trimmed string 10–5000 | Store support ticket; 201 Ticket                                           |
| GET /health              | Public | None                                                                        | `{status: "ready"}` with 200; standard DATABASE_UNAVAILABLE error with 503 |

An unavailable database returns the standard error envelope with code DATABASE_UNAVAILABLE.

## Response objects

| Object       | Fields (type / meaning)                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User         | id:string; username:string; email:string; phone?:string; avatar?:string; role:customer/admin; verified:boolean; preferences:{language:string,notifications:boolean}; createdAt:date. Password, OTP and token-version fields never returned                                                                                                                                                                                                              |
| Product      | id:string; categoryId:string; name:string; description:string; images:string[]; imagePublicIds:string[]; price:number; stock:integer; instock:boolean (derived); colors:string[]; ratings:number; reviews:integer; active:boolean; fave:boolean (false for public catalog); createdAt/updatedAt:date                                                                                                                                                    |
| Category     | id:string; name:string; image:string; imagePublicId?:string; createdAt/updatedAt:date; total:integer on category-list responses                                                                                                                                                                                                                                                                                                                         |
| Address      | id:string; userId:string; all address fields; createdAt/updatedAt:date                                                                                                                                                                                                                                                                                                                                                                                  |
| Cart         | id:string; userId:string; items:[{productId:string,quantity:integer}]; createdAt/updatedAt:date                                                                                                                                                                                                                                                                                                                                                         |
| Order        | id:string; userId:string; idempotencyKey:UUID; items:[{productId:string,name:string,image:string,quantity:integer,unitPrice:number}]; address:Address snapshot; total:number; currency:NGN; paymentMethod:cash_on_delivery/paystack; paymentStatus:unpaid/paid/refund_due; payment?:{reference,authorizationUrl,accessCode,expiresAt,paidAt?,channel?} (Paystack only); status:pending/processing/shipped/delivered/cancelled; createdAt/updatedAt:date |
| Notification | id:string; userId:string; title:string; message:string; read:boolean; createdAt/updatedAt:date                                                                                                                                                                                                                                                                                                                                                          |
| Ticket       | id:string; userId:string; subject:string; message:string; status:open; createdAt/updatedAt:date                                                                                                                                                                                                                                                                                                                                                         |

Optional undefined properties are omitted in JSON. MongoDB internal `_id` and `__v` fields are removed from document responses. User-facing ID is `id`.

## Errors and operational behavior

| HTTP | Code                                                           | Meaning / client action                                                        |
| ---- | -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 400  | INVALID_JSON                                                   | Correct malformed JSON                                                         |
| 400  | INVALID_OTP                                                    | Wrong, expired, used, wrong-purpose or attempt-exhausted code; request another |
| 400  | INCORRECT_PASSWORD                                             | Current password did not match                                                 |
| 400  | EMPTY_CART                                                     | Add items before checkout                                                      |
| 400  | INVALID_UPLOAD                                                 | Wrong/multiple multipart file fields                                           |
| 401  | UNAUTHORIZED / INVALID_TOKEN                                   | Sign in again; token missing, revoked or expired                               |
| 401  | INVALID_CREDENTIALS                                            | Check email/password                                                           |
| 403  | FORBIDDEN                                                      | Admin role required                                                            |
| 403  | EMAIL_NOT_VERIFIED                                             | Complete email verification                                                    |
| 403  | CORS_DENIED                                                    | Configure the browser origin on the server                                     |
| 404  | NOT_FOUND                                                      | Endpoint/resource absent or not owned by caller                                |
| 409  | CONFLICT                                                       | Unique record collision or concurrent modification                             |
| 409  | INSUFFICIENT_STOCK                                             | Refresh stock/cart                                                             |
| 409  | ORDER_NOT_CANCELLABLE / INVALID_ORDER_TRANSITION               | Refresh order status                                                           |
| 409  | PAYMENT_NOT_REQUIRED / ORDER_ALREADY_PAID / ORDER_NOT_PAYABLE  | Refresh the order; place a new one if expired                                  |
| 409  | PAYMENT_MISMATCH                                               | Paid amount differs from the order; contact support                            |
| 409  | PAYMENT_REQUIRED                                               | Admin: wait for the online payment before fulfilment                           |
| 401  | INVALID_SIGNATURE                                              | Webhook not signed by Paystack                                                 |
| 413  | PAYLOAD_TOO_LARGE                                              | JSON >100 KiB or file >5 MiB                                                   |
| 422  | VALIDATION_ERROR                                               | Correct error.details fields                                                   |
| 422  | INVALID_CATEGORY                                               | Use an existing category                                                       |
| 422  | IMAGE_REQUIRED / INVALID_IMAGE                                 | Upload supported valid image                                                   |
| 429  | RATE_LIMITED                                                   | Wait and retry; avoid tight retry loops                                        |
| 502  | EMAIL_DELIVERY_FAILED / UPLOAD_FAILED / PAYMENT_PROVIDER_ERROR | Upstream provider failed; retry later                                          |
| 503  | EMAIL_UNAVAILABLE / STORAGE_UNAVAILABLE / PAYMENT_UNAVAILABLE  | Missing service configuration                                                  |
| 503  | DATABASE_UNAVAILABLE                                           | Database temporarily unreachable                                               |
| 500  | INTERNAL_ERROR                                                 | Unexpected failure; report requestId, retry only safely/idempotently           |

Errors from body parsing, validation, authentication, MongoDB duplicates/casts/validation/network failures, multipart uploads and upstream services use the global handler. Unexpected programming failures are intentionally not exposed verbatim. An HTTP response cannot be guaranteed after a broken client connection, process termination or reverse-proxy rejection; those happen outside the API response lifecycle.

## Example flow

1. POST /auth/register; securely store data.accessToken.
2. POST /auth/resend-verification; POST /auth/verify with emailed code.
3. GET /categories; GET /products?categoryId=electronics.
4. PUT /cart; POST /addresses.
5. POST /orders with the saved address and a newly generated UUID.
6. GET /orders and /orders/:id for the order screens.
7. For forgotten password, POST /auth/forgot-password followed by POST /auth/reset-password with email, OTP and both new-password fields; sign in again.
