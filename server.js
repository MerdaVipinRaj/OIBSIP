const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const Razorpay = require('razorpay');

const app = express();
const CLIENT_DIR = path.join(__dirname, '..', 'client');

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'pizza-delivery-local-secret';
const APP_NAME = 'Pizza Delivery';
const LOW_STOCK_ALERT_INTERVAL_MS = 1000 * 60 * 60;
const ORDER_STATUSES = ['Received', 'In the Kitchen', 'Sent for Delivery', 'Delivered'];
const SIZE_PRICES = {
  Small: 169,
  Medium: 229,
  Large: 299,
};

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(CLIENT_DIR));

const inventorySeed = {
  base: [
    { item: 'Classic', quantity: 60, price: 55, threshold: 12 },
    { item: 'Thin Crust', quantity: 48, price: 60, threshold: 10 },
    { item: 'Whole Wheat', quantity: 42, price: 64, threshold: 10 },
    { item: 'Cheese Burst', quantity: 32, price: 82, threshold: 8 },
    { item: 'Pan Crust', quantity: 36, price: 68, threshold: 8 },
  ],
  sauce: [
    { item: 'Tomato Blaze', quantity: 80, price: 18, threshold: 14 },
    { item: 'Garlic Cream', quantity: 36, price: 22, threshold: 8 },
    { item: 'Pesto Burst', quantity: 30, price: 26, threshold: 6 },
    { item: 'Smoky Arrabbiata', quantity: 28, price: 24, threshold: 6 },
    { item: 'Roasted Pepper Sauce', quantity: 26, price: 25, threshold: 6 },
  ],
  cheese: [
    { item: 'Mozzarella', quantity: 72, price: 34, threshold: 14 },
    { item: 'Cheddar', quantity: 44, price: 32, threshold: 10 },
    { item: 'Parmesan', quantity: 26, price: 38, threshold: 6 },
    { item: 'Feta', quantity: 20, price: 36, threshold: 6 },
    { item: 'Burrata', quantity: 14, price: 58, threshold: 4 },
  ],
  veggie: [
    { item: 'Basil', quantity: 60, price: 10, threshold: 12 },
    { item: 'Onion', quantity: 58, price: 10, threshold: 12 },
    { item: 'Corn', quantity: 54, price: 12, threshold: 10 },
    { item: 'Olives', quantity: 46, price: 14, threshold: 10 },
    { item: 'Mushroom', quantity: 42, price: 14, threshold: 8 },
    { item: 'Bell Pepper', quantity: 42, price: 12, threshold: 8 },
    { item: 'Jalapeno', quantity: 30, price: 11, threshold: 6 },
    { item: 'Spinach', quantity: 24, price: 11, threshold: 6 },
  ],
  meat: [
    { item: 'Pepperoni', quantity: 34, price: 28, threshold: 8 },
    { item: 'Chicken Sausage', quantity: 28, price: 26, threshold: 8 },
    { item: 'Smoked Chicken', quantity: 24, price: 28, threshold: 6 },
    { item: 'Bacon', quantity: 18, price: 34, threshold: 4 },
  ],
};

function buildIngredientList(recipe) {
  return [
    recipe.base,
    recipe.sauce,
    recipe.cheese,
    ...(recipe.veggies || []),
    ...(recipe.meats || []),
  ].filter(Boolean);
}

const pizzaSeed = [
  {
    slug: 'margherita-sunburst',
    name: 'Margherita Sunburst',
    description: 'Fresh mozzarella, basil ribbons, and slow-roasted tomato sauce.',
    category: 'Classic',
    isVegetarian: true,
    isFeatured: true,
    rating: 4.9,
    price: 249,
    image:
      'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80',
    recipe: {
      base: 'Classic',
      sauce: 'Tomato Blaze',
      cheese: 'Mozzarella',
      veggies: ['Basil'],
      meats: [],
    },
  },
  {
    slug: 'pepperoni-palette',
    name: 'Pepperoni Palette',
    description: 'A bold pepperoni pie finished with crushed chilli oil.',
    category: 'Special',
    isVegetarian: false,
    isFeatured: true,
    rating: 4.8,
    price: 329,
    image:
      'https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=1200&q=80',
    recipe: {
      base: 'Thin Crust',
      sauce: 'Tomato Blaze',
      cheese: 'Mozzarella',
      veggies: ['Jalapeno'],
      meats: ['Pepperoni'],
    },
  },
  {
    slug: 'veggie-monsoon',
    name: 'Veggie Monsoon',
    description: 'Bell pepper, onion, olives, corn, and herb-flecked cheese.',
    category: 'Veggie',
    isVegetarian: true,
    isFeatured: true,
    rating: 4.7,
    price: 289,
    image:
      'https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?auto=format&fit=crop&w=1200&q=80',
    recipe: {
      base: 'Whole Wheat',
      sauce: 'Pesto Burst',
      cheese: 'Mozzarella',
      veggies: ['Bell Pepper', 'Olives', 'Corn', 'Onion'],
      meats: [],
    },
  },
  {
    slug: 'smoky-farmhouse',
    name: 'Smoky Farmhouse',
    description: 'Paneer, mushroom, onion, and smoky tomato spread.',
    category: 'Special',
    isVegetarian: true,
    isFeatured: false,
    rating: 4.6,
    price: 319,
    image:
      'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=1200&q=80',
    recipe: {
      base: 'Pan Crust',
      sauce: 'Smoky Arrabbiata',
      cheese: 'Cheddar',
      veggies: ['Mushroom', 'Onion'],
      meats: [],
    },
  },
  {
    slug: 'garden-crunch',
    name: 'Garden Crunch',
    description: 'A lighter veggie pizza with zucchini, spinach, and feta.',
    category: 'Veggie',
    isVegetarian: true,
    isFeatured: false,
    rating: 4.5,
    price: 269,
    image:
      'https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?auto=format&fit=crop&w=1200&q=80',
    recipe: {
      base: 'Thin Crust',
      sauce: 'Garlic Cream',
      cheese: 'Feta',
      veggies: ['Spinach', 'Olives'],
      meats: [],
    },
  },
  {
    slug: 'double-cheese-volcano',
    name: 'Double Cheese Volcano',
    description: 'Mozzarella, cheddar, parmesan, and garlic butter edges.',
    category: 'Classic',
    isVegetarian: true,
    isFeatured: false,
    rating: 4.9,
    price: 339,
    image:
      'https://images.unsplash.com/photo-1541745537411-b8046dc6d66c?auto=format&fit=crop&w=1200&q=80',
    recipe: {
      base: 'Cheese Burst',
      sauce: 'Tomato Blaze',
      cheese: 'Mozzarella',
      veggies: [],
      meats: [],
    },
  },
];

const accountSeed = [
  {
    name: 'Pizza Delivery Admin',
    email: process.env.DEFAULT_ADMIN_EMAIL || 'admin@pizzadelivery.local',
    password: process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123',
    role: 'admin',
    isVerified: true,
    isApproved: true,
    permissions: ['orders', 'inventory', 'users'],
  },
  {
    name: 'Demo User',
    email: process.env.DEFAULT_USER_EMAIL || 'user@pizzadelivery.local',
    password: process.env.DEFAULT_USER_PASSWORD || 'User@12345',
    role: 'user',
    isVerified: true,
    isApproved: true,
    phoneNumber: '9999999999',
    address: 'Pizza Street',
  },
];

const pizzaSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, required: true },
    isVegetarian: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    rating: { type: Number, default: 4.5 },
    price: { type: Number, required: true },
    image: { type: String, required: true },
    ingredients: [{ type: String }],
    recipe: {
      base: { type: String, required: true },
      sauce: { type: String, required: true },
      cheese: { type: String, required: true },
      veggies: [{ type: String }],
      meats: [{ type: String }],
    },
  },
  { timestamps: true }
);

const inventorySchema = new mongoose.Schema(
  {
    category: { type: String, required: true },
    item: { type: String, required: true },
    quantity: { type: Number, required: true, default: 0 },
    price: { type: Number, required: true, default: 0 },
    threshold: { type: Number, required: true, default: 5 },
    lastAlertAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const accountSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    phoneNumber: { type: String, default: '' },
    address: { type: String, default: '' },
    isVerified: { type: Boolean, default: false },
    verificationCode: { type: String, default: null },
    verificationExpiresAt: { type: Date, default: null },
    resetPasswordCode: { type: String, default: null },
    resetPasswordExpiresAt: { type: Date, default: null },
    isApproved: { type: Boolean, default: true },
    permissions: [{ type: String }],
  },
  { timestamps: true }
);

const orderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'FornoRossoAccount', required: true },
    userSnapshot: {
      name: String,
      email: String,
    },
    items: [
      {
        id: String,
        slug: String,
        name: String,
        size: String,
        quantity: Number,
        price: Number,
        isCustom: Boolean,
        recipe: {
          base: String,
          sauce: String,
          cheese: String,
          veggies: [String],
          meats: [String],
        },
      },
    ],
    deliveryAddress: {
      phone: { type: String, required: true },
      address: { type: String, required: true },
      city: { type: String, required: true },
      postalCode: { type: String, required: true },
      country: { type: String, required: true },
    },
    notes: { type: String, default: '' },
    subtotal: { type: Number, required: true },
    salesTax: { type: Number, required: true },
    deliveryCharges: { type: Number, required: true },
    total: { type: Number, required: true },
    payment: {
      method: { type: String, required: true },
      status: { type: String, required: true },
      razorpayOrderId: { type: String, default: '' },
      razorpayPaymentId: { type: String, default: '' },
      razorpaySignature: { type: String, default: '' },
    },
    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: 'Received',
    },
    deliveredAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const Pizza = mongoose.models.FornoRossoPizza || mongoose.model('FornoRossoPizza', pizzaSchema);
const InventoryItem =
  mongoose.models.FornoRossoInventory || mongoose.model('FornoRossoInventory', inventorySchema);
const Account =
  mongoose.models.FornoRossoAccount || mongoose.model('FornoRossoAccount', accountSchema);
const Order = mongoose.models.FornoRossoOrder || mongoose.model('FornoRossoOrder', orderSchema);

let useDatabase = false;
const memoryStore = {
  accounts: [],
  pizzas: [],
  inventory: [],
  orders: [],
};

function createId() {
  return crypto.randomUUID();
}

function toPlain(value) {
  return value && typeof value.toObject === 'function' ? value.toObject() : value;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isEmailValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function createCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function pluralKey(category) {
  return {
    base: 'bases',
    sauce: 'sauces',
    cheese: 'cheeses',
    veggie: 'veggies',
    meat: 'meats',
  }[category];
}

function sanitizeAccount(account) {
  if (!account) {
    return null;
  }

  const safe = toPlain(account);
  return {
    _id: safe._id,
    name: safe.name,
    email: safe.email,
    role: safe.role,
    phoneNumber: safe.phoneNumber || '',
    address: safe.address || '',
    isVerified: Boolean(safe.isVerified),
    isApproved: Boolean(safe.isApproved),
    permissions: safe.permissions || [],
    createdAt: safe.createdAt || null,
  };
}

function buildAuthResponse(account, extra = {}) {
  const safe = sanitizeAccount(account);
  return {
    ...safe,
    token: jwt.sign({ id: safe._id, role: safe.role }, JWT_SECRET, {
      expiresIn: '7d',
    }),
    ...extra,
  };
}

function buildEmailHtml(title, greeting, body) {
  return `
    <div style="font-family:Arial,sans-serif;padding:24px;background:#f7efe3;color:#1f1c1a">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:18px;padding:32px;border:1px solid #f1dfca">
        <p style="margin:0 0 12px;color:#a2261d;font-weight:700;letter-spacing:0.06em;text-transform:uppercase">${APP_NAME}</p>
        <h1 style="margin:0 0 16px;font-size:28px;color:#1f1c1a">${title}</h1>
        <p style="margin:0 0 18px;line-height:1.7">${greeting}</p>
        <div style="line-height:1.8;color:#4d4844">${body}</div>
      </div>
    </div>
  `;
}

function getTransporter() {
  if (
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  ) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  if (process.env.SENDER_EMAIL && process.env.SENDER_PASSWORD) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SENDER_EMAIL,
        pass: process.env.SENDER_PASSWORD,
      },
    });
  }

  return null;
}

async function sendSystemEmail({ to, subject, title, greeting, body, code }) {
  const transporter = getTransporter();
  const html = buildEmailHtml(title, greeting, body);

  if (!transporter) {
    console.log(
      `[email-fallback] to=${to} subject="${subject}"${code ? ` code=${code}` : ''}`
    );
    return {
      delivered: false,
      mode: 'log',
      devCode: code || null,
    };
  }

  await transporter.sendMail({
    from: process.env.SENDER_EMAIL || process.env.SMTP_USER,
    to,
    subject,
    html,
  });

  return {
    delivered: true,
    mode: 'smtp',
    devCode: null,
  };
}

function calculateCustomPrice(recipe, size) {
  const veggieCount = Array.isArray(recipe.veggies) ? recipe.veggies.length : 0;
  const meatCount = Array.isArray(recipe.meats) ? recipe.meats.length : 0;
  return SIZE_PRICES[size] + veggieCount * 18 + meatCount * 24 + 36;
}

function calculateSummary(items) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const salesTax = Math.round(subtotal * 0.05);
  const deliveryCharges = subtotal >= 600 ? 0 : 49;
  return {
    subtotal,
    salesTax,
    deliveryCharges,
    total: subtotal + salesTax + deliveryCharges,
  };
}

function buildMemoryPizza(pizza) {
  return {
    _id: createId(),
    ...pizza,
    ingredients: buildIngredientList(pizza.recipe),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function buildMemoryInventoryItem(category, item) {
  return {
    _id: createId(),
    category,
    ...item,
    lastAlertAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function buildMemoryAccount(account) {
  return {
    _id: createId(),
    name: account.name,
    email: normalizeEmail(account.email),
    passwordHash: await bcrypt.hash(account.password, 10),
    role: account.role,
    phoneNumber: account.phoneNumber || '',
    address: account.address || '',
    isVerified: Boolean(account.isVerified),
    verificationCode: null,
    verificationExpiresAt: null,
    resetPasswordCode: null,
    resetPasswordExpiresAt: null,
    isApproved: Boolean(account.isApproved),
    permissions: account.permissions || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function seedMemoryStore() {
  memoryStore.pizzas = pizzaSeed.map((pizza) => buildMemoryPizza(pizza));
  memoryStore.inventory = Object.entries(inventorySeed).flatMap(([category, items]) =>
    items.map((item) => buildMemoryInventoryItem(category, item))
  );
  memoryStore.accounts = [];
  for (const account of accountSeed) {
    memoryStore.accounts.push(await buildMemoryAccount(account));
  }
  memoryStore.orders = [];
}

async function seedDatabase() {
  if ((await Pizza.countDocuments()) === 0) {
    await Pizza.insertMany(
      pizzaSeed.map((pizza) => ({
        ...pizza,
        ingredients: buildIngredientList(pizza.recipe),
      }))
    );
  }

  if ((await InventoryItem.countDocuments()) === 0) {
    await InventoryItem.insertMany(
      Object.entries(inventorySeed).flatMap(([category, items]) =>
        items.map((item) => ({
          category,
          ...item,
        }))
      )
    );
  }

  if ((await Account.countDocuments()) === 0) {
    const records = [];
    for (const account of accountSeed) {
      records.push({
        name: account.name,
        email: normalizeEmail(account.email),
        passwordHash: await bcrypt.hash(account.password, 10),
        role: account.role,
        phoneNumber: account.phoneNumber || '',
        address: account.address || '',
        isVerified: Boolean(account.isVerified),
        verificationCode: null,
        verificationExpiresAt: null,
        resetPasswordCode: null,
        resetPasswordExpiresAt: null,
        isApproved: Boolean(account.isApproved),
        permissions: account.permissions || [],
      });
    }

    await Account.insertMany(records);
  }
}

async function initializeStore() {
  if (!process.env.MONGO_URI) {
    await seedMemoryStore();
    console.log('MongoDB not configured. Using in-memory data.');
    return;
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    useDatabase = true;
    await seedDatabase();
    console.log('MongoDB connected. Using persistent data.');
  } catch (error) {
    useDatabase = false;
    await seedMemoryStore();
    console.log(`MongoDB connection failed. Falling back to in-memory data. ${error.message}`);
  }
}

async function getAllPizzas() {
  if (useDatabase) {
    return Pizza.find().sort({ createdAt: 1 }).lean();
  }
  return memoryStore.pizzas;
}

async function getPizzaBySlug(slug) {
  if (useDatabase) {
    return Pizza.findOne({ slug }).lean();
  }
  return memoryStore.pizzas.find((pizza) => pizza.slug === slug) || null;
}

async function getAllInventory() {
  if (useDatabase) {
    return InventoryItem.find().sort({ category: 1, item: 1 });
  }
  return memoryStore.inventory;
}

function groupInventory(items) {
  return items.reduce(
    (grouped, item) => {
      const plain = toPlain(item);
      grouped[pluralKey(plain.category)].push(plain);
      return grouped;
    },
    {
      bases: [],
      sauces: [],
      cheeses: [],
      veggies: [],
      meats: [],
    }
  );
}

async function findInventoryItemById(id) {
  if (useDatabase) {
    return InventoryItem.findById(id);
  }
  return memoryStore.inventory.find((item) => item._id === id) || null;
}

async function findInventoryItem(category, itemName) {
  if (useDatabase) {
    return InventoryItem.findOne({ category, item: itemName });
  }
  return (
    memoryStore.inventory.find(
      (item) => item.category === category && item.item === itemName
    ) || null
  );
}

async function listAccounts(role) {
  if (useDatabase) {
    return Account.find(role ? { role } : {}).sort({ createdAt: -1 });
  }
  return [...memoryStore.accounts]
    .filter((account) => (role ? account.role === role : true))
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
}

async function findAccountByEmail(email) {
  const normalized = normalizeEmail(email);
  if (useDatabase) {
    return Account.findOne({ email: normalized });
  }
  return memoryStore.accounts.find((account) => account.email === normalized) || null;
}

async function findAccountById(id) {
  if (useDatabase) {
    return Account.findById(id);
  }
  return memoryStore.accounts.find((account) => account._id === id) || null;
}

async function createAccountRecord(payload) {
  const record = {
    name: payload.name,
    email: normalizeEmail(payload.email),
    passwordHash: payload.passwordHash,
    role: payload.role,
    phoneNumber: payload.phoneNumber || '',
    address: payload.address || '',
    isVerified: Boolean(payload.isVerified),
    verificationCode: payload.verificationCode || null,
    verificationExpiresAt: payload.verificationExpiresAt || null,
    resetPasswordCode: null,
    resetPasswordExpiresAt: null,
    isApproved: Boolean(payload.isApproved),
    permissions: payload.permissions || [],
  };

  if (useDatabase) {
    return Account.create(record);
  }

  const memoryRecord = {
    _id: createId(),
    ...record,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  memoryStore.accounts.push(memoryRecord);
  return memoryRecord;
}

function buildOrderEmailBody(order) {
  return `
    <p>Your order has been placed successfully.</p>
    <p><b>Order ID:</b> ${order._id}</p>
    <p><b>Status:</b> ${order.status}</p>
    <p><b>Total:</b> INR ${order.total}</p>
  `;
}

async function sendOrderConfirmationEmail(order) {
  const account = await findAccountById(order.userId);
  if (!account) {
    return;
  }

  await sendSystemEmail({
    to: account.email,
    subject: `${APP_NAME} Order Confirmation`,
    title: 'Order Confirmed',
    greeting: `Hi ${account.name},`,
    body: buildOrderEmailBody(order),
  });
}

async function sendOrderStatusEmail(order) {
  const account = await findAccountById(order.userId);
  if (!account) {
    return;
  }

  await sendSystemEmail({
    to: account.email,
    subject: `${APP_NAME} Order Update`,
    title: 'Order Status Updated',
    greeting: `Hi ${account.name},`,
    body: `<p>Your order <b>${order._id}</b> is now <b>${order.status}</b>.</p>`,
  });
}

async function scanLowStockInventory() {
  const inventoryItems = await getAllInventory();
  const now = Date.now();
  const lowItems = [];

  for (const item of inventoryItems) {
    const plain = toPlain(item);
    const lastAlertAt = plain.lastAlertAt ? new Date(plain.lastAlertAt).getTime() : 0;
    if (plain.quantity <= plain.threshold && now - lastAlertAt >= LOW_STOCK_ALERT_INTERVAL_MS) {
      lowItems.push(plain);

      if (useDatabase && item.save) {
        item.lastAlertAt = new Date(now);
        await item.save();
      } else {
        item.lastAlertAt = new Date(now).toISOString();
      }
    }
  }

  if (lowItems.length === 0) {
    return;
  }

  const adminAccounts = await listAccounts('admin');
  const recipients = adminAccounts.map((admin) => toPlain(admin).email).filter(Boolean);

  if (recipients.length === 0) {
    console.log('[low-stock-fallback]', lowItems.map((item) => item.item).join(', '));
    return;
  }

  const body = `
    <p>The following stock items are at or below their threshold:</p>
    <ul>
      ${lowItems
        .map(
          (item) =>
            `<li>${item.item} (${item.category}) - quantity: ${item.quantity}, threshold: ${item.threshold}</li>`
        )
        .join('')}
    </ul>
  `;

  await sendSystemEmail({
    to: recipients.join(','),
    subject: `${APP_NAME} Low Stock Alert`,
    title: 'Inventory Alert',
    greeting: 'Team,',
    body,
  });
}

function normalizeRecipe(recipe) {
  return {
    base: String(recipe.base || '').trim(),
    sauce: String(recipe.sauce || '').trim(),
    cheese: String(recipe.cheese || '').trim(),
    veggies: Array.isArray(recipe.veggies)
      ? recipe.veggies.map((item) => String(item).trim()).filter(Boolean)
      : [],
    meats: Array.isArray(recipe.meats)
      ? recipe.meats.map((item) => String(item).trim()).filter(Boolean)
      : [],
  };
}

async function buildSafeOrderItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Add at least one pizza before checkout.');
  }

  const safeItems = [];

  for (const rawItem of items) {
    const quantity = Math.max(1, Number(rawItem.quantity || rawItem.qty || 1));
    const size = ['Small', 'Medium', 'Large'].includes(rawItem.size) ? rawItem.size : 'Medium';

    if (rawItem.slug) {
      const pizza = await getPizzaBySlug(String(rawItem.slug));
      if (!pizza) {
        throw new Error('One of the pizzas in your cart is no longer available.');
      }

      safeItems.push({
        id: rawItem.id || rawItem.slug,
        slug: pizza.slug,
        name: pizza.name,
        size,
        quantity,
        price: Number(pizza.price),
        isCustom: false,
        recipe: normalizeRecipe(pizza.recipe),
      });
      continue;
    }

    if (!rawItem.recipe) {
      throw new Error('Custom pizza data is incomplete.');
    }

    const recipe = normalizeRecipe(rawItem.recipe);
    if (!recipe.base || !recipe.sauce || !recipe.cheese) {
      throw new Error('Custom pizza requires a base, sauce, and cheese.');
    }

    safeItems.push({
      id: rawItem.id || createId(),
      slug: '',
      name: String(rawItem.name || 'House Special').trim(),
      size,
      quantity,
      price: calculateCustomPrice(recipe, size),
      isCustom: true,
      recipe,
    });
  }

  return safeItems;
}

async function updateInventoryQuantity(category, itemName, quantityChange) {
  const inventoryItem = await findInventoryItem(category, itemName);
  if (!inventoryItem) {
    throw new Error(`${itemName} is unavailable in inventory.`);
  }

  const currentQuantity = Number(toPlain(inventoryItem).quantity || 0);
  if (currentQuantity + quantityChange < 0) {
    throw new Error(`${itemName} is out of stock. Please update inventory.`);
  }

  if (useDatabase && inventoryItem.save) {
    inventoryItem.quantity = currentQuantity + quantityChange;
    await inventoryItem.save();
    return inventoryItem;
  }

  inventoryItem.quantity = currentQuantity + quantityChange;
  inventoryItem.updatedAt = new Date().toISOString();
  return inventoryItem;
}

async function deductInventoryForItems(items) {
  for (const item of items) {
    const recipe = normalizeRecipe(item.recipe || {});
    const quantity = item.quantity;

    await updateInventoryQuantity('base', recipe.base, -quantity);
    await updateInventoryQuantity('sauce', recipe.sauce, -quantity);
    await updateInventoryQuantity('cheese', recipe.cheese, -quantity);

    for (const veggie of recipe.veggies) {
      await updateInventoryQuantity('veggie', veggie, -quantity);
    }

    for (const meat of recipe.meats) {
      await updateInventoryQuantity('meat', meat, -quantity);
    }
  }

  await scanLowStockInventory();
}

function validateDeliveryAddress(deliveryAddress) {
  return (
    deliveryAddress &&
    deliveryAddress.phone &&
    deliveryAddress.address &&
    deliveryAddress.city &&
    deliveryAddress.postalCode &&
    deliveryAddress.country
  );
}

function verifyRazorpaySignature(payment) {
  if (!process.env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay secret key is missing on the server.');
  }

  const body = `${payment.razorpayOrderId}|${payment.razorpayPaymentId}`;
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');

  return expected === payment.razorpaySignature;
}

async function createOrderRecord(payload) {
  if (useDatabase) {
    return Order.create(payload);
  }

  const memoryOrder = {
    _id: createId(),
    ...payload,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  memoryStore.orders.push(memoryOrder);
  return memoryOrder;
}

async function listOrdersForAccount(accountId) {
  if (useDatabase) {
    return Order.find({ userId: accountId }).sort({ createdAt: -1 }).lean();
  }

  return memoryStore.orders
    .filter((order) => order.userId === accountId)
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
}

async function listAllOrders() {
  if (useDatabase) {
    return Order.find({}).sort({ createdAt: -1 }).lean();
  }

  return [...memoryStore.orders].sort(
    (left, right) => new Date(right.createdAt) - new Date(left.createdAt)
  );
}

async function findOrderById(id) {
  if (useDatabase) {
    return Order.findById(id);
  }
  return memoryStore.orders.find((order) => order._id === id) || null;
}

async function protect(req, res, next) {
  try {
    const authorization = req.headers.authorization || '';
    if (!authorization.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Not authorized. Missing token.' });
    }

    const token = authorization.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const account = await findAccountById(decoded.id);

    if (!account) {
      return res.status(401).json({ message: 'Not authorized. Invalid token.' });
    }

    req.account = account;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Not authorized. Token failed.' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.account || toPlain(req.account).role !== role) {
      return res.status(403).json({ message: 'You do not have access to this action.' });
    }
    return next();
  };
}

async function handleRegister(req, res, role) {
  try {
    const {
      name,
      email,
      password,
      confirmPassword,
      phoneNumber = '',
      address = '',
      inviteCode = '',
    } = req.body;

    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).json({ message: 'All required fields must be filled.' });
    }

    if (!isEmailValid(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
    }

    const existingAccount = await findAccountByEmail(email);
    if (existingAccount) {
      return res.status(400).json({ message: 'An account with this email already exists.' });
    }

    const admins = await listAccounts('admin');
    const inviteRequired =
      role === 'admin' &&
      admins.length > 0 &&
      process.env.ADMIN_INVITE_CODE &&
      inviteCode !== process.env.ADMIN_INVITE_CODE;

    if (inviteRequired) {
      return res.status(400).json({ message: 'Invalid admin invite code.' });
    }

    const verificationCode = createCode();
    const verificationExpiresAt = new Date(Date.now() + 1000 * 60 * 10);
    const passwordHash = await bcrypt.hash(password, 10);
    const account = await createAccountRecord({
      name: String(name).trim(),
      email,
      passwordHash,
      role,
      phoneNumber: String(phoneNumber).trim(),
      address: String(address).trim(),
      isVerified: false,
      verificationCode,
      verificationExpiresAt,
      isApproved: role === 'admin' ? true : true,
      permissions: role === 'admin' ? ['orders', 'inventory', 'users'] : [],
    });

    const emailResult = await sendSystemEmail({
      to: normalizeEmail(email),
      subject: `${APP_NAME} verification code`,
      title: 'Verify your account',
      greeting: `Hi ${String(name).trim()},`,
      body: `<p>Your verification code is <b>${verificationCode}</b>. It expires in 10 minutes.</p>`,
      code: verificationCode,
    });

    return res.status(201).json(
      buildAuthResponse(account, {
        message:
          role === 'admin'
            ? 'Admin account created. Verify your email to continue.'
            : 'User account created. Verify your email to continue.',
        devCode: emailResult.devCode,
      })
    );
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Unable to register right now.' });
  }
}

async function handleLogin(req, res, role) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const account = await findAccountByEmail(email);
    if (!account || toPlain(account).role !== role) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const passwordMatches = await bcrypt.compare(password, toPlain(account).passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    if (role === 'admin' && !toPlain(account).isApproved) {
      return res.status(403).json({ message: 'This admin account is not approved yet.' });
    }

    return res.status(200).json(
      buildAuthResponse(account, {
        message: role === 'admin' ? 'Admin login successful.' : 'User login successful.',
      })
    );
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Unable to log in right now.' });
  }
}

async function handleVerify(req, res, role) {
  try {
    const { email, code } = req.body;
    const account = await findAccountByEmail(email);

    if (!account || toPlain(account).role !== role) {
      return res.status(400).json({ message: 'Invalid email address.' });
    }

    const accountData = toPlain(account);
    if (accountData.verificationCode !== String(code || '').trim()) {
      return res.status(400).json({ message: 'Invalid verification code.' });
    }

    if (!accountData.verificationExpiresAt || new Date(accountData.verificationExpiresAt) < new Date()) {
      return res.status(400).json({ message: 'This verification code has expired.' });
    }

    account.isVerified = true;
    account.verificationCode = null;
    account.verificationExpiresAt = null;

    if (useDatabase && account.save) {
      await account.save();
    } else {
      account.updatedAt = new Date().toISOString();
    }

    return res.status(200).json(
      buildAuthResponse(account, {
        message: 'Account verified successfully.',
      })
    );
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Verification failed.' });
  }
}

async function handleForgotPassword(req, res, role) {
  try {
    const { email } = req.body;
    const account = await findAccountByEmail(email);

    if (!account || toPlain(account).role !== role) {
      return res.status(400).json({ message: 'Invalid email address.' });
    }

    const resetPasswordCode = createCode();
    const resetPasswordExpiresAt = new Date(Date.now() + 1000 * 60 * 10);

    account.resetPasswordCode = resetPasswordCode;
    account.resetPasswordExpiresAt = resetPasswordExpiresAt;

    if (useDatabase && account.save) {
      await account.save();
    } else {
      account.updatedAt = new Date().toISOString();
    }

    const emailResult = await sendSystemEmail({
      to: normalizeEmail(email),
      subject: `${APP_NAME} password reset`,
      title: 'Reset your password',
      greeting: `Hi ${toPlain(account).name},`,
      body: `<p>Your reset code is <b>${resetPasswordCode}</b>. It expires in 10 minutes.</p>`,
      code: resetPasswordCode,
    });

    return res.status(200).json({
      message: 'Password reset code sent successfully.',
      devCode: emailResult.devCode,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Unable to send reset code.' });
  }
}

async function handleResetPassword(req, res, role) {
  try {
    const { email, code, newPassword, confirmPassword } = req.body;
    const account = await findAccountByEmail(email);

    if (!account || toPlain(account).role !== role) {
      return res.status(400).json({ message: 'Invalid email address.' });
    }

    if (!code || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: 'All reset fields are required.' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
    }

    const accountData = toPlain(account);
    if (accountData.resetPasswordCode !== String(code).trim()) {
      return res.status(400).json({ message: 'Invalid reset code.' });
    }

    if (!accountData.resetPasswordExpiresAt || new Date(accountData.resetPasswordExpiresAt) < new Date()) {
      return res.status(400).json({ message: 'This reset code has expired.' });
    }

    account.passwordHash = await bcrypt.hash(newPassword, 10);
    account.resetPasswordCode = null;
    account.resetPasswordExpiresAt = null;

    if (useDatabase && account.save) {
      await account.save();
    } else {
      account.updatedAt = new Date().toISOString();
    }

    return res.status(200).json(
      buildAuthResponse(account, {
        message: 'Password reset successful.',
      })
    );
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Unable to reset password.' });
  }
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    mode: useDatabase ? 'mongodb' : 'memory',
    razorpayEnabled: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    emailMode: getTransporter() ? 'smtp' : 'log',
  });
});

app.get('/api/config', (_req, res) => {
  res.json({
    appName: APP_NAME,
    razorpayEnabled: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
    emailMode: getTransporter() ? 'smtp' : 'log',
  });
});

app.get('/api/pizzas', async (_req, res) => {
  try {
    const pizzas = await getAllPizzas();
    return res.json(pizzas);
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load pizzas right now.' });
  }
});

app.get('/api/builder-options', async (_req, res) => {
  try {
    const grouped = groupInventory(await getAllInventory());
    return res.json({
      base: grouped.bases.map((item) => item.item),
      sauce: grouped.sauces.map((item) => item.item),
      cheese: grouped.cheeses.map((item) => item.item),
      veggies: grouped.veggies.map((item) => item.item),
      meats: grouped.meats.map((item) => item.item),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load builder options.' });
  }
});

app.post('/api/users/register', (req, res) => handleRegister(req, res, 'user'));
app.post('/api/users/login', (req, res) => handleLogin(req, res, 'user'));
app.post('/api/users/verify', (req, res) => handleVerify(req, res, 'user'));
app.post('/api/users/forgot-password', (req, res) => handleForgotPassword(req, res, 'user'));
app.post('/api/users/reset-password', (req, res) => handleResetPassword(req, res, 'user'));

app.post('/api/admin/register', (req, res) => handleRegister(req, res, 'admin'));
app.post('/api/admin/login', (req, res) => handleLogin(req, res, 'admin'));
app.post('/api/admin/verify', (req, res) => handleVerify(req, res, 'admin'));
app.post('/api/admin/forgot-password', (req, res) => handleForgotPassword(req, res, 'admin'));
app.post('/api/admin/reset-password', (req, res) => handleResetPassword(req, res, 'admin'));

app.get('/api/auth/me', protect, async (req, res) => {
  return res.json({
    account: sanitizeAccount(req.account),
  });
});

app.get('/api/users/orders', protect, requireRole('user'), async (req, res) => {
  const orders = await listOrdersForAccount(toPlain(req.account)._id);
  return res.json(orders);
});

app.post('/api/orders/checkout', protect, requireRole('user'), async (req, res) => {
  try {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(400).json({ message: 'Razorpay is not configured on this server.' });
    }

    const safeItems = await buildSafeOrderItems(req.body.items || []);
    const summary = calculateSummary(safeItems);
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const order = await razorpay.orders.create({
      amount: summary.total * 100,
      currency: 'INR',
      receipt: `forno-${createId()}`,
    });

    return res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      summary,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Unable to start Razorpay checkout.' });
  }
});

app.post('/api/orders', protect, requireRole('user'), async (req, res) => {
  try {
    const { items = [], deliveryAddress = {}, notes = '', payment = {} } = req.body;
    const account = toPlain(req.account);

    if (!account.isVerified) {
      return res.status(403).json({ message: 'Verify your account before placing an order.' });
    }

    if (!validateDeliveryAddress(deliveryAddress)) {
      return res.status(400).json({ message: 'Complete all delivery address fields.' });
    }

    const safeItems = await buildSafeOrderItems(items);
    const summary = calculateSummary(safeItems);
    const paymentMethod = payment.method === 'razorpay' ? 'razorpay' : 'cod';
    const paymentStatus = paymentMethod === 'razorpay' ? 'paid' : 'pending';

    if (paymentMethod === 'razorpay') {
      if (
        !payment.razorpayOrderId ||
        !payment.razorpayPaymentId ||
        !payment.razorpaySignature
      ) {
        return res.status(400).json({ message: 'Razorpay payment details are incomplete.' });
      }

      const isValid = verifyRazorpaySignature(payment);
      if (!isValid) {
        return res.status(400).json({ message: 'Razorpay payment verification failed.' });
      }
    }

    await deductInventoryForItems(safeItems);

    const orderPayload = {
      userId: account._id,
      userSnapshot: {
        name: account.name,
        email: account.email,
      },
      items: safeItems,
      deliveryAddress: {
        phone: String(deliveryAddress.phone).trim(),
        address: String(deliveryAddress.address).trim(),
        city: String(deliveryAddress.city).trim(),
        postalCode: String(deliveryAddress.postalCode).trim(),
        country: String(deliveryAddress.country).trim(),
      },
      notes: String(notes || '').trim(),
      subtotal: summary.subtotal,
      salesTax: summary.salesTax,
      deliveryCharges: summary.deliveryCharges,
      total: summary.total,
      payment: {
        method: paymentMethod,
        status: paymentStatus,
        razorpayOrderId: payment.razorpayOrderId || '',
        razorpayPaymentId: payment.razorpayPaymentId || '',
        razorpaySignature: payment.razorpaySignature || '',
      },
      status: 'Received',
      deliveredAt: null,
    };

    const order = await createOrderRecord(orderPayload);
    await sendOrderConfirmationEmail(toPlain(order));

    return res.status(201).json({
      message: 'Order placed successfully.',
      order: toPlain(order),
      summary,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Unable to place the order.' });
  }
});

app.get('/api/orders/my', protect, requireRole('user'), async (req, res) => {
  try {
    const orders = await listOrdersForAccount(toPlain(req.account)._id);
    return res.json(orders);
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load your orders.' });
  }
});

app.get('/api/admin/dashboard', protect, requireRole('admin'), async (_req, res) => {
  try {
    const [orders, users, admins, inventory] = await Promise.all([
      listAllOrders(),
      listAccounts('user'),
      listAccounts('admin'),
      getAllInventory(),
    ]);

    const grouped = groupInventory(inventory);
    const lowStockCount = inventory.filter(
      (item) => Number(toPlain(item).quantity) <= Number(toPlain(item).threshold)
    ).length;

    return res.json({
      stats: {
        totalOrders: orders.length,
        totalUsers: users.length,
        totalAdmins: admins.length,
        lowStockCount,
      },
      orders,
      users: users.map((user) => sanitizeAccount(user)),
      admins: admins.map((admin) => sanitizeAccount(admin)),
      inventory: grouped,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load the admin dashboard.' });
  }
});

app.get('/api/admin/orders', protect, requireRole('admin'), async (_req, res) => {
  try {
    return res.json(await listAllOrders());
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load orders.' });
  }
});

app.put('/api/admin/orders/:id/status', protect, requireRole('admin'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Invalid order status.' });
    }

    const order = await findOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found.' });
    }

    order.status = status;
    order.deliveredAt = status === 'Delivered' ? new Date() : null;

    if (useDatabase && order.save) {
      await order.save();
    } else {
      order.updatedAt = new Date().toISOString();
    }

    await sendOrderStatusEmail(toPlain(order));

    return res.json({
      message: 'Order status updated successfully.',
      order: toPlain(order),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to update order status.' });
  }
});

app.get('/api/admin/inventory', protect, requireRole('admin'), async (_req, res) => {
  try {
    return res.json(groupInventory(await getAllInventory()));
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load inventory.' });
  }
});

app.post('/api/admin/inventory', protect, requireRole('admin'), async (req, res) => {
  try {
    const { category, item, quantity, price, threshold } = req.body;

    if (!pluralKey(category)) {
      return res.status(400).json({ message: 'Invalid inventory category.' });
    }

    if (!item) {
      return res.status(400).json({ message: 'Inventory item name is required.' });
    }

    const existing = await findInventoryItem(category, String(item).trim());
    if (existing) {
      return res.status(400).json({ message: 'This inventory item already exists.' });
    }

    const payload = {
      category,
      item: String(item).trim(),
      quantity: Number(quantity || 0),
      price: Number(price || 0),
      threshold: Number(threshold || 5),
      lastAlertAt: null,
    };

    let created;
    if (useDatabase) {
      created = await InventoryItem.create(payload);
    } else {
      created = {
        _id: createId(),
        ...payload,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      memoryStore.inventory.push(created);
    }

    return res.status(201).json({
      message: 'Inventory item created successfully.',
      item: toPlain(created),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to create inventory item.' });
  }
});

app.put('/api/admin/inventory/:id', protect, requireRole('admin'), async (req, res) => {
  try {
    const inventoryItem = await findInventoryItemById(req.params.id);
    if (!inventoryItem) {
      return res.status(404).json({ message: 'Inventory item not found.' });
    }

    inventoryItem.item = String(req.body.item || toPlain(inventoryItem).item).trim();
    inventoryItem.quantity = Number(
      req.body.quantity !== undefined ? req.body.quantity : toPlain(inventoryItem).quantity
    );
    inventoryItem.price = Number(
      req.body.price !== undefined ? req.body.price : toPlain(inventoryItem).price
    );
    inventoryItem.threshold = Number(
      req.body.threshold !== undefined ? req.body.threshold : toPlain(inventoryItem).threshold
    );

    if (useDatabase && inventoryItem.save) {
      await inventoryItem.save();
    } else {
      inventoryItem.updatedAt = new Date().toISOString();
    }

    return res.json({
      message: 'Inventory item updated successfully.',
      item: toPlain(inventoryItem),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to update inventory item.' });
  }
});

app.get('/api/admin/accounts', protect, requireRole('admin'), async (_req, res) => {
  try {
    const accounts = await listAccounts();
    return res.json(accounts.map((account) => sanitizeAccount(account)));
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load accounts.' });
  }
});

app.put('/api/admin/accounts/:id', protect, requireRole('admin'), async (req, res) => {
  try {
    const account = await findAccountById(req.params.id);
    if (!account) {
      return res.status(404).json({ message: 'Account not found.' });
    }

    if (req.body.isApproved !== undefined) {
      account.isApproved = Boolean(req.body.isApproved);
    }

    if (req.body.role && ['user', 'admin'].includes(req.body.role)) {
      account.role = req.body.role;
    }

    if (useDatabase && account.save) {
      await account.save();
    } else {
      account.updatedAt = new Date().toISOString();
    }

    return res.json({
      message: 'Account updated successfully.',
      account: sanitizeAccount(account),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to update account.' });
  }
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  return res.sendFile(path.join(CLIENT_DIR, 'index.html'));
});

initializeStore()
  .then(() => {
    setInterval(() => {
      scanLowStockInventory().catch((error) => {
        console.error('Low stock scan failed:', error.message);
      });
    }, 1000 * 60 * 5).unref();

    app.listen(PORT, () => {
      console.log(`${APP_NAME} running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Unable to initialize the app:', error);
    process.exit(1);
  });
