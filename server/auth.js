const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || (() => {
  const s = require('crypto').randomBytes(32).toString('hex');
  console.warn('JWT_SECRET not set — using random secret (tokens invalidated on restart)');
  return s;
})();

function signToken(username) {
  return jwt.sign({ username }, SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

function upgradeAuth(req) {
  try {
    const token = new URL(req.url, 'http://x').searchParams.get('token');
    return token ? verifyToken(token) : null;
  } catch {
    return null;
  }
}

module.exports = { signToken, verifyToken, requireAuth, upgradeAuth };
