const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const logger = require('../config/logger');

let io;

function initIO(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || origin === 'null' || env.isAllowedFrontendOrigin(origin)) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // JWT auth guard for socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    if (!token) return next(new Error('No token'));
    try {
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
      socket.user = { id: payload.sub, role: payload.role, orgId: payload.orgId };
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const { id, role, orgId } = socket.user;
    logger.debug(`Socket connected: user=${id} role=${role}`);

    // Users join their org room automatically; admins also join the admin room
    socket.join(`user:${id}`);
    socket.join(`org:${orgId}`);
    if (['ADMIN', 'SUPER_ADMIN'].includes(role)) {
      socket.join(`admin:${orgId}`);
    }

    // Employee can join a specific session room to receive QR updates
    socket.on('session:join', (sessionId) => {
      socket.join(`session:${sessionId}`);
      logger.debug(`User ${id} joined session room ${sessionId}`);
    });

    socket.on('session:leave', (sessionId) => {
      socket.leave(`session:${sessionId}`);
    });

    socket.on('disconnect', (reason) => {
      logger.debug(`Socket disconnected: user=${id} reason=${reason}`);
    });
  });

  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.io not initialised yet');
  return io;
}

// Helpers used by services to target specific rooms
function emitToOrg(orgId, event, data)     { io?.to(`org:${orgId}`).emit(event, data); }
function emitToAdmins(orgId, event, data)  { io?.to(`admin:${orgId}`).emit(event, data); }
function emitToSession(sessionId, event, data) { io?.to(`session:${sessionId}`).emit(event, data); }
function emitToUser(userId, event, data)   { io?.to(`user:${userId}`).emit(event, data); }

module.exports = { initIO, getIO, emitToOrg, emitToAdmins, emitToSession, emitToUser };
