const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { prisma } = require('../config/database');
const { redis, PREFIXES } = require('../config/redis');
const env = require('../config/env');
const logger = require('../config/logger');
const { getCurrentServerTime } = require('../utils/networkTime');
const EmployeePolicy = require('./EmployeePolicyService');

class AuthenticationService {
  async login(identifier, password, deviceFingerprint = null, context = {}) {
    // Authentication uses email only; employee codes are organization-scoped display identifiers.
    const normalizedIdentifier = String(identifier || '').trim();
    const user = await prisma.user.findUnique({ where: { email: normalizedIdentifier.toLowerCase() } });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw Object.assign(new Error('Invalid credentials'), { status: 401 });
    }

    if (user.status !== 'ACTIVE') {
      throw Object.assign(new Error(`Account is ${user.status.toLowerCase()}`), { status: 403 });
    }

    // Tenant isolation: every login is bound to exactly one organization. A user
    // can only ever authenticate into their OWN org (orgId is fixed on the user
    // and carried in the JWT); they can never act inside another organization.
    const org = await prisma.organization.findUnique({
      where: { id: user.orgId },
      select: {
        id: true, name: true, allowDeviceCheckIn: true, allowManualCheckIn: true,
        hasStudents: true, openingTime: true, timezone: true,
      },
    });
    if (!org) {
      throw Object.assign(new Error('Your organization is no longer active.'), { status: 403 });
    }

    // ── Device binding (employees only): one phone per employee, locked ──
    if (user.role === 'EMPLOYEE') {
      EmployeePolicy.assertChannelAllowed(org, user.checkInMethod, 'PHONE');
      if (!deviceFingerprint) {
        throw Object.assign(
          new Error('A registered device is required for employee sign-in.'),
          { status: 400, code: 'DEVICE_REQUIRED' }
        );
      }
      // 1. Is this phone already bound to a DIFFERENT employee?
      const boundElsewhere = await prisma.registeredDevice.findFirst({
        where: { deviceFingerprint, isActive: true, employeeId: { not: user.id } },
        select: { id: true },
      });
      if (boundElsewhere) {
        throw Object.assign(
          new Error('This phone is already registered to another employee and cannot be used to sign in.'),
          { status: 403, code: 'DEVICE_TAKEN' }
        );
      }

      // 2. Does this employee already have a registered phone?
      const mine = await prisma.registeredDevice.findFirst({
        where: { employeeId: user.id, isActive: true },
        orderBy: { registeredAt: 'asc' },
      });
      if (mine) {
        if (mine.deviceFingerprint !== deviceFingerprint) {
          throw Object.assign(
            new Error('Your account is locked to your registered phone. You cannot sign in from a different device. Contact your admin to reset it.'),
            { status: 403, code: 'DEVICE_MISMATCH' }
          );
        }
        await prisma.registeredDevice.update({ where: { id: mine.id }, data: { lastUsedAt: new Date() } });
      } else {
        // 3. First sign-in on this account → bind this phone permanently
        await prisma.registeredDevice.create({
          data: { id: uuidv4(), employeeId: user.id, deviceFingerprint, platform: 'mobile', isActive: true, lastUsedAt: new Date() },
        });
        logger.info(`Device bound: employee ${user.id} -> ${deviceFingerprint.slice(0, 12)}…`);
      }
    }

    const loginAt = await getCurrentServerTime();
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: loginAt } });

    let adminLogin = null;
    if (user.role === 'ADMIN') {
      adminLogin = await require('./AttendanceService').recordAdminLogin(user.id, loginAt, {
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
    }

    const accessToken = this._signAccess(user);
    const refreshToken = await this._createRefreshToken(user.id);

    return {
      accessToken, refreshToken,
      user: { ...this._safeUser(user), lastLoginAt: loginAt, organization: org },
      adminLogin,
    };
  }

  async logout(userId, refreshToken) {
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { userId, token: refreshToken } });
    }
    await redis.del(`${PREFIXES.SOCKET}${userId}`);
  }

  async refreshAccessToken(rawRefreshToken) {
    let payload;
    try {
      payload = jwt.verify(rawRefreshToken, env.JWT_REFRESH_SECRET);
    } catch {
      throw Object.assign(new Error('Invalid refresh token'), { status: 401 });
    }
    const stored = await prisma.refreshToken.findUnique({ where: { token: rawRefreshToken } });
    if (
      !stored ||
      stored.expiresAt < new Date() ||
      stored.userId !== payload.sub ||
      stored.id !== payload.jti
    ) {
      throw Object.assign(new Error('Refresh token expired or revoked'), { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'ACTIVE') {
      throw Object.assign(new Error('User unavailable'), { status: 401 });
    }

    if (user.role === 'EMPLOYEE') {
      const org = await EmployeePolicy.getOrganizationPolicy(user.orgId);
      EmployeePolicy.assertChannelAllowed(org, user.checkInMethod, 'PHONE');
    }

    const accessToken = this._signAccess(user);
    return { accessToken };
  }

  async registerDevice(userId, deviceData) {
    const { deviceFingerprint, platform, model, osVersion, appVersion } = deviceData;

    const settings = await this._getOrgSettings(userId);
    const maxDevices = settings?.maxDevicesPerEmployee ?? 2;

    const activeCount = await prisma.registeredDevice.count({
      where: { employeeId: userId, isActive: true },
    });

    if (activeCount >= maxDevices) {
      throw Object.assign(
        new Error(`Maximum ${maxDevices} devices allowed per employee`),
        { status: 409 }
      );
    }

    const existing = await prisma.registeredDevice.findFirst({
      where: { employeeId: userId, deviceFingerprint },
    });

    if (existing) {
      return prisma.registeredDevice.update({
        where: { id: existing.id },
        data: { isActive: true, platform, model, osVersion, appVersion, lastUsedAt: new Date() },
      });
    }

    return prisma.registeredDevice.create({
      data: { id: uuidv4(), employeeId: userId, deviceFingerprint, platform, model, osVersion, appVersion },
    });
  }

  async verifyDevice(userId, deviceFingerprint) {
    const device = await prisma.registeredDevice.findFirst({
      where: { employeeId: userId, deviceFingerprint, isActive: true },
    });
    return !!device;
  }

  async deactivateDevice(userId, deviceId) {
    await prisma.registeredDevice.updateMany({
      where: { id: deviceId, employeeId: userId },
      data: { isActive: false },
    });
  }

  async resetPassword(email) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return; // silent — don't reveal existence
    logger.info(`Password reset requested for ${email}`);
    // TODO: integrate email service when SMTP is configured
  }

  async changePassword(userId, currentPassword, newPassword) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw Object.assign(new Error('Current password is incorrect'), { status: 400 });
    }
    const hash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } });
    await prisma.refreshToken.deleteMany({ where: { userId } });
  }

  // ── helpers ──────────────────────────────────────────────────────────────────

  _signAccess(user) {
    return jwt.sign(
      { sub: user.id, role: user.role, orgId: user.orgId },
      env.JWT_ACCESS_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRES_IN }
    );
  }

  async _createRefreshToken(userId) {
    const id = uuidv4();
    const token = jwt.sign(
      { sub: userId, jti: id },
      env.JWT_REFRESH_SECRET,
      { expiresIn: env.JWT_REFRESH_EXPIRES_IN }
    );
    const decoded = jwt.decode(token);
    const expiresAt = new Date(decoded.exp * 1000);
    await prisma.refreshToken.create({ data: { id, userId, token, expiresAt } });
    return token;
  }

  _safeUser(user) {
    const { passwordHash, faceEncodingData, ...safe } = user;
    return safe;
  }

  async _getOrgSettings(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { department: { include: { organization: { include: { offices: { include: { securitySettings: true } } } } } } },
    });
    return user?.department?.organization?.offices?.[0]?.securitySettings ?? null;
  }
}

module.exports = new AuthenticationService();
