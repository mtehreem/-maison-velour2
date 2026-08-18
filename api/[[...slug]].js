// Vercel serverless function — catch-all for every /api/* route.
// Every failure (module load OR request handling) is caught and returned as
// readable JSON so Vercel never sees an unhandled exception (which would
// surface as a generic FUNCTION_INVOCATION_FAILED 500 with no detail).
let handleApi = null;
let loadError = null;
try {
  ({ handleApi } = require('../../api-handler'));
} catch (err) {
  loadError = err;
}

function fail(res, err) {
  res.statusCode = 500;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err) }));
}

module.exports = async function handler(req, res) {
  try {
    if (loadError) throw loadError;
    await handleApi(req, res);
  } catch (err) {
    fail(res, err);
  }
};
