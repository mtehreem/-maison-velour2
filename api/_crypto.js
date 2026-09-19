// Maison Velour — password hashing (scrypt, salted, constant-time verify).
// Shared by the API handler and the seed script so there is one implementation.
const crypto = require('crypto');

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
    const parts = String(stored || '').split('$');
    if(parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const [, salt, hashHex] = parts;
    const hash = crypto.scryptSync(pass, salt, SCRYPT_KEYLEN, { N: SCRYPT_COST, r: SCRYPT_BLOCK, p: SCRYPT_PAR });
    const a = Buffer.from(hashHex, 'hex');
    if(a.length !== hash.length) return false;
    return crypto.timingSafeEqual(a, hash);
  } catch(e){ return false; }
}

function makeToken(){ return crypto.randomBytes(24).toString('hex'); }

module.exports = { hashPassword, verifyPassword, makeToken };
