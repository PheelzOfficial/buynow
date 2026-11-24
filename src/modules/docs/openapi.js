// Builds the OpenAPI 3.1 document. Request schemas come from the same Zod validators the routes
// enforce, so field rules cannot drift from runtime behavior. Response schemas are hand-written
// because responses are produced by serializers, not Zod; keep them aligned with docs/API.md.
import { z } from 'zod';

import { empty } from '../../common/validation/schemas.js';
import * as addresses from '../addresses/addresses.validation.js';
import * as auth from '../auth/auth.validation.js';
import * as cart from '../cart/cart.validation.js';
import * as categories from '../categories/categories.validation.js';
import * as favorites from '../favorites/favorites.validation.js';
import * as notifications from '../notifications/notifications.validation.js';
import * as orders from '../orders/orders.validation.js';
import * as products from '../products/products.validation.js';
import * as support from '../support/support.validation.js';
import * as users from '../users/users.validation.js';

const jsonSchema = (schema) => {
  // Input shape: what clients send, before defaults/transforms. Refinements (e.g. matching
  // passwords, minPrice <= maxPrice) are not expressible in JSON Schema and are described in prose.
  const { $schema, ...rest } = z.toJSONSchema(schema, {
    io: 'input',
    unrepresentable: 'any',
    // z.url().startsWith() replaces the URL format with Zod's internal check name; restore `uri`.
    override: ({ jsonSchema: out }) => {
      if (out.format === 'starts_with') out.format = 'uri';
    },
  });
  return rest;
};

const parameters = (schema, location) => {
  const { properties = {}, required = [] } = jsonSchema(schema);
  // Swagger UI renders parameter-level description/example, not the nested schema's.
  return Object.entries(properties).map(([name, { description, example, ...property }]) => ({
    name,
    in: location,
    required: location === 'path' || required.includes(name),
    description,
    ...(example === undefined ? {} : { example }),
    schema: property,
  }));
};

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const array = (items) => ({ type: 'array', items });
const str = { type: 'string' };
const int = { type: 'integer' };
const num = { type: 'number' };
const bool = { type: 'boolean' };
const date = { type: 'string', format: 'date-time' };
const timestamps = { createdAt: date, updatedAt: date };

const envelope = (data, { paginated = false } = {}) => ({
  allOf: [
    ref('SuccessEnvelope'),
    {
      type: 'object',
      properties: { data, ...(paginated ? { meta: ref('Pagination') } : {}) },
    },
  ],
});

const errorResponse = (description) => ({
  description,
  content: { 'application/json': { schema: ref('ErrorEnvelope') } },
});

const commonErrors = {
  422: errorResponse('VALIDATION_ERROR — see error.details'),
  429: errorResponse('RATE_LIMITED'),
};
const authErrors = { 401: errorResponse('UNAUTHORIZED / INVALID_TOKEN') };
const adminErrors = { ...authErrors, 403: errorResponse('FORBIDDEN — admin role required') };

/**
 * One entry per route. `access`: public | user | admin. Path params use OpenAPI `{id}` syntax;
 * the route-coverage test maps them back to Express `:id` paths.
 */
const operations = [
  // Health
  [
    'get',
    '/health',
    {
      tag: 'Health',
      summary: 'Readiness probe',
      access: 'public',
      data: { type: 'object', properties: { status: { const: 'ready' } } },
      errors: { 503: errorResponse('DATABASE_UNAVAILABLE') },
    },
  ],

  // Auth
  [
    'post',
    '/auth/register',
    {
      tag: 'Auth',
      summary: 'Create a customer account',
      access: 'public',
      body: auth.registerBodySchema,
      status: 201,
      data: ref('Session'),
      errors: { 409: errorResponse('CONFLICT — email already registered') },
      description:
        'Does not send an email; call resend-verification afterwards. Accounts start unverified and cannot place orders.',
    },
  ],
  [
    'post',
    '/auth/login',
    {
      tag: 'Auth',
      summary: 'Obtain an access token',
      access: 'public',
      body: auth.loginBodySchema,
      data: ref('Session'),
      errors: { 401: errorResponse('INVALID_CREDENTIALS') },
    },
  ],
  [
    'post',
    '/auth/resend-verification',
    {
      tag: 'Auth',
      summary: 'Email a verification OTP',
      access: 'public',
      body: auth.resendVerificationBodySchema,
      description:
        'Same response whether or not the account exists. One-minute cooldown; a new OTP replaces any previous one.',
    },
  ],
  [
    'post',
    '/auth/verify',
    {
      tag: 'Auth',
      summary: 'Verify email with OTP',
      access: 'public',
      body: auth.verifyEmailBodySchema,
      errors: { 400: errorResponse('INVALID_OTP') },
    },
  ],
  [
    'post',
    '/auth/forgot-password',
    {
      tag: 'Auth',
      summary: 'Email a password-reset OTP',
      access: 'public',
      body: auth.forgotPasswordBodySchema,
      errors: {
        502: errorResponse('EMAIL_DELIVERY_FAILED'),
        503: errorResponse('EMAIL_UNAVAILABLE'),
      },
    },
  ],
  [
    'post',
    '/auth/reset-password',
    {
      tag: 'Auth',
      summary: 'Verify OTP and set a new password',
      access: 'public',
      body: auth.resetPasswordBodySchema,
      errors: { 400: errorResponse('INVALID_OTP') },
      description:
        '`confirmPassword` must equal `newPassword` (checked before an OTP attempt is consumed). Revokes all sessions.',
    },
  ],
  [
    'post',
    '/auth/logout',
    { tag: 'Auth', summary: 'Revoke all sessions', access: 'user', body: auth.logoutBodySchema },
  ],

  // Profile
  ['get', '/me', { tag: 'Profile', summary: 'Current user', access: 'user', data: ref('User') }],
  [
    'patch',
    '/me',
    {
      tag: 'Profile',
      summary: 'Update profile and preferences',
      access: 'user',
      body: users.updateProfileBodySchema,
      data: ref('User'),
      description: 'At least one field required. `preferences` is merged with existing values.',
    },
  ],
  [
    'post',
    '/me/change-password',
    {
      tag: 'Profile',
      summary: 'Change password',
      access: 'user',
      body: users.changePasswordBodySchema,
      errors: {
        400: errorResponse('INCORRECT_PASSWORD'),
        409: errorResponse('CONFLICT — concurrent password change'),
      },
      description:
        'New password must match confirmation and differ from the current one. Revokes all sessions.',
    },
  ],

  // Catalog
  [
    'get',
    '/products',
    {
      tag: 'Catalog',
      summary: 'Browse, search and filter products',
      access: 'public',
      query: products.listProductsQuerySchema,
      data: array(ref('Product')),
      paginated: true,
      description: '`maxPrice` must be ≥ `minPrice`. Only active products are returned.',
    },
  ],
  [
    'get',
    '/products/{id}',
    {
      tag: 'Catalog',
      summary: 'Product details',
      access: 'public',
      params: products.getProductParamsSchema,
      data: ref('Product'),
      errors: { 404: errorResponse('NOT_FOUND') },
    },
  ],
  [
    'get',
    '/categories',
    {
      tag: 'Catalog',
      summary: 'List categories',
      access: 'public',
      query: categories.listCategoriesQuerySchema,
      data: array(ref('Category')),
      paginated: true,
    },
  ],
  [
    'post',
    '/admin/products',
    {
      tag: 'Admin',
      summary: 'Create product',
      access: 'admin',
      body: products.createProductBodySchema,
      status: 201,
      data: ref('Product'),
      errors: {
        409: errorResponse('CONFLICT — duplicate ID'),
        422: errorResponse('VALIDATION_ERROR / INVALID_CATEGORY'),
      },
      description: 'Price allows at most two decimal places.',
    },
  ],
  [
    'patch',
    '/admin/products/{id}',
    {
      tag: 'Admin',
      summary: 'Edit or deactivate product',
      access: 'admin',
      params: products.updateProductParamsSchema,
      body: products.updateProductBodySchema,
      data: ref('Product'),
      errors: { 404: errorResponse('NOT_FOUND') },
      description: 'At least one field required. Send `{"active": false}` to hide a product.',
    },
  ],
  [
    'post',
    '/admin/categories',
    {
      tag: 'Admin',
      summary: 'Create category',
      access: 'admin',
      body: categories.createCategoryBodySchema,
      status: 201,
      data: ref('Category'),
      errors: { 409: errorResponse('CONFLICT') },
    },
  ],
  [
    'patch',
    '/admin/categories/{id}',
    {
      tag: 'Admin',
      summary: 'Update category',
      access: 'admin',
      params: categories.updateCategoryParamsSchema,
      body: categories.updateCategoryBodySchema,
      data: ref('Category'),
      errors: { 404: errorResponse('NOT_FOUND') },
    },
  ],

  // Media
  [
    'post',
    '/uploads/image',
    {
      tag: 'Media',
      summary: 'Upload an image to Cloudinary',
      access: 'user',
      multipart: true,
      status: 201,
      data: { type: 'object', properties: { url: str, publicId: str, width: int, height: int } },
      errors: {
        400: errorResponse('INVALID_UPLOAD'),
        413: errorResponse('PAYLOAD_TOO_LARGE'),
        422: errorResponse('IMAGE_REQUIRED / INVALID_IMAGE'),
        502: errorResponse('UPLOAD_FAILED'),
      },
      description: 'JPEG/PNG/WebP, ≤5 MiB, 80×80 to 25 MP. Stored as WebP, max 1600×1600.',
    },
  ],

  // Addresses
  [
    'get',
    '/addresses',
    {
      tag: 'Addresses',
      summary: 'List own addresses',
      access: 'user',
      data: array(ref('Address')),
    },
  ],
  [
    'post',
    '/addresses',
    {
      tag: 'Addresses',
      summary: 'Create address',
      access: 'user',
      body: addresses.createAddressBodySchema,
      status: 201,
      data: ref('Address'),
    },
  ],
  [
    'patch',
    '/addresses/{id}',
    {
      tag: 'Addresses',
      summary: 'Edit address',
      access: 'user',
      params: addresses.updateAddressParamsSchema,
      body: addresses.updateAddressBodySchema,
      data: ref('Address'),
      errors: { 404: errorResponse('NOT_FOUND') },
    },
  ],
  [
    'delete',
    '/addresses/{id}',
    {
      tag: 'Addresses',
      summary: 'Delete address',
      access: 'user',
      params: addresses.deleteAddressParamsSchema,
      body: addresses.deleteAddressBodySchema,
      errors: { 404: errorResponse('NOT_FOUND') },
    },
  ],

  // Cart
  [
    'get',
    '/cart',
    {
      tag: 'Cart',
      summary: 'Current cart with price preview',
      access: 'user',
      data: ref('CartView'),
    },
  ],
  [
    'put',
    '/cart',
    {
      tag: 'Cart',
      summary: 'Replace the entire cart',
      access: 'user',
      body: cart.replaceCartBodySchema,
      data: ref('Cart'),
      errors: { 409: errorResponse('INSUFFICIENT_STOCK') },
      description:
        'Product IDs must be unique. `[]` clears the cart. Stock is not reserved until checkout.',
    },
  ],

  // Favorites
  [
    'get',
    '/favorites',
    {
      tag: 'Favorites',
      summary: 'List favorite products',
      access: 'user',
      query: favorites.listFavoritesQuerySchema,
      data: array(ref('Product')),
      paginated: true,
    },
  ],
  [
    'put',
    '/favorites/{id}',
    {
      tag: 'Favorites',
      summary: 'Save product (idempotent)',
      access: 'user',
      params: favorites.addFavoriteParamsSchema,
      body: favorites.addFavoriteBodySchema,
      errors: { 404: errorResponse('NOT_FOUND') },
    },
  ],
  [
    'delete',
    '/favorites/{id}',
    {
      tag: 'Favorites',
      summary: 'Remove product (idempotent)',
      access: 'user',
      params: favorites.removeFavoriteParamsSchema,
      body: favorites.removeFavoriteBodySchema,
    },
  ],

  // Orders
  [
    'post',
    '/orders',
    {
      tag: 'Orders',
      summary: 'Place order from cart',
      access: 'user',
      verified: true,
      body: orders.placeOrderBodySchema,
      status: 201,
      data: ref('Order'),
      errors: {
        400: errorResponse('EMPTY_CART'),
        403: errorResponse('EMAIL_NOT_VERIFIED'),
        404: errorResponse('NOT_FOUND — address'),
        409: errorResponse('INSUFFICIENT_STOCK / CONFLICT'),
      },
      description:
        'Generate `idempotencyKey` once per checkout and reuse it on retries; a repeated key returns the existing order.',
    },
  ],
  [
    'get',
    '/orders',
    {
      tag: 'Orders',
      summary: 'List own orders',
      access: 'user',
      query: orders.listOrdersQuerySchema,
      data: array(ref('Order')),
      paginated: true,
    },
  ],
  [
    'get',
    '/orders/{id}',
    {
      tag: 'Orders',
      summary: 'Own order details',
      access: 'user',
      params: orders.getOrderParamsSchema,
      data: ref('Order'),
      errors: { 404: errorResponse('NOT_FOUND') },
    },
  ],
  [
    'post',
    '/orders/{id}/cancel',
    {
      tag: 'Orders',
      summary: 'Cancel pending order',
      access: 'user',
      params: orders.cancelOrderParamsSchema,
      body: orders.cancelOrderBodySchema,
      data: ref('Order'),
      errors: { 409: errorResponse('ORDER_NOT_CANCELLABLE') },
    },
  ],
  [
    'get',
    '/admin/orders',
    {
      tag: 'Admin',
      summary: 'List all orders',
      access: 'admin',
      query: orders.listAdminOrdersQuerySchema,
      data: array(ref('Order')),
      paginated: true,
    },
  ],
  [
    'patch',
    '/admin/orders/{id}/status',
    {
      tag: 'Admin',
      summary: 'Advance fulfillment status',
      access: 'admin',
      params: orders.updateOrderStatusParamsSchema,
      body: orders.updateOrderStatusBodySchema,
      data: ref('Order'),
      errors: { 409: errorResponse('INVALID_ORDER_TRANSITION') },
      description:
        'pending → processing → shipped → delivered; no skipping. `delivered` marks cash-on-delivery as paid.',
    },
  ],

  // Notifications & support
  [
    'get',
    '/notifications',
    {
      tag: 'Notifications',
      summary: 'List own notifications',
      access: 'user',
      query: notifications.listNotificationsQuerySchema,
      data: array(ref('Notification')),
      paginated: true,
    },
  ],
  [
    'patch',
    '/notifications/{id}',
    {
      tag: 'Notifications',
      summary: 'Mark read/unread',
      access: 'user',
      params: notifications.updateNotificationParamsSchema,
      body: notifications.updateNotificationBodySchema,
      data: ref('Notification'),
      errors: { 404: errorResponse('NOT_FOUND') },
    },
  ],
  [
    'post',
    '/support',
    {
      tag: 'Support',
      summary: 'Open a support ticket',
      access: 'user',
      body: support.createTicketBodySchema,
      status: 201,
      data: ref('Ticket'),
    },
  ],
];

const addressFields = {
  name: str,
  phone: str,
  line1: str,
  line2: str,
  city: str,
  state: str,
  postalCode: str,
  country: { type: 'string', pattern: '^[A-Z]{2}$' },
};

const components = {
  securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
  schemas: {
    SuccessEnvelope: {
      type: 'object',
      required: ['success', 'message', 'data', 'error', 'meta', 'requestId'],
      properties: {
        success: { const: true },
        message: str,
        data: {},
        error: { type: 'null' },
        meta: { oneOf: [ref('Pagination'), { type: 'null' }] },
        requestId: { type: 'string', format: 'uuid' },
      },
    },
    ErrorEnvelope: {
      type: 'object',
      required: ['success', 'message', 'data', 'error', 'meta', 'requestId'],
      properties: {
        success: { const: false },
        message: str,
        data: { type: 'null' },
        error: {
          type: 'object',
          required: ['code', 'details'],
          properties: {
            code: {
              type: 'string',
              description: 'Stable machine-readable code; branch on this, not message',
            },
            details: array({ type: 'object', properties: { field: str, message: str } }),
          },
        },
        meta: { type: 'null' },
        requestId: { type: 'string', format: 'uuid' },
      },
    },
    Pagination: {
      type: 'object',
      properties: { page: int, limit: int, total: int, pages: int, hasNext: bool },
    },
    User: {
      type: 'object',
      properties: {
        id: str,
        username: str,
        email: { type: 'string', format: 'email' },
        phone: str,
        avatar: str,
        role: { enum: ['customer', 'admin'] },
        verified: bool,
        preferences: {
          type: 'object',
          properties: { language: { enum: ['en', 'fr', 'es'] }, notifications: bool },
        },
        createdAt: date,
      },
    },
    Session: {
      type: 'object',
      properties: {
        user: ref('User'),
        accessToken: { type: 'string', description: 'JWT, valid for one day' },
      },
    },
    Product: {
      type: 'object',
      properties: {
        id: str,
        categoryId: str,
        name: str,
        description: str,
        images: array(str),
        imagePublicIds: array(str),
        price: { type: 'number', description: 'NGN, not kobo' },
        stock: int,
        instock: bool,
        colors: array(str),
        ratings: num,
        reviews: int,
        active: bool,
        fave: bool,
        ...timestamps,
      },
    },
    Category: {
      type: 'object',
      properties: {
        id: str,
        name: str,
        image: str,
        imagePublicId: str,
        total: { type: 'integer', description: 'Active products; list responses only' },
        ...timestamps,
      },
    },
    Address: {
      type: 'object',
      properties: { id: str, userId: str, ...addressFields, ...timestamps },
    },
    Cart: {
      type: 'object',
      properties: {
        id: str,
        userId: str,
        items: array({ type: 'object', properties: { productId: str, quantity: int } }),
        ...timestamps,
      },
    },
    CartView: {
      type: 'object',
      properties: {
        items: array({
          type: 'object',
          properties: {
            product: { oneOf: [ref('Product'), { type: 'null' }] },
            productId: str,
            quantity: int,
          },
        }),
        total: num,
        currency: { const: 'NGN' },
      },
    },
    Order: {
      type: 'object',
      properties: {
        id: str,
        userId: str,
        idempotencyKey: { type: 'string', format: 'uuid' },
        items: array({
          type: 'object',
          properties: { productId: str, name: str, image: str, quantity: int, unitPrice: num },
        }),
        address: { type: 'object', properties: addressFields },
        total: num,
        currency: { const: 'NGN' },
        paymentMethod: { const: 'cash_on_delivery' },
        paymentStatus: { enum: ['unpaid', 'paid'] },
        status: { enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'] },
        ...timestamps,
      },
    },
    Notification: {
      type: 'object',
      properties: { id: str, userId: str, title: str, message: str, read: bool, ...timestamps },
    },
    Ticket: {
      type: 'object',
      properties: {
        id: str,
        userId: str,
        subject: str,
        message: str,
        status: { const: 'open' },
        ...timestamps,
      },
    },
  },
};

const typeLabel = (schema) => {
  if (schema.enum) return schema.enum.join(' \\| ');
  if (schema.const !== undefined) return String(schema.const);
  if (schema.type === 'array')
    return `${schema.items?.type === 'object' ? 'object' : typeLabel(schema.items ?? {})}[]`;
  return schema.format ? `${schema.type} (${schema.format})` : (schema.type ?? 'any');
};

// Markdown table of every body field (nested ones as `a.b` / `a[].b`), rendered at the top of the
// operation. Swagger UI hides JSON body descriptions behind the Schema tab; this keeps them visible.
function fieldTable(schema) {
  const rows = [];
  const cell = (text) =>
    String(text ?? '')
      .replace(/\|/g, '\\|')
      .replace(/\n/g, ' ');
  const walk = (node, prefix) => {
    for (const [name, field] of Object.entries(node.properties ?? {})) {
      const path = prefix + name;
      const example = field.example === undefined ? '' : `\`${JSON.stringify(field.example)}\``;
      const required = (node.required ?? []).includes(name) ? 'Yes' : 'No';
      rows.push(
        `| \`${path}\` | ${typeLabel(field)} | ${required} | ${cell(field.description)} | ${cell(example)} |`,
      );
      if (field.properties) walk(field, `${path}.`);
      if (field.items?.properties) walk(field.items, `${path}[].`);
    }
  };
  walk(schema, '');
  if (!rows.length) return '';
  return [
    '**Request body fields**',
    '',
    '| Field | Type | Required | Description | Example |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function buildOperation({
  tag,
  summary,
  description,
  access,
  verified,
  params,
  query,
  body,
  multipart,
  status = 200,
  data = { type: 'null' },
  paginated,
  errors = {},
}) {
  const operation = { tags: [tag], summary };
  if (description) operation.description = description;
  if (access !== 'public') operation.security = [{ bearerAuth: [] }];
  const parameterList = [
    ...(params ? parameters(params, 'path') : []),
    ...(query ? parameters(query, 'query') : []),
  ];
  if (parameterList.length) operation.parameters = parameterList;
  if (multipart) {
    operation.requestBody = {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            required: ['image'],
            properties: {
              image: {
                type: 'string',
                format: 'binary',
                description:
                  'The image file: JPEG, PNG or WebP, up to 5 MiB, at least 80×80 px. Send it as the only form field, named `image`.',
              },
            },
            additionalProperties: false,
          },
        },
      },
    };
  } else if (body && body !== empty) {
    const schema = jsonSchema(body);
    operation.requestBody = { required: true, content: { 'application/json': { schema } } };
    operation.description = [description, fieldTable(schema)].filter(Boolean).join('\n\n');
  }
  operation.responses = {
    [status]: {
      description: 'Success',
      content: { 'application/json': { schema: envelope(data, { paginated }) } },
    },
    ...(access === 'admin' ? adminErrors : access === 'user' ? authErrors : {}),
    ...(verified ? { 403: errorResponse('EMAIL_NOT_VERIFIED') } : {}),
    ...commonErrors,
    ...errors,
  };
  return operation;
}

export const documentedOperations = operations.map(([method, path]) => ({ method, path }));

export function buildOpenApiDocument() {
  const paths = {};
  for (const [method, path, definition] of operations) {
    paths[path] ??= {};
    paths[path][method] = buildOperation(definition);
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'BuyNow API',
      version: '1.0.0',
      description:
        'Every response uses the standard envelope `{success, message, data, error, meta, requestId}`. ' +
        'Unknown body fields are rejected. Narrative rules live in backend/docs/API.md.',
    },
    servers: [{ url: '/api/v1' }],
    components,
    paths,
  };
}
