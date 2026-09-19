// Vercel serverless entry point for /api/*.
// All logic lives in ./_handler so the local dev server and production behave
// identically. Every failure is caught and returned as JSON to avoid
// FUNCTION_INVOCATION_FAILED.
const { handleApi } = require('./_handler');

module.exports = async function handler(req, res){
  try {
    await handleApi(req, res);
  } catch(err){
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok:false, error: String((err && err.message) || err) }));
  }
};
