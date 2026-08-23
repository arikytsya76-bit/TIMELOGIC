const AuthService = require('../services/AuthenticationService');
const { prisma } = require('../config/database');

const login = async (req, res, next) => {
  try {
    const { email, password, deviceFingerprint } = req.body;
    const result = await AuthService.login(email, password, deviceFingerprint, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    await AuthService.logout(req.user.id, refreshToken);
    res.json({ success: true, message: 'Logged out' });
  } catch (err) { next(err); }
};

const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const result = await AuthService.refreshAccessToken(refreshToken);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const me = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, firstName: true, lastName: true, email: true,
        role: true, status: true, shiftType: true,
        checkInMethod: true, phone: true,
        profileImageUrl: true, employeeCode: true,
        departmentId: true, orgId: true, lastLoginAt: true, createdAt: true,
        department: { select: { name: true } },
        organization: {
          select: {
            id: true, name: true, allowDeviceCheckIn: true, allowManualCheckIn: true,
            hasStudents: true, openingTime: true, timezone: true,
          },
        },
      },
    });
    if (!user) {
      return res.status(401).json({ success: false, message: 'User unavailable' });
    }
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
};

const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    await AuthService.changePassword(req.user.id, currentPassword, newPassword);
    res.json({ success: true, message: 'Password changed' });
  } catch (err) { next(err); }
};

module.exports = { login, logout, refresh, me, changePassword };
