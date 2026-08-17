// Vercel serverless function — catch-all for every /api/* route.
// It adapts Vercel's (req, res) signature to the shared handler.
const { handleApi } = require('../../api-handler');

module.exports = async function handler(req, res){
  await handleApi(req, res);
};
