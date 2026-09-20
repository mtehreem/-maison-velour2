// Maison Velour — pricing, server-side.
//
// This is the authoritative source for what a cart costs. The browser still
// holds its own copy of these numbers for instant display, but the server never
// takes a price, a subtotal or a total from a request: it looks every product up
// in the database and works the money out here. Before this existed, a modified
// request could buy a Rs 25,452 order for Rs 1.
//
// If you change a rate here, change it in public/index.html too — the storefront
// can't import this file (it is a static page with no build step), and the
// "frontend and server pricing agree" test will fail loudly if they drift.

// USD -> currency. Mirrors CURRENCIES in public/index.html.
const CURRENCY_RATES = {
  USD: 1.00,
  EUR: 0.92,
  GBP: 0.79,
  PKR: 280,
  AED: 3.67,
  SAR: 3.75,
  INR: 83.5,
  CAD: 1.36,
  AUD: 1.52,
  JPY: 152
};

// Mirrors the constants next to computeTotals() in public/index.html.
const FREE_SHIP_USD = 300;
const SHIP_USD = 9;
const TAX_PCT = 0.05;
const LOYALTY_MIN_USD = 200;
const LOYALTY_PCT = 0.05;

function rate(currency){
  const r = CURRENCY_RATES[String(currency || '').toUpperCase()];
  return Number.isFinite(r) && r > 0 ? r : null;
}

// Subtotal -> the full set of figures. Kept identical to the storefront's maths
// so the price on screen and the price charged are the same number.
function computeTotals(sub){
  const sub2 = Number(sub) || 0;
  const ship = sub2 >= FREE_SHIP_USD ? 0 : SHIP_USD;
  const tax = sub2 * TAX_PCT;
  const discount = sub2 > LOYALTY_MIN_USD ? sub2 * LOYALTY_PCT : 0;
  return { sub: sub2, ship, tax, discount, total: sub2 + ship + tax - discount };
}

// The figure to charge, in the given currency, rounded to the same precision the
// storefront displays (whole units at 100 and above, two decimals below).
function chargeAmount(usdTotal, currency){
  const r = rate(currency);
  if(r === null) return null;
  const val = usdTotal * r;
  return val >= 100 ? Math.round(val) : Math.round(val * 100) / 100;
}

module.exports = {
  CURRENCY_RATES,
  FREE_SHIP_USD,
  SHIP_USD,
  TAX_PCT,
  LOYALTY_MIN_USD,
  LOYALTY_PCT,
  rate,
  computeTotals,
  chargeAmount
};
