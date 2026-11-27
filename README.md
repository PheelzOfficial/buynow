# BuyNow Express API

Express 5 / MongoDB / Cloudinary backend for the existing Flutter screens. All routes are under `/api/v1`. See [the complete endpoint reference](docs/API.md).

## Current setup status

Cloudinary uploads completed for the prepared catalog's 100 product images and 10 category images. Database seeding remains a separate operation (`npm run seed`). OTP delivery uses Brevo's transactional email API; configure the API key and a sender verified in your Brevo account before requesting codes.

## Setup

Requires Node.js 22.12 or newer and MongoDB configured as a replica set (MongoDB Atlas works). Checkout and cancellation use transactions; standalone MongoDB does not support them.

```sh
cd backend
npm ci
# Populate .env using .env.example; do not overwrite existing Cloudinary credentials.
npm run seed
npm start
```

The API listens on `PORT` (default 4500). `GET /api/v1/health` indicates database readiness. Run commands from `backend` so dotenv finds `.env`.

## Environment variables

| Variable                   | Required     | Purpose                                                                                                           |
| -------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------- |
| PORT                       | No           | HTTP port; default 4500                                                                                           |
| NODE_ENV                   | No           | Deployment environment                                                                                            |
| MONGODB_URI                | Yes          | MongoDB connection string; use a dedicated BuyNow database and replica set                                        |
| JWT_SECRET                 | Yes          | Random signing and OTP hashing secret, at least 32 characters; changing it invalidates sessions and existing OTPs |
| CLOUDINARY_NAME            | Upload/seed  | Existing Cloudinary cloud name                                                                                    |
| CLOUDINARY_API_KEY         | Upload/seed  | Cloudinary API key                                                                                                |
| CLOUDINARY_API_SECRET      | Upload/seed  | Cloudinary secret; server only                                                                                    |
| CORS_ORIGINS               | Web clients  | Comma-separated exact browser origins; no wildcard. Native Flutter requests without Origin are accepted           |
| TRUST_PROXY                | No           | Number of trusted proxy hops; leave empty for direct connections                                                  |
| BREVO_API_KEY              | OTP delivery | Brevo API key, server-side only                                                                                   |
| BREVO_SENDER_EMAIL         | OTP delivery | Sender email verified in Brevo                                                                                    |
| BREVO_SENDER_NAME          | No           | Sender display name; defaults to BuyNow                                                                           |
| PAYSTACK_SECRET_KEY        | Online pay   | Paystack secret key (`sk_test_…` / `sk_live_…`), server-side only; never put it in the Flutter app                |
| PAYSTACK_CALLBACK_URL      | No           | Where Paystack redirects after payment; the app's WebView can watch for it                                        |
| PAYSTACK_ORDER_TTL_MINUTES | No           | Minutes an unpaid Paystack order holds stock before expiring; default 30, range 5–1440                            |
| ADMIN_EMAIL                | Seed         | Admin login email; no built-in default credentials                                                                |
| ADMIN_PASSWORD             | Seed         | At least 12 and at most 72 characters, uppercase, lowercase, digit                                                |
| ADMIN_USERNAME             | No           | Admin display name; default BuyNow Admin                                                                          |

A random JWT secret has been added to the local `.env`. Secrets and upload reports are ignored by Git. Never bundle `.env` in Flutter.

## Catalog and admin seeding

`scripts/catalog.json` contains all 26 original provider products and 74 added demonstration products: 10 categories with 10 products each. Original IDs, descriptions, prices, colors, ratings and review counts are preserved. The provider's review figures are imported sample aggregates, not verified customer reviews. Added products have zero reviews and ratings and sample NGN prices. Footwear (EU 38–45; women's styles 36–41) and clothing (S–XXL; jeans waist 30–38) have per-size stock. Re-running the seed adds those sizes to already-seeded products that have none, splitting each product's current stock across them so totals do not change.

`npm run seed`:

1. Validates MongoDB and admin settings and connects to MongoDB.
2. Downloads every category and product image with a timeout, byte-size bound and hostname allowlist.
3. Decodes each image, validates its dimensions/format and re-encodes to WebP. An unreadable product image falls back to its category image; failures are never saved as broken URLs.
4. Uploads category images before category records; uploads product images before product records.
5. Upserts missing records by stable ID. Existing catalog edits, stock and admin passwords are preserved.
6. Creates the verified admin if absent. Refuses to silently promote an existing customer.
7. Counts active products and fails if any seed category has fewer than 10.

`node scripts/seed.js --media-only` uploads and validates images without MongoDB or admin settings. `seed-report.json` checkpoints uploaded images, replacements and final database counts; it permits resuming interrupted uploads. Image validity checks confirm that files can be decoded, not that an image depicts the exact branded model. Matching product photos for 52 additions come from the [DummyJSON sample catalog](https://dummyjson.com/docs/products); the remaining additions use category illustrations. Review merchandising imagery and sample prices before selling. Run `python3 scripts/enrich_catalog.py /path/to/downloaded-products.json` to reapply sample-photo enrichment after extracting the Flutter catalog.

To re-extract the original Flutter catalog and rebuild additions: `python3 scripts/extract_catalog.py`. Do not run that command after manually curating `catalog.json` unless you intend to replace the curation.

## Testing

```sh
npm test
# If MongoDB is installed locally, avoid downloading the test binary:
MONGOMS_SYSTEM_BINARY=/usr/local/bin/mongod npm test
```

Tests use a temporary isolated replica set, never `MONGODB_URI`. They cover validation, consistent envelopes, account privilege protection, catalog filters, ownership, checkout totals and replay, inventory rollback, OTP consumption/session revocation and binary image validation. Brevo requests are mocked in tests, including rejection, timeout, payload, and OTP cleanup checks; no test emails are sent. Live delivery requires your Brevo API key and verified sender. The seed performs actual Cloudinary uploads.

## Architecture

The backend uses a feature-based modular monolith. Each business feature owns its routes, controllers, validation, services, and Mongoose model. The application runs as one Express service, with explicit boundaries between HTTP handling, business operations, and persistence. See [the architecture guide](docs/ARCHITECTURE.md) for responsibilities, dependency rules, and instructions for extending a feature.

```text
backend/
  app.js                  # Compatibility export for the Express application
  src/
    app.js                # Express middleware and router composition
    server.js             # Startup, listener, and graceful shutdown
    routes.js             # /api/v1 route registration
    config/               # Environment access and database lifecycle
    database/             # Explicit model registry for index initialization
    common/
      database/           # Shared schema serialization settings
      errors/             # Application errors
      http/               # Consistent response helper
      middleware/         # Validation, authorization, errors, limits, uploads
      utils/              # Pagination metadata
      validation/         # Shared field schemas
    integrations/
      cloudinary/         # Cloudinary client configuration
      email/              # Brevo transactional email adapter
    modules/
      auth/               # Login, registration, sessions, OTP lifecycle
      users/              # Profile, password changes, user model/serialization
      products/           # Product browsing and administration
      categories/         # Category browsing and administration
      addresses/          # Customer addresses
      cart/               # Cart operations
      favorites/          # Saved products
      orders/             # Checkout, stock transactions, fulfillment
      notifications/      # Customer notifications
      support/            # Support tickets
      media/              # Image validation and uploads
      health/             # Readiness reporting
  scripts/                # Seed/extraction tools and architecture checks
  test/                   # API regression tests
  docs/                   # API reference and architecture guide
```

## Formatting and checks

```sh
cd backend
npm run format             # Format backend JS, JSON, and Markdown
npm run format:check       # Verify formatting without writing
npm run architecture:check # Check module imports, boundaries, and cycles
npm test                   # Run integration tests
npm run check              # Formatting + architecture + tests
```

`.editorconfig` defines UTF-8, LF line endings, indentation, and final newlines. `.prettierrc.json` defines JavaScript/JSON/Markdown formatting. Python seed helpers use Black: install the pinned formatter with `python3 -m pip install -r requirements-dev.txt`, then run `python3 -m black scripts` or `python3 -m black --check scripts`. Generated dependencies, credentials, and Cloudinary checkpoint reports are excluded from formatting. All commands are scoped to the backend; no Flutter files are formatted or modified.

## Flutter integration and scope

This change creates the backend; Flutter screens/providers still need HTTP integration. Use `http://10.0.2.2:4500/api/v1` from an Android emulator, localhost from the local iOS simulator, or the development machine's LAN IP from a phone. Production requires HTTPS. Store bearer tokens using secure device storage.

`ProductModel.fromJson` and `Category.fromJson` can consume the documented product/category shapes. Read the array from `response.data`, pagination from `response.meta`. Favorites are obtained from `/favorites`; `fave` on public product responses defaults to false. Convert prices with `(json['price'] as num).toDouble()` in Dart to accept both integer and fractional JSON numbers. The current Dart `toJson` color mask uses `0xFF000000`; use `0x00FFFFFF` to serialize RGB correctly.

Authentication currently uses email, although the Flutter label says email or phone. Phone is a validated optional profile field; SMS login and Google/Facebook OAuth need provider setup and are not implemented. Payments support cash on delivery only; the card UI must not submit card numbers to this API. A payment provider and verified webhook flow are still needed for online payments. No card fields are accepted or stored. Shipping/tax calculations and coupons are not configured; the current total is the item subtotal in NGN. Onboarding, language rendering, banners and legal-policy copy remain frontend content. Support tickets are stored; sending them to a support inbox is not configured.

Rate limits are in process (120 requests/minute globally; 20 auth requests/15 minutes per IP). Use a shared store when deploying multiple instances. Configure only trusted proxies. User and order ownership is checked server-side; checkout requires a verified account. Logout, password change and password reset revoke all existing access tokens for that account. Unexpected exceptions return a generic message and a request ID, with no stack trace or credentials in the response.

## Brevo email setup

Set `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, and optionally `BREVO_SENDER_NAME=BuyNow` in `backend/.env`, then restart the API. The sender must be verified in Brevo. This adapter uses the [Brevo transactional email API](https://developers.brevo.com/reference/send-transac-email) with the `api-key` header; SMTP credentials are no longer used.

Email verification and password reset share this adapter. Requests time out after 20 seconds. Missing/invalid local email configuration returns `503 EMAIL_UNAVAILABLE`; provider rejection, quota/rate limits, and network failures return a sanitized `502 EMAIL_DELIVERY_FAILED`. Undelivered OTP state is cleared so the customer can request a new code. Successful API acceptance does not guarantee inbox delivery; use Brevo delivery logs to check bounces or delivery failures.
