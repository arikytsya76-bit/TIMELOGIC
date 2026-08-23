const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { prisma } = require('../config/database');

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  const token = header.slice(7);
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
  } catch (err) {
    const message = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    return res.status(401).json({ success: false, message });
  }

  if (!payload || typeof payload !== 'object' || !payload.sub) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, orgId: true, status: true },
    });
    if (!user) {
      return res.status(401).json({ success: false, message: 'User unavailable' });
    }
    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ success: false, message: `Account is ${user.status.toLowerCase()}` });
    }
    req.user = { id: user.id, role: user.role, orgId: user.orgId };
    next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { authenticate };
