const SessionService = require('../services/SessionService');
const QRTokenService = require('../services/QRTokenService');
const { prisma } = require('../config/database');

const createSession = async (req, res, next) => {
  try {
    let body = { ...req.body };
    // Auto-resolve officeId from the admin's org if not provided
    if (!body.officeId) {
      const office = await prisma.office.findFirst({ where: { orgId: req.user.orgId }, select: { id: true } });
      if (!office) return res.status(400).json({ success: false, message: 'No office found for this organization. Create an office first.' });
      body.officeId = office.id;
    }
    const session = await SessionService.createSession(req.user.id, body);
    res.status(201).json({ success: true, data: session });
  } catch (err) { next(err); }
};

const startSession = async (req, res, next) => {
  try {
    const result = await SessionService.startSession(req.params.id, req.user.orgId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const pauseSession = async (req, res, next) => {
  try {
    const session = await SessionService.pauseSession(req.params.id, req.user.orgId);
    res.json({ success: true, data: session });
  } catch (err) { next(err); }
};

const resumeSession = async (req, res, next) => {
  try {
    const result = await SessionService.resumeSession(req.params.id, req.user.orgId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const endSession = async (req, res, next) => {
  try {
    const session = await SessionService.endSession(req.params.id, req.user.orgId);
    res.json({ success: true, data: session });
  } catch (err) { next(err); }
};

const lockSession = async (req, res, next) => {
  try {
    const session = await SessionService.lockSession(req.params.id, req.user.orgId);
    res.json({ success: true, data: session });
  } catch (err) { next(err); }
};

const getLiveStatus = async (req, res, next) => {
  try {
    const status = await SessionService.getLiveStatus(req.params.id, req.user.orgId);
    res.json({ success: true, data: status });
  } catch (err) { next(err); }
};

const forceRefreshQR = async (req, res, next) => {
  try {
    const token = await SessionService.forceRefreshQR(req.params.id, req.user.orgId);
    res.json({ success: true, data: token });
  } catch (err) { next(err); }
};

const getActiveSessions = async (req, res, next) => {
  try {
    const { officeId } = req.query;
    // Always scope sessions to the admin's org — critical for multi-tenant isolation
    const sessions = await SessionService.getActiveSessions(officeId, req.user.orgId);
    res.json({ success: true, data: sessions });
  } catch (err) { next(err); }
};

const getQRImage = async (req, res, next) => {
  try {
    const { image, expiresIn } = await SessionService.getCurrentQRImage(req.params.id, req.user.orgId);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('X-QR-Expires-In', expiresIn);
    res.send(image);
  } catch (err) { next(err); }
};

module.exports = { createSession, startSession, pauseSession, resumeSession, endSession, lockSession, getLiveStatus, forceRefreshQR, getActiveSessions, getQRImage };
