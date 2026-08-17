// Maison Velour — Supabase client wrapper
// Loads credentials from .env and exposes a configured client.
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load .env manually (no dotenv dependency needed)
function loadEnv(){
  const envPath = path.join(__dirname, '.env');
  try {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for(const line of lines){
      const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
      if(m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch(e){ /* .env missing — rely on real env vars */ }
}
loadEnv();

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
if(!url || !anonKey) throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');

const supabase = createClient(url, anonKey);

module.exports = { supabase, url, anonKey };
