// Maison Velour — Supabase client for server-side use only.
// Loads credentials from .env locally, or from real environment variables on
// Vercel. Never import this from browser code.
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load .env manually (no dotenv dependency needed)
(function loadEnv(){
  try {
    const lines = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n');
    for(const line of lines){
      const m = line.match(/^\s*([\w.]+)\s*=\s*(.*?)\s*$/);
      if(m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch(e){ /* .env missing — rely on real env vars */ }
})();

// Trim whitespace. A hidden newline inside a pasted key crashed this app in
// production before ("Headers.set: ... is an invalid header value"), so every
// credential is sanitised before use.
const url        = String(process.env.SUPABASE_URL || '').trim();
const serviceKey = String(process.env.SUPABASE_SERVICE_KEY || '').trim();
const anonKey    = String(process.env.SUPABASE_ANON_KEY || '').trim();

// The API is the only thing that talks to the database, so it uses the
// service_role key (which bypasses Row Level Security). The anon key is only
// accepted as a fallback for backwards compatibility.
const key = serviceKey || anonKey;

if(!url || !key){
  throw new Error('Missing SUPABASE_URL and SUPABASE_SERVICE_KEY — see .env');
}
if(/[\r\n]/.test(url) || /[\r\n]/.test(key)){
  throw new Error('SUPABASE_URL or key contains a newline — paste them as single-line values');
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

module.exports = { supabase, url, usingServiceRole: !!serviceKey };
