# Backend architecture

## Approach

BuyNow uses a feature-based modular monolith: one Express process, one MongoDB database, and separate modules for each business capability. This fits the current application while allowing features to grow without putting unrelated endpoints and models into large shared files.

The public `/api/v1` endpoint paths, request fields, response envelopes, and database collection names are retained. The refactor does not migrate or seed databases, upload assets, change credentials, or modify the Flutter project. `backend/app.js` remains a compatibility export; the actual Express application lives in `src/app.js`.

## Request lifecycle

1. `src/app.js` applies request IDs, security headers, CORS, rate limits, and body parsing.
2. `src/routes.js` mounts feature routers under `/api/v1`.
3. A feature's routes select authentication, authorization, and input-validation middleware.
4. Validation parses a strict Zod schema into `req.validated.body`, `req.validated.query`, or `req.validated.params`.
5. The controller passes explicit values such as `input`, `filters`, `resourceId`, and `userId` to its service.
6. The service applies business rules and uses Mongoose models or integration adapters.
7. The controller passes the result to the shared success-response helper.
8. Express 5 forwards rejected asynchronous handlers to the shared error middleware, which produces the standard error envelope.

Services do not receive Express request/response objects. Endpoint messages and HTTP response statuses belong in controllers. Domain services may throw `ApiError` with the existing status/code contract so that the global error handler can translate failures consistently.

## Responsibilities

| Location             | Owns                                                                    | Avoid                                                             |
| -------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `src/server.js`      | Configuration validation, database startup, listener, signals, shutdown | Feature behavior or route definitions                             |
| `src/app.js`         | Express application composition                                         | Starting a listener or connecting to a database during imports    |
| `src/routes.js`      | Versioned route mounting                                                | Querying models or processing requests                            |
| `config/env.js`      | Loading the backend `.env`, environment access, startup checks          | Printing secrets; scattering configuration parsing across modules |
| `config/database.js` | Connecting/disconnecting and waiting for model indexes                  | Request-specific queries                                          |
| `database/models.js` | Explicit exports of all models for bootstrap/seed/tests                 | A single file containing every model schema                       |
| `*.routes.js`        | HTTP method/path, middleware order, controller selection                | Business logic or persistence                                     |
| `*.validation.js`    | Strict request schemas and field constraints                            | Database queries, HTTP responses, service calls                   |
| `*.controller.js`    | Mapping HTTP input to service inputs and formatting results             | Mongoose queries or external-provider calls                       |
| `*.service.js`       | Business operations, orchestration, transactions                        | Importing controllers/routes or accessing Express objects         |
| `*.model.js`         | Mongoose schemas, indexes, serialization-related virtuals               | HTTP behavior or service orchestration                            |
| `*.serializer.js`    | Public representations of domain data                                   | Exposing password/OTP/internal fields                             |
| `integrations/`      | Brevo and Cloudinary provider access                                    | Express request handling or endpoint response formatting          |
| `common/`            | Shared errors, response format, middleware, field schemas               | Unrelated feature endpoints                                       |

Mongoose already supplies the persistence abstraction for this project. Services use models directly; a separate repository layer is not added solely to wrap each Mongoose call. Add one when a concrete need arises, such as alternative storage or a reusable complex query boundary.

## Feature layout

For example, products are implemented in:

```text
src/modules/products/
  product.model.js
  products.validation.js
  products.routes.js
  products.controller.js
  products.service.js
```

File roles follow the same convention for users, categories, addresses, cart, favorites, orders, notifications, and support. Models use singular entity names; the other files use the module name. Smaller modules only include files they need: health has a controller/service pair, and media reuses shared multipart and empty-body validation.

Authentication has additional focused services:

- `auth.service.js`: account registration, sign-in, OTP requests, verification, reset, and logout.
- `otp.service.js`: OTP hashing, cooldown, expiry, attempt counting, consumption, and delivery orchestration.
- `token.service.js`: session token creation.
- `users/user.serializer.js`: the public user representation, shared by auth and profile responses.

The shared authentication middleware validates the bearer token, loads the current user, and checks token revocation before a protected controller executes. Authorization middleware checks admin role or verification requirements. Controllers pass the authenticated user's identity into ownership-scoped services; they do not accept ownership IDs from request bodies.

## Service results

Feature endpoint services return `{ data, meta }`. `data` contains the requested domain payload; `meta` contains pagination metadata or is null. This is an internal result shape, not the HTTP response envelope. It contains neither an Express response nor a status/message. Controllers choose the endpoint's success message/status and the shared helper produces the public envelope.

Lower-level services return their natural result: the OTP consumer returns the updated user, the token service returns a token string, and the image-upload service returns the provider upload result.

## Transactions and consistency

Order placement and cancellation own their MongoDB transaction boundaries in `orders.service.js`. Refactoring preserves the existing stock checks, immutable order snapshots, server-calculated totals, idempotency keys, and inventory rollback behavior. The same session is passed to every participating write, and sessions close in `finally` blocks. MongoDB must run as a replica set or Atlas deployment.

Related feature models can be used together by an orchestration service. For example, checkout intentionally coordinates order, product, cart, address, and notification models. This dependency is explicit; it is not hidden in a model hook or controller.

## External integrations and configuration

`config/env.js` loads `.env` relative to the backend directory instead of relying on the shell's working directory. It exposes configuration getters so tests can substitute Brevo settings without copying production credentials. Required startup settings are validated before listening.

`integrations/email/email.service.js` owns Brevo HTTP requests, authentication headers, HTML escaping, and request timeouts. The OTP domain service owns code generation and the account-state updates around delivery; the mail adapter submits the message to Brevo and sanitizes provider errors.

`integrations/cloudinary/cloudinary.client.js` configures the Cloudinary client. `modules/media/media.service.js` validates and normalizes image bytes, invokes storage, and translates provider failures to application errors. Multipart parsing remains HTTP middleware.

Importing `src/app.js` does not connect to MongoDB or start a server. Integration tests can import the application and attach an isolated database. Startup and index initialization occur only through `src/server.js` and `config/database.js`.

## Adding or changing a feature

1. Add or update the feature's model if persistence changes are needed. Register new models in `database/models.js` so bootstrap waits for their indexes.
2. Define request schemas in the feature's validation file, reusing shared field schemas where appropriate.
3. Implement behavior in the service using explicit arguments. Preserve ownership checks and transactional boundaries.
4. Add a controller that maps validated request values to the service and sends the standard response.
5. Wire method/path/middleware/controller in the feature router and mount new routers in `src/routes.js`.
6. Document endpoint fields, types, results, and errors in `docs/API.md`.
7. Add regression coverage for meaningful behavior, then run formatting, architecture checks, and tests.

Do not place secrets in tests or fixtures. Use an isolated test database; do not point tests at the deployment database. Do not invoke the seed or upload scripts as part of normal API imports.

## Automated guardrails

`npm run architecture:check` verifies all relative source imports resolve, checks dependency cycles, and enforces these boundaries:

- Services cannot import Express, routes, or controllers, or access HTTP request/response fields.
- Controllers cannot import models, Mongoose, or integration adapters directly.
- Routers cannot import models or services directly.
- Validation and model files cannot import routes, controllers, or services.

These lightweight source checks catch common structural mistakes; they complement code review and integration tests rather than proving every possible runtime dependency.

`npm run format:check` enforces Prettier formatting for backend JavaScript, JSON, and Markdown. `.editorconfig` supplies consistent editor defaults. Python seed helpers are formatted with the pinned Black development tool. `npm test` exercises the API against a temporary MongoDB replica set. `npm run check` combines the JavaScript formatting check, architecture check, and tests.
