// Maison Velour — database setup + seed.
//
// Creates every table (scripts/schema.sql) and loads the full 60-product
// catalogue plus the admin account. Safe to re-run.
//
// Usage:  node scripts/seed.js
// Requires DATABASE_URL in .env — Supabase → Project Settings → Database →
// Connection string → URI (use the direct connection on port 5432, not the
// transaction pooler on 6543, which cannot run DDL).
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { hashPassword } = require('../api/_crypto');

// ---- .env loader (no dotenv dependency) ----
(function loadEnv(){
  try {
    const lines = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n');
    for(const line of lines){
      const m = line.match(/^\s*([\w.]+)\s*=\s*(.*?)\s*$/);
      if(m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch(e){ /* rely on real env vars */ }
})();

/* ---------------------------------------------------------------------------
   Catalogue — 60 products, matching the storefront exactly.
   ids 1-40   : Skincare / Makeup / Fragrance / Hair & Body
   ids 5001.. : Gifts & Sets   } these 20 were missing from the old database,
   ids 6001.. : Accessories    } which broke two shop filters and the cart
   Columns: [id, name, cat, price, was, art1, art2, glyph, badge, image]
--------------------------------------------------------------------------- */
const PRODUCTS = [
  /* Skincare */
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

  /* Makeup */
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

  /* Fragrance */
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

  /* Hair & Body */
  [11, 'White Musk Body Soufflé',        'Hair & Body', 46,  0,   '#f3eef8','#cbb2e0','🤍','','https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=600&q=80&auto=format&fit=crop'],
  [12, 'Marula Silk Hair Oil',           'Hair & Body', 52,  0,   '#f4ead6','#d4b06a','🧡','','https://images.unsplash.com/photo-1526947425960-945c6e72858f?w=600&q=80&auto=format&fit=crop'],
  [33, 'Cashmere Shower Cream',          'Hair & Body', 38,  0,   '#fdeef2','#e8b6c4','🧴','','https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&q=80&auto=format&fit=crop'],
  [34, 'Velour Hair Repair Mask',        'Hair & Body', 56,  0,   '#efe6f0','#c4a3c8','💆','','https://images.unsplash.com/photo-1526947425960-945c6e72858f?w=600&q=80&auto=format&fit=crop'],
  [35, 'Silk Protein Shampoo',           'Hair & Body', 42,  0,   '#e3edf4','#9dbdd4','🚿','','https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&q=80&auto=format&fit=crop'],
  [36, 'Oud Body Crème',                 'Hair & Body', 64,  0,   '#2b2118','#8a6a48','🪵','','https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=600&q=80&auto=format&fit=crop'],
  [37, 'Velvet Exfoliating Scrub',       'Hair & Body', 34,  0,   '#f0dcd8','#cf9a92','🫧','','https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&q=80&auto=format&fit=crop'],
  [38, 'Botanical Body Butter',          'Hair & Body', 44,  0,   '#e5f0df','#a3c49a','🧈','','https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=600&q=80&auto=format&fit=crop'],
  [39, 'Volume Boost Root Mist',         'Hair & Body', 36,  0,   '#f2efe9','#c9bfae','💨','','https://images.unsplash.com/photo-1526947425960-945c6e72858f?w=600&q=80&auto=format&fit=crop'],
  [40, 'Champagne Glow Body Oil',        'Hair & Body', 58,  0,   '#fbf3e0','#e0c184','🥂','','https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=600&q=80&auto=format&fit=crop'],

  /* Gifts & Sets */
  [5001, 'The Icon Gift Set',            'Gifts & Sets', 120, 0, '#f4ead6','#c9a876','🎁','','https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=600&q=80&auto=format&fit=crop'],
  [5002, 'The Parisienne Duo',           'Gifts & Sets', 95,  0, '#e8dcc0','#b99a5a','🎀','','https://images.unsplash.com/photo-1541643600914-78b084683601?w=600&q=80&auto=format&fit=crop'],
  [5003, 'Miniature Discovery Set',      'Gifts & Sets', 65,  0, '#e9dcf0','#b79ac4','🧸','','https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600&q=80&auto=format&fit=crop'],
  [5004, 'The Golden Hour Trio',         'Gifts & Sets', 150, 0, '#f3d9e8','#c9a876','🌅','','https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=600&q=80&auto=format&fit=crop'],
  [5005, 'Silk Serum Duo',               'Gifts & Sets', 140, 0, '#e9dcf0','#b79ac4','💧','','https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600&q=80&auto=format&fit=crop'],
  [5006, 'Radiance Ritual Set',          'Gifts & Sets', 220, 0, '#f3d9e8','#c98aa8','✨','','https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&q=80&auto=format&fit=crop'],
  [5007, 'Parfum Collection Coffret',    'Gifts & Sets', 310, 0, '#4a1a3f','#1a0f1e','🌃','','https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=600&q=80&auto=format&fit=crop'],
  [5008, 'Velvet Vanity Edit',           'Gifts & Sets', 175, 0, '#e8dcc0','#b99a5a','🪞','','https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&q=80&auto=format&fit=crop'],
  [5009, 'Spa Escape Hamper',            'Gifts & Sets', 160, 0, '#1f2b3a','#0d1219','🛁','','https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=600&q=80&auto=format&fit=crop'],
  [5010, 'Petit Maison Box',             'Gifts & Sets', 85,  0, '#fde8ee','#f0a8c0','🎁','','https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=600&q=80&auto=format&fit=crop'],

  /* Accessories */
  [6001, 'Golden Vanity Mirror',         'Accessories', 85,  0, '#e8dcc0','#b99a5a','🪞','','https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&q=80&auto=format&fit=crop'],
  [6002, 'Silk Hair Scarf',              'Accessories', 45,  0, '#d9a7c0','#8f5a75','🧣','','https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&q=80&auto=format&fit=crop'],
  [6003, 'Velvet Makeup Bag',            'Accessories', 55,  0, '#4a1a3f','#33102c','👛','','https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&q=80&auto=format&fit=crop'],
  [6004, 'Marble Skincare Tray',         'Accessories', 70,  0, '#e5e0d8','#a8a29a','🪨','','https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&q=80&auto=format&fit=crop'],
  [6005, 'Velour Applicator Set',        'Accessories', 38,  0, '#f7e8d8','#d3a878','🖌️','','https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&q=80&auto=format&fit=crop'],
  [6006, 'Gilded Combs & Brush',         'Accessories', 62,  0, '#f4ead6','#c9a876','🪮','','https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&q=80&auto=format&fit=crop'],
  [6007, 'Perfume Atomiser',             'Accessories', 48,  0, '#d9c4e6','#7d5a8f','🧴','','https://images.unsplash.com/photo-1541643600914-78b084683601?w=600&q=80&auto=format&fit=crop'],
  [6008, 'Silk Sleep Mask',              'Accessories', 42,  0, '#f3eef8','#cbb2e0','😴','','https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=600&q=80&auto=format&fit=crop'],
  [6009, 'Vanity Mirror Light',          'Accessories', 92,  0, '#fdf0e6','#e8b98a','💡','','https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&q=80&auto=format&fit=crop'],
  [6010, 'Travel Luxury Case',           'Accessories', 110, 0, '#2b2118','#8a6a48','🧳','','https://images.unsplash.com/photo-1526947425960-945c6e72858f?w=600&q=80&auto=format&fit=crop']
];

const ADMIN_EMAIL = 'admin@maisonvelour.com';
const ADMIN_PASS  = 'admin123';
const ADMIN_NAME  = 'Maison Admin';

async function main(){
  const url = process.env.DATABASE_URL;
  if(!url){
    console.error('\n  DATABASE_URL is missing.\n');
    console.error('  Add it to .env — Supabase → Project Settings → Database →');
    console.error('  Connection string → URI (direct connection, port 5432).\n');
    process.exit(1);
  }

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.');

  // ---- 1. schema ----
  await client.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  console.log('Schema applied (7 tables + indexes + RLS).');

  // ---- 2. products ----
  const productSql = `
    insert into products (id, name, cat, price, was, art1, art2, glyph, badge, image)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    on conflict (id) do update set
      name = excluded.name, cat = excluded.cat, price = excluded.price,
      was = excluded.was, art1 = excluded.art1, art2 = excluded.art2,
      glyph = excluded.glyph, badge = excluded.badge, image = excluded.image`;
  for(const row of PRODUCTS) await client.query(productSql, row);

  // New admin-created products get an id from this sequence; without bumping it
  // the next insert would collide with an existing id.
  await client.query(
    `select setval(pg_get_serial_sequence('products','id'), (select max(id) from products))`
  );
  console.log(`Products seeded: ${PRODUCTS.length}.`);

  // ---- 3. admin account ----
  await client.query(
    `insert into users (name, email, pass, phone, is_admin)
     values ($1,$2,$3,'',1)
     on conflict (email) do update set pass = excluded.pass, is_admin = 1`,
    [ADMIN_NAME, ADMIN_EMAIL, hashPassword(ADMIN_PASS)]
  );
  console.log(`Admin ready: ${ADMIN_EMAIL}`);

  // ---- 4. report ----
  const { rows } = await client.query(
    `select cat, count(*)::int as n from products group by cat order by cat`
  );
  console.log('\nCatalogue by category:');
  for(const r of rows) console.log(`  ${r.cat.padEnd(14)} ${r.n}`);

  await client.end();
  console.log('\nDone. Start the site with: node server.js\n');
}

main().catch(err => {
  console.error('\nSeed failed:', err.message, '\n');
  process.exit(1);
});
