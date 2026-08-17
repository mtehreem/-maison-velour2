// Maison Velour — shared API request handler
// Used by both the local dev server (server.js) and the Vercel serverless
// function (api/[[...slug]].js) so the API logic lives in exactly one place.
const crypto = require('crypto');
const { supabase } = require('./supabase');

function send(res, code, data){
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(body);
}

async function readBody(req){
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => { data += c; if(data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch(e){ resolve({}); } });
  });
}

function makeToken(){ return crypto.randomBytes(24).toString('hex'); }

/* ---- Brute-force protection: per-IP + per-email login throttling ---- */
// Note: on serverless (Vercel) this is best-effort — each invocation may hit a
// fresh instance, so the counter is per-instance. It still slows down repeated
// attacks from a single client during one instance's lifetime.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;  // 15 minutes
const LOGIN_MAX_ATTEMPTS = 10;           // 10 failed attempts per window
const loginAttempts = new Map();         // key -> { count, resetAt }
function loginThrottleKey(req, email){
  const ip = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : (req.socket && req.socket.remoteAddress) || 'unknown';
  return `${ip}|${(email||'').toLowerCase()}`;
}
function loginThrottled(key){
  const now = Date.now();
  const rec = loginAttempts.get(key);
  if(!rec) return false;
  if(now > rec.resetAt){ loginAttempts.delete(key); return false; }
  return rec.count >= LOGIN_MAX_ATTEMPTS;
}
function loginFail(key){
  const now = Date.now();
  const rec = loginAttempts.get(key) || { count: 0, resetAt: now + LOGIN_WINDOW_MS };
  rec.count += 1;
  rec.resetAt = now + LOGIN_WINDOW_MS;
  loginAttempts.set(key, rec);
}
function loginSuccess(key){ loginAttempts.delete(key); }

/* ---- Password hashing (scrypt, salted — never store plaintext) ---- */
const SCRYPT_KEYLEN = 32;
const SCRYPT_COST = 16384;   // N
const SCRYPT_BLOCK = 8;      // r
const SCRYPT_PAR = 1;        // p

function hashPassword(pass){
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pass, salt, SCRYPT_KEYLEN, { N: SCRYPT_COST, r: SCRYPT_BLOCK, p: SCRYPT_PAR });
  return `scrypt$${salt}$${hash.toString('hex')}`;
}

function verifyPassword(pass, stored){
  try {
    const parts = String(stored||'').split('$');
    if(parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const [, salt, hashHex] = parts;
    const hash = crypto.scryptSync(pass, salt, SCRYPT_KEYLEN, { N: SCRYPT_COST, r: SCRYPT_BLOCK, p: SCRYPT_PAR });
    const a = Buffer.from(hashHex, 'hex');
    const b = hash;
    if(a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch(e){ return false; }
}

/* ---- Supabase data helpers ---- */

// Convert Supabase products rows to the shape the site expects
function mapProduct(p){
  return { id:p.id, name:p.name, cat:p.cat, price:p.price, was:p.was||0, image:p.image||'', 'art[0]':p.art1||'#fff', 'art[1]':p.art2||'#000', g:p.glyph||'✦', badge:p.badge||'' };
}

async function userFromReq(req){
  const auth = req.headers['authorization'] || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if(!token) return null;
  const { data: rows, error } = await supabase
    .from('sessions').select('token, user_id').eq('token', token).maybeSingle();
  if(error || !rows) return null;
  const { data: user } = await supabase
    .from('users').select('*').eq('id', rows.user_id).maybeSingle();
  return user || null;
}

async function listCart(sessionKey){
  const { data } = await supabase
    .from('cart_items').select('product_id, qty').eq('session_token', sessionKey);
  return (data || []).map(r => ({ id:r.product_id, qty:r.qty }));
}

async function listWishlist(sessionKey, userId){
  if(userId){
    const { data } = await supabase.from('wishlist').select('product_id').eq('user_id', userId);
    return (data || []).map(r => r.product_id);
  }
  const { data } = await supabase
    .from('wishlist').select('product_id').eq('session_token', sessionKey);
  return (data || []).map(r => r.product_id);
}

async function handleApi(req, res){
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;
  const method = req.method;

  if(method === 'OPTIONS'){ res.writeHead(204, {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization'}); return res.end(); }

  try {
    /* ---- Wishlist merge on login: attach session wishlist to user ---- */
    if(p === '/api/wishlist/merge' && method === 'POST'){
      const u = await userFromReq(req);
      if(!u) return send(res, 401, { ok:false, error:'Not authenticated' });
      const sessKey = req.headers['x-session'] || 'anon';
      const { data: sessionItems } = await supabase.from('wishlist').select('product_id').eq('session_token', sessKey);
      for(const it of (sessionItems || [])){
        const { data: ex } = await supabase.from('wishlist').select('id').eq('user_id', u.id).eq('product_id', it.product_id).maybeSingle();
        if(!ex) await supabase.from('wishlist').insert({ user_id: u.id, product_id: it.product_id });
      }
      await supabase.from('wishlist').delete().eq('session_token', sessKey);
      return send(res, 200, { ok:true, wishlist: await listWishlist(sessKey, u.id) });
    }

    /* ---- Products ---- */
    if(p === '/api/products' && method === 'GET'){
      const { data, error } = await supabase.from('products').select('*').order('id');
      if(error) throw error;
      return send(res, 200, { ok: true, products: data.map(mapProduct) });
    }

    /* ---- Auth ---- */
    if(p === '/api/register' && method === 'POST'){
      const b = await readBody(req);
      const name = String(b.name||'').trim(), email = String(b.email||'').trim().toLowerCase(), pass = String(b.pass||'');
      if(name.length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || pass.length < 6) return send(res, 400, { ok:false, error:'Invalid details' });
      const { data: exists } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
      if(exists) return send(res, 409, { ok:false, error:'Email already registered' });
      const { data: ins, error } = await supabase.from('users').insert({ name, email, pass: hashPassword(pass), phone: String(b.phone||'') }).select('*').single();
      if(error){
        if(error.code === '23505') return send(res, 409, { ok:false, error:'Email already registered' });
        throw error;
      }
      const token = makeToken();
      await supabase.from('sessions').insert({ token, user_id: ins.id });
      return send(res, 200, { ok:true, token, user:{ id:ins.id, name, email, phone: String(b.phone||'') } });
    }
    if(p === '/api/login' && method === 'POST'){
      const b = await readBody(req);
      const email = String(b.email||'').trim().toLowerCase(), pass = String(b.pass||'');
      const tKey = loginThrottleKey(req, email);
      if(loginThrottled(tKey)) return send(res, 429, { ok:false, error:'Too many attempts. Try again in 15 minutes.' });
      if(!pass) return send(res, 401, { ok:false, error:'Incorrect email or password' });
      const { data: u } = await supabase.from('users').select('*').eq('email', email).maybeSingle();
      if(!u){ loginFail(tKey); return send(res, 401, { ok:false, error:'Incorrect email or password' }); }
      const stored = String(u.pass||'');
      const isScrypt = stored.startsWith('scrypt$');
      const ok = isScrypt ? verifyPassword(pass, stored) : (stored === pass); // legacy plaintext upgrade
      if(!ok){ loginFail(tKey); return send(res, 401, { ok:false, error:'Incorrect email or password' }); }
      loginSuccess(tKey);
      if(!isScrypt){
        // upgrade legacy plaintext password to a hash on first successful login
        await supabase.from('users').update({ pass: hashPassword(pass) }).eq('id', u.id);
      }
      const token = makeToken();
      await supabase.from('sessions').insert({ token, user_id: u.id });
      return send(res, 200, { ok:true, token, user:{ id:u.id, name:u.name, email:u.email, phone:u.phone, is_admin: u.is_admin } });
    }
    if(p === '/api/me' && method === 'GET'){
      const u = await userFromReq(req);
      if(!u) return send(res, 401, { ok:false, error:'Not authenticated' });
      return send(res, 200, { ok:true, user:{ id:u.id, name:u.name, email:u.email, phone:u.phone, is_admin: u.is_admin } });
    }
    if(p === '/api/logout' && method === 'POST'){
      const token = (req.headers['authorization']||'').replace(/^Bearer\s+/i,'');
      if(token) await supabase.from('sessions').delete().eq('token', token);
      return send(res, 200, { ok:true });
    }

    /* ---- Cart (session-scoped) ---- */
    const sessionKey = req.headers['x-session'] || 'anon';
    if(p === '/api/cart' && method === 'GET'){
      return send(res, 200, { ok:true, cart: await listCart(sessionKey) });
    }
    if(p === '/api/cart' && method === 'POST'){
      const b = await readBody(req);
      const pid = Number(b.product_id), qty = Number(b.qty) || 1;
      if(!pid) return send(res, 400, { ok:false, error:'product_id required' });
      const { data: existing } = await supabase.from('cart_items').select('id, qty').eq('session_token', sessionKey).eq('product_id', pid).maybeSingle();
      if(existing) await supabase.from('cart_items').update({ qty: existing.qty + qty }).eq('id', existing.id);
      else await supabase.from('cart_items').insert({ session_token: sessionKey, product_id: pid, qty });
      return send(res, 200, { ok:true, cart: await listCart(sessionKey) });
    }
    if(p === '/api/cart' && method === 'PUT'){
      const b = await readBody(req);
      const pid = Number(b.product_id), qty = Number(b.qty) || 0;
      if(qty <= 0) await supabase.from('cart_items').delete().eq('session_token', sessionKey).eq('product_id', pid);
      else {
        const { data: ex } = await supabase.from('cart_items').select('id').eq('session_token', sessionKey).eq('product_id', pid).maybeSingle();
        if(ex) await supabase.from('cart_items').update({ qty }).eq('id', ex.id);
        else await supabase.from('cart_items').insert({ session_token: sessionKey, product_id: pid, qty });
      }
      return send(res, 200, { ok:true, cart: await listCart(sessionKey) });
    }
    if(p === '/api/cart' && method === 'DELETE'){
      await supabase.from('cart_items').delete().eq('session_token', sessionKey);
      return send(res, 200, { ok:true, cart: [] });
    }

    /* ---- Orders ---- */
    if(p === '/api/orders' && method === 'POST'){
      const b = await readBody(req);
      const u = await userFromReq(req);
      const email = (u ? u.email : String(b.email||'guest')).toLowerCase();
      const num = 'MV-' + Date.now().toString(36).toUpperCase().slice(-6);
      const items = Array.isArray(b.items) ? b.items : [];
      const total = Number(b.total) || 0;
      const { data: ins, error } = await supabase.from('orders').insert({
        num, user_id: u ? u.id : null, email, total, items: items.length,
        ship_name: String(b.name||''), ship_phone: String(b.phone||''), ship_address: String(b.address||''), ship_city: String(b.city||''), ship_country: String(b.country||'')
      }).select('id').single();
      if(error) throw error;
      for(const it of items){
        await supabase.from('order_items').insert({ order_id: ins.id, product_id: Number(it.product_id), name: String(it.name||''), price: Number(it.price||0), qty: Number(it.qty||1) });
      }
      await supabase.from('cart_items').delete().eq('session_token', sessionKey);
      return send(res, 200, { ok:true, order:{ num, date: new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}), total, items: items.length, email, name: String(b.name||''), phone: String(b.phone||''), address: String(b.address||''), city: String(b.city||''), country: String(b.country||'') } });
    }
    if(p === '/api/orders' && method === 'GET'){
      const u = await userFromReq(req);
      const email = (req.headers['x-email'] || (u ? u.email : '')).toLowerCase();
      let q = supabase.from('orders').select('num, email, total, items, ship_name, ship_phone, ship_address, ship_city, ship_country, created_at').order('id', { ascending:false });
      if(email) q = q.eq('email', email);
      const { data: rows, error } = await q.limit(20);
      if(error) throw error;
      return send(res, 200, { ok:true, orders: (rows||[]).map(r => ({ num:r.num, email:r.email, total:r.total, items:r.items, date:r.created_at, name:r.ship_name, phone:r.ship_phone, address:r.ship_address, city:r.ship_city, country:r.ship_country })) });
    }
    if(p === '/api/orders/track' && method === 'POST'){
      const b = await readBody(req);
      const num = String(b.num||'').toUpperCase();
      const zip = String(b.zip||'').trim();
      if(!num || !zip) return send(res, 400, { ok:false, error:'num and zip required' });
      const { data: o } = await supabase.from('orders').select('num, email, total, items, ship_name, ship_phone, ship_address, ship_city, ship_country, created_at').eq('num', num).maybeSingle();
      if(!o) return send(res, 404, { ok:false, error:'Order not found' });
      return send(res, 200, { ok:true, order:{ num:o.num, total:o.total, items:o.items, date:o.created_at, status:'In transit 🚚', name:o.ship_name, phone:o.ship_phone, address:o.ship_address, city:o.ship_city, country:o.ship_country } });
    }

    /* ---- Wishlist ---- */
    const wishUser = await userFromReq(req);
    const wishUserId = wishUser ? wishUser.id : null;
    if(p === '/api/wishlist' && method === 'GET'){
      return send(res, 200, { ok:true, wishlist: await listWishlist(sessionKey, wishUserId) });
    }
    if(p === '/api/wishlist' && method === 'POST'){
      const b = await readBody(req);
      const pid = Number(b.product_id);
      const scope = wishUserId ? { user_id: wishUserId } : { session_token: sessionKey };
      const { data: ex } = await supabase.from('wishlist').select('id').match(scope).eq('product_id', pid).maybeSingle();
      if(!ex) await supabase.from('wishlist').insert({ ...scope, product_id: pid });
      // If logged in, also clear any session-scoped copy of the same item (merge)
      if(wishUserId) await supabase.from('wishlist').delete().eq('session_token', sessionKey).eq('product_id', pid);
      return send(res, 200, { ok:true, wishlist: await listWishlist(sessionKey, wishUserId) });
    }
    if(p === '/api/wishlist' && method === 'DELETE'){
      const b = await readBody(req);
      const pid = Number(b.product_id);
      let q;
      if(wishUserId){
        q = supabase.from('wishlist').delete().eq('user_id', wishUserId);
      } else {
        q = supabase.from('wishlist').delete().eq('session_token', sessionKey);
      }
      if(pid) q = q.eq('product_id', pid);
      await q;
      return send(res, 200, { ok:true, wishlist: await listWishlist(sessionKey, wishUserId) });
    }

    /* ---- Admin (is_admin required) ---- */
    const adminUser = await userFromReq(req);
    const requireAdmin = () => (adminUser && Number(adminUser.is_admin) === 1) ? null : 'forbidden';

    // Product CRUD
    if(p === '/api/admin/products' && method === 'GET'){
      if(requireAdmin()) return send(res, 403, { ok:false, error:'Admin only' });
      const { data: rows } = await supabase.from('products').select('*').order('id');
      return send(res, 200, { ok:true, products: rows });
    }
    if(p === '/api/admin/products' && method === 'POST'){
      if(requireAdmin()) return send(res, 403, { ok:false, error:'Admin only' });
      const b = await readBody(req);
      const { data: ins, error } = await supabase.from('products').insert({
        name: String(b.name||''), cat: String(b.cat||''), price: Number(b.price)||0, was: Number(b.was)||0,
        art1: String(b.art1||'#fff'), art2: String(b.art2||'#000'), glyph: String(b.glyph||'✦'), badge: String(b.badge||''), image: String(b.image||'')
      }).select('id').single();
      if(error) throw error;
      return send(res, 200, { ok:true, id: ins.id });
    }
    if(p === '/api/admin/products' && method === 'PUT'){
      if(requireAdmin()) return send(res, 403, { ok:false, error:'Admin only' });
      const b = await readBody(req);
      const id = Number(b.id);
      if(!id) return send(res, 400, { ok:false, error:'id required' });
      await supabase.from('products').update({
        name: String(b.name||''), cat: String(b.cat||''), price: Number(b.price)||0, was: Number(b.was)||0,
        art1: String(b.art1||'#fff'), art2: String(b.art2||'#000'), glyph: String(b.glyph||'✦'), badge: String(b.badge||''), image: String(b.image||'')
      }).eq('id', id);
      return send(res, 200, { ok:true });
    }
    if(p === '/api/admin/products' && method === 'DELETE'){
      if(requireAdmin()) return send(res, 403, { ok:false, error:'Admin only' });
      const b = await readBody(req);
      const id = Number(b.id);
      if(!id) return send(res, 400, { ok:false, error:'id required' });
      await supabase.from('products').delete().eq('id', id);
      return send(res, 200, { ok:true });
    }

    // Orders management
    if(p === '/api/admin/orders' && method === 'GET'){
      if(requireAdmin()) return send(res, 403, { ok:false, error:'Admin only' });
      const { data: rows } = await supabase.from('orders').select('*').order('id', { ascending:false });
      return send(res, 200, { ok:true, orders: rows });
    }
    if(p === '/api/admin/orders' && method === 'PUT'){
      if(requireAdmin()) return send(res, 403, { ok:false, error:'Admin only' });
      const b = await readBody(req);
      await supabase.from('orders').update({ status: String(b.status||'') }).eq('num', String(b.num||''));
      return send(res, 200, { ok:true });
    }
    if(p === '/api/admin/orders' && method === 'DELETE'){
      if(requireAdmin()) return send(res, 403, { ok:false, error:'Admin only' });
      const b = await readBody(req);
      await supabase.from('orders').delete().eq('num', String(b.num||''));
      return send(res, 200, { ok:true });
    }

    // Wishlist + users listing
    if(p === '/api/admin/wishlist' && method === 'GET'){
      if(requireAdmin()) return send(res, 403, { ok:false, error:'Admin only' });
      const { data: wrows } = await supabase.from('wishlist').select('id, session_token, product_id').order('id', { ascending:false });
      const { data: prods } = await supabase.from('products').select('id, name, price');
      const pmap = {};
      (prods||[]).forEach(p2 => pmap[p2.id] = p2);
      const rows = (wrows||[]).map(w => ({ id:w.id, session_token:w.session_token, product_id:w.product_id, product_name: pmap[w.product_id] ? pmap[w.product_id].name : '', price: pmap[w.product_id] ? pmap[w.product_id].price : 0 }));
      return send(res, 200, { ok:true, wishlist: rows });
    }
    if(p === '/api/admin/users' && method === 'GET'){
      if(requireAdmin()) return send(res, 403, { ok:false, error:'Admin only' });
      const { data: rows } = await supabase.from('users').select('id, name, email, phone, is_admin, created_at').order('id');
      return send(res, 200, { ok:true, users: rows });
    }
    if(p === '/api/admin/users' && method === 'PUT'){
      if(requireAdmin()) return send(res, 403, { ok:false, error:'Admin only' });
      const b = await readBody(req);
      const id = Number(b.id);
      if(!id) return send(res, 400, { ok:false, error:'id required' });
      const updates = {};
      if(b.name !== undefined) updates.name = String(b.name);
      if(b.phone !== undefined) updates.phone = String(b.phone);
      if(b.is_admin !== undefined) updates.is_admin = Number(b.is_admin) ? 1 : 0;
      if(Object.keys(updates).length) await supabase.from('users').update(updates).eq('id', id);
      return send(res, 200, { ok:true });
    }
    if(p === '/api/admin/users' && method === 'DELETE'){
      if(requireAdmin()) return send(res, 403, { ok:false, error:'Admin only' });
      const b = await readBody(req);
      const id = Number(b.id);
      if(!id) return send(res, 400, { ok:false, error:'id required' });
      await supabase.from('users').delete().eq('id', id);
      return send(res, 200, { ok:true });
    }

    return send(res, 404, { ok:false, error:'Not found' });
  } catch(err){
    return send(res, 500, { ok:false, error: String(err && err.message || err) });
  }
}

module.exports = { handleApi, send, readBody, userFromReq, listCart, listWishlist, hashPassword, verifyPassword };
