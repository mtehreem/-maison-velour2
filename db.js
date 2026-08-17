// Maison Velour — local SQLite database layer (Node 24 node:sqlite, zero dependencies)
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, 'maison-velour.db');
const db = new DatabaseSync(DB_PATH);

// Enable foreign keys
db.exec('PRAGMA foreign_keys = ON');

// ---- Schema ----
db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  cat TEXT NOT NULL,
  price REAL NOT NULL,
  was REAL DEFAULT 0,
  art1 TEXT DEFAULT '#fff',
  art2 TEXT DEFAULT '#000',
  glyph TEXT DEFAULT '✦',
  badge TEXT DEFAULT '',
  image TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  pass TEXT NOT NULL,
  phone TEXT DEFAULT '',
  is_admin INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS cart_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_token TEXT NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  num TEXT UNIQUE NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  total REAL NOT NULL,
  items INTEGER NOT NULL,
  status TEXT DEFAULT 'In transit 🚚',
  ship_name TEXT DEFAULT '',
  ship_phone TEXT DEFAULT '',
  ship_address TEXT DEFAULT '',
  ship_city TEXT DEFAULT '',
  ship_country TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  qty INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS wishlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_token TEXT NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id)
);
`);

// ---- Migrations (add columns to existing databases) ----
(function migrate(){
  const userCols = db.prepare(`PRAGMA table_info(users)`).all().map(c => c.name);
  if(!userCols.includes('is_admin')) db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0');
  const orderCols = db.prepare(`PRAGMA table_info(orders)`).all().map(c => c.name);
  if(!orderCols.includes('status')) db.exec(`ALTER TABLE orders ADD COLUMN status TEXT DEFAULT 'In transit 🚚'`);
  if(!orderCols.includes('ship_name')) db.exec(`ALTER TABLE orders ADD COLUMN ship_name TEXT DEFAULT ''`);
  if(!orderCols.includes('ship_phone')) db.exec(`ALTER TABLE orders ADD COLUMN ship_phone TEXT DEFAULT ''`);
  if(!orderCols.includes('ship_address')) db.exec(`ALTER TABLE orders ADD COLUMN ship_address TEXT DEFAULT ''`);
  if(!orderCols.includes('ship_city')) db.exec(`ALTER TABLE orders ADD COLUMN ship_city TEXT DEFAULT ''`);
  if(!orderCols.includes('ship_country')) db.exec(`ALTER TABLE orders ADD COLUMN ship_country TEXT DEFAULT ''`);
  const prodCols = db.prepare(`PRAGMA table_info(products)`).all().map(c => c.name);
  if(!prodCols.includes('image')) db.exec(`ALTER TABLE products ADD COLUMN image TEXT DEFAULT ''`);
})();

// ---- Seed products (kept in sync with the frontend PRODUCTS array) ----
function seedProducts(){
  const count = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
  if(count > 0) return;
  const ins = db.prepare(`INSERT INTO products (id, name, cat, price, was, art1, art2, glyph, badge, image) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const rows = [
    /* Skincare (10) */
    [1,  'Velour Silk Serum',              'Skincare',    78,  98,  '#e9dcf0','#b79ac4','💧','Best Seller','https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600&q=80&auto=format&fit=crop'],
    [2,  '24K Radiance Cream',             'Skincare',    132, 0,   '#f3d9e8','#c98aa8','✨','New','https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&q=80&auto=format&fit=crop'],
    [3,  'Caviar Retinol Night Elixir',    'Skincare',    165, 190, '#33102c','#6b2a5e','🌙','Bestseller','https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=600&q=80&auto=format&fit=crop'],
    [4,  'Rose Quartz Dew Mist',           'Skincare',    42,  0,   '#f6e3ec','#d9a7c0','🌸','','https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?w=600&q=80&auto=format&fit=crop'],
    [13, 'Hyaluronic Dew Serum',           'Skincare',    62,  0,   '#dff3f4','#8fc7cd','💦','New','https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600&q=80&auto=format&fit=crop'],
    [14, 'Vitamin C Glow Booster',         'Skincare',    55,  0,   '#fdeee0','#e8a86e','🍊','','https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=600&q=80&auto=format&fit=crop'],
    [15, 'Velvet Clay Purifying Mask',     'Skincare',    48,  58,  '#e8e0d8','#a9978a','🌿','','https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600&q=80&auto=format&fit=crop'],
    [16, 'Peptide Repair Eye Cream',       'Skincare',    74,  0,   '#f0e8f2','#c7a3cc','👁','','https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&q=80&auto=format&fit=crop'],
    [17, 'Squalane Hydra Oil',             'Skincare',    58,  0,   '#fdf3e3','#e0c184','🌾','','https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=600&q=80&auto=format&fit=crop'],
    [18, 'Cloud Barrier Balm',             'Skincare',    52,  0,   '#eef2ff','#b8c3ee','☁️','','https://images.unsplash.com/photo-1612817288484-6f916006741a?w=600&q=80&auto=format&fit=crop'],

    /* Makeup (10) */
    [5,  'Velvet Matte Foundation',        'Makeup',      58,  0,   '#e3c9a6','#b98a6f','🎨','40 Shades','https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&q=80&auto=format&fit=crop'],
    [6,  'Couture Silk Lipstick',          'Makeup',      38,  0,   '#c98aa8','#7d3a56','💄','Icon','https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=600&q=80&auto=format&fit=crop'],
    [7,  'Velour Lash Extending Mascara',  'Makeup',      32,  0,   '#33102c','#4a1a3f','🖤','','https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=600&q=80&auto=format&fit=crop'],
    [8,  'Gilded Rose Eyeshadow Palette',  'Makeup',      68,  82,  '#f4ead6','#c9a876','👁','Limited','https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=600&q=80&auto=format&fit=crop'],
    [19, 'Velour Sculpt Blush Duo',        'Makeup',      44,  0,   '#fbe3e3','#e69a9a','🌸','','https://images.unsplash.com/photo-1596704017254-9b121068fb31?w=600&q=80&auto=format&fit=crop'],
    [20, 'Silk Cushion Concealer',         'Makeup',      36,  0,   '#f7e8d8','#d3a878','✨','','https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=600&q=80&auto=format&fit=crop'],
    [21, 'Gilded Bronze Powder',           'Makeup',      42,  0,   '#f2dfc4','#c99b62','☀️','','https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&q=80&auto=format&fit=crop'],
    [22, 'Noir Precision Eyeliner',        'Makeup',      28,  0,   '#e6e0f0','#9d8fc4','🖤','','https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&q=80&auto=format&fit=crop'],
    [23, 'Velour Glass Lip Gloss',         'Makeup',      26,  0,   '#fde8ee','#f0a8c0','💎','','https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=600&q=80&auto=format&fit=crop'],
    [24, 'Pearl Highlighter Wand',         'Makeup',      39,  0,   '#f3ebff','#c7aef2','✨','','https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=600&q=80&auto=format&fit=crop'],

    /* Fragrance (10) */
    [9,  'Eau de Velour',                  'Fragrance',   145, 0,   '#d9c4e6','#7d5a8f','🧴','Signature','https://images.unsplash.com/photo-1541643600914-78b084683601?w=600&q=80&auto=format&fit=crop'],
    [10, 'Ambre Nuit Parfum Intense',      'Fragrance',   189, 220, '#4a1a3f','#1a0f1e','🌃','','https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=600&q=80&auto=format&fit=crop'],
    [25, 'Velour Rose Eau de Parfum',      'Fragrance',   128, 0,   '#f9e3e8','#d99aab','🌹','New','https://images.unsplash.com/photo-1587017539504-67cfbddac569?w=600&q=80&auto=format&fit=crop'],
    [26, 'Noir Ambre Extrait',             'Fragrance',   210, 0,   '#1f1b24','#4e3b5c','🌑','Limited','https://images.unsplash.com/photo-1615634260167-c8cdede054de?w=600&q=80&auto=format&fit=crop'],
    [27, 'Citrus Vetiver Cologne',         'Fragrance',   98,  0,   '#e8f0d8','#9db47a','🍋','','https://images.unsplash.com/photo-1563170351-be82bc888aa4?w=600&q=80&auto=format&fit=crop'],
    [28, 'White Musk Eau de Toilette',     'Fragrance',   112, 0,   '#f0f0f5','#b4b4c8','🤍','','https://images.unsplash.com/photo-1594035910387-fea47794261f?w=600&q=80&auto=format&fit=crop'],
    [29, 'Jasmine Petal Parfum',           'Fragrance',   134, 0,   '#fdf0e6','#e8b98a','🌼','','https://images.unsplash.com/photo-1541643600914-78b084683601?w=600&q=80&auto=format&fit=crop'],
    [30, 'Oud Imperial Essence',           'Fragrance',   240, 0,   '#2b2118','#6b4f38','🪵','Luxe','https://images.unsplash.com/photo-1615634260167-c8cdede054de?w=600&q=80&auto=format&fit=crop'],
    [31, 'Sea Salt Eau Fraîche',           'Fragrance',   88,  0,   '#dff0f5','#8fbdd1','🌊','','https://images.unsplash.com/photo-1563170351-be82bc888aa4?w=600&q=80&auto=format&fit=crop'],
    [32, 'Velvet Vanilla Mist',            'Fragrance',   76,  0,   '#fbf0e3','#dfb98a','🍦','','https://images.unsplash.com/photo-1594035910387-fea47794261f?w=600&q=80&auto=format&fit=crop'],

    /* Hair & Body (10) */
    [11, 'White Musk Body Soufflé',        'Hair & Body', 46,  0,   '#f3eef8','#cbb2e0','🤍','','https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=600&q=80&auto=format&fit=crop'],
    [12, 'Marula Silk Hair Oil',           'Hair & Body', 52,  0,   '#f4ead6','#d4b06a','🧡','','https://images.unsplash.com/photo-1526947425960-945c6e72858f?w=600&q=80&auto=format&fit=crop'],
    [33, 'Cashmere Shower Cream',          'Hair & Body', 38,  0,   '#fdeef2','#e8b6c4','🧴','','https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&q=80&auto=format&fit=crop'],
    [34, 'Velour Hair Repair Mask',        'Hair & Body', 56,  0,   '#efe6f0','#c4a3c8','💆','','https://images.unsplash.com/photo-1526947425960-945c6e72858f?w=600&q=80&auto=format&fit=crop'],
    [35, 'Silk Protein Shampoo',           'Hair & Body', 42,  0,   '#e3edf4','#9dbdd4','🚿','','https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&q=80&auto=format&fit=crop'],
    [36, 'Oud Body Crème',                 'Hair & Body', 64,  0,   '#2b2118','#8a6a48','🪵','','https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=600&q=80&auto=format&fit=crop'],
    [37, 'Velvet Exfoliating Scrub',       'Hair & Body', 34,  0,   '#f0dcd8','#cf9a92','🫧','','https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&q=80&auto=format&fit=crop'],
    [38, 'Botanical Body Butter',          'Hair & Body', 44,  0,   '#e5f0df','#a3c49a','🧈','','https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=600&q=80&auto=format&fit=crop'],
    [39, 'Volume Boost Root Mist',         'Hair & Body', 36,  0,   '#f2efe9','#c9bfae','💨','','https://images.unsplash.com/photo-1526947425960-945c6e72858f?w=600&q=80&auto=format&fit=crop'],
    [40, 'Champagne Glow Body Oil',        'Hair & Body', 58,  0,   '#fbf3e0','#e0c184','🥂','','https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=600&q=80&auto=format&fit=crop']
  ];
  for(const r of rows) ins.run(...r);
}
seedProducts();

// ---- Seed admin account ----
(function seedAdmin(){
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@maisonvelour.com');
  if(existing) return;
  db.prepare('INSERT INTO users (name, email, pass, phone, is_admin) VALUES (?,?,?,?,1)')
    .run('Maison Admin', 'admin@maisonvelour.com', 'admin123', '');
})();

module.exports = { db };
