const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/adminController');
const { authenticate } = require('../middleware/auth');
const { isAdmin, isSuperAdmin } = require('../middleware/roleGuard');
const { validate } = require('../middleware/validate');
const upload = require('../middleware/upload');
const { prisma } = require('../config/database');
const { stationLimiter } = require('../middleware/rateLimiter');
const studentRoutes = require('./students');

// Secure employee station. The admin session must already be authenticated;
// the employee then confirms their own password for each manual action.
router.get('/manual-attendance', authenticate, isAdmin, ctrl.getManualAttendance);
router.post('/manual-attendance/check-in', authenticate, isAdmin, stationLimiter, [
  body('employeeId').isUUID(),
  body('sessionId').isUUID(),
  body('password').notEmpty(),
], validate, ctrl.manualCheckIn);
router.post('/manual-attendance/check-out', authenticate, isAdmin, stationLimiter, [
  body('employeeId').isUUID(),
  body('sessionId').optional({ nullable: true }).isUUID(),
  body('password').notEmpty(),
], validate, ctrl.manualCheckOut);

// Organisation
router.get('/org', authenticate, isAdmin, ctrl.getOrg);
router.put('/org', authenticate, isSuperAdmin, ctrl.updateOrg);

// Offices
router.post('/offices', authenticate, isSuperAdmin, [
  body('name').notEmpty(),
  body('timezone').notEmpty(),
], validate, ctrl.createOffice);

// Get org plan info (subscription tier + employee counts)
router.get('/plan', authenticate, isAdmin, async (req, res, next) => {
  try {
    const [org, active, total] = await Promise.all([
      prisma.organization.findUnique({ where: { id: req.user.orgId }, select: { subscriptionTier: true, name: true } }),
      prisma.user.count({ where: { orgId: req.user.orgId, role: 'EMPLOYEE', status: { not: 'TERMINATED' } } }),
      prisma.user.count({ where: { orgId: req.user.orgId, role: 'EMPLOYEE' } }),
    ]);
    const tier = (org?.subscriptionTier ?? 'starter').toLowerCase();
    const limits = { starter: 20, business: 60, enterprise: null };
    res.json({
      success: true,
      data: {
        plan: tier,
        planName: tier.charAt(0).toUpperCase() + tier.slice(1),
        limit: limits[tier] ?? 20,
        activeEmployees: active,
        totalEmployees: total,
        canAddMore: limits[tier] === null || active < (limits[tier] ?? 20),
      },
    });
  } catch (err) { next(err); }
});

// Departments
router.post('/departments', authenticate, isAdmin, [
  body('name').notEmpty(),
], validate, ctrl.createDepartment);

// Users / Employees
router.get('/users', authenticate, isAdmin, ctrl.listUsers);
router.put('/users/:userId', authenticate, isAdmin, [
  body('checkInMethod').optional().isIn(['PHONE', 'MANUAL', 'BOTH']),
  body('phone').optional({ nullable: true }).isString(),
], validate, ctrl.updateUser);
router.get('/users/:userId/summary', authenticate, isAdmin, ctrl.employeeSummary);
router.put('/users/:userId/suspend', authenticate, isAdmin, ctrl.suspendUser);
router.post('/users/:userId/reset-device', authenticate, isAdmin, ctrl.resetDevice);
router.delete('/users/:userId', authenticate, isAdmin, ctrl.deleteEmployee);

// ─── Face photo upload ──────────────────────────────────────────────────────
// POST /api/admin/users/:userId/face  (multipart/form-data, field: photo)
router.post('/users/:userId/face',
  authenticate,
  isAdmin,
  async (req, res, next) => {
    try {
      const employee = await prisma.user.findFirst({
        where: { id: req.params.userId, orgId: req.user.orgId, role: 'EMPLOYEE' },
        select: { id: true },
      });
      if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });
      next();
    } catch (err) { next(err); }
  },
  upload.single('photo'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No photo received. Make sure the field name is "photo".' });
      }
      const url = `/uploads/faces/${req.file.filename}`;
      const user = await prisma.user.update({
        where: { id: req.params.userId },
        data: { profileImageUrl: url },
        select: { id: true, firstName: true, lastName: true, profileImageUrl: true },
      });
      res.json({ success: true, data: user });
    } catch (err) { next(err); }
  }
);

// Security settings — admins may VIEW, but only SUPER_ADMIN may edit (Wi-Fi, geo, schedule)
router.get('/offices/:officeId/settings', authenticate, isAdmin, ctrl.getSecuritySettings);
router.put('/offices/:officeId/settings', authenticate, isSuperAdmin, ctrl.updateSecuritySettings);

// Break policy
router.put('/departments/:departmentId/break-policy', authenticate, isAdmin, ctrl.setBreakPolicy);
router.post('/breaks/:employeeId/start', authenticate, isAdmin, [
  body('breakType').isIn(['LUNCH', 'SHORT_BREAK', 'PRAYER', 'PERSONAL', 'NURSING']),
], validate, require('../controllers/breakController').startBreakForEmployee);
router.put('/breaks/:employeeId/:breakId/end', authenticate, isAdmin, require('../controllers/breakController').endBreakForEmployee);

// Emergency
router.post('/emergency/stop-all', authenticate, isAdmin, [
  body('reason').notEmpty(),
  body('officeId').optional({ checkFalsy: true }).isUUID(),
], validate, ctrl.emergencyStopAll);

router.post('/emergency/lock-system', authenticate, isSuperAdmin, [
  body('reason').notEmpty(),
], validate, ctrl.emergencyLockSystem);

router.post('/emergency/invalidate-qr', authenticate, isAdmin, [
  body('reason').notEmpty(),
], validate, ctrl.emergencyInvalidateQR);

router.post('/emergency/:controlId/revert', authenticate, isAdmin, ctrl.emergencyRevert);

// Notifications
router.get('/notifications', authenticate, isAdmin, ctrl.getNotifications);

// Create an employee user
router.post('/employees', authenticate, isAdmin, [
  body('firstName').notEmpty(),
  body('lastName').notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('checkInMethod').optional().isIn(['PHONE', 'MANUAL', 'BOTH']),
  body('phone').optional({ nullable: true }).isString(),
], validate, ctrl.createEmployee);

router.use('/students', studentRoutes);

module.exports = router;
