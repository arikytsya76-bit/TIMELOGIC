const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/superAdminController');
const { authenticate } = require('../middleware/auth');
const { isSuperAdmin } = require('../middleware/roleGuard');
const { validate } = require('../middleware/validate');
const { isValidTimeZone } = require('../utils/attendanceClock');

const organizationPolicyValidators = [
  body('allowDeviceCheckIn').optional().isBoolean().toBoolean(),
  body('allowManualCheckIn').optional().isBoolean().toBoolean(),
  body('hasStudents').optional().isBoolean().toBoolean(),
  body('openingTime').optional().matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/).withMessage('openingTime must use HH:mm'),
  body('timezone').optional().custom((value) => {
    if (!isValidTimeZone(value)) throw new Error('Invalid organization timezone');
    return true;
  }),
  body('offices.*.openTime').optional().matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  body('offices.*.closeTime').optional().matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  body('offices.*.timezone').optional().custom((value) => {
    if (!isValidTimeZone(value)) throw new Error('Invalid office timezone');
    return true;
  }),
  body('offices.*.graceMinutes').optional().isInt({ min: 0 }),
  body('offices.*.lateAfterMinutes').optional().isInt({ min: 1 }).withMessage('lateAfterMinutes must be at least 1 minute'),
  body('offices.*.gracePenalty').optional().isInt({ min: 0 }),
  body('offices.*.latePenalty').optional().isInt({ min: 0 }),
  body('offices').optional().custom((offices) => {
    for (const office of offices || []) {
      if (Number(office.lateAfterMinutes ?? 90) < Number(office.graceMinutes ?? 30)) {
        throw new Error('Each office late-after threshold must be greater than or equal to its grace period');
      }
    }
    return true;
  }),
];

// All routes require authentication + SUPER_ADMIN role
router.use(authenticate, isSuperAdmin);

router.get('/stats',                             ctrl.systemStats);
router.get('/notifications',                     ctrl.getNotifications);
router.get('/organizations',                     ctrl.listOrgs);
router.post('/organizations', [
  body('name').notEmpty().withMessage('Organization name is required'),
  body('admin.firstName').trim().notEmpty().withMessage('Admin first name is required'),
  body('admin.lastName').trim().notEmpty().withMessage('Admin last name is required'),
  body('admin.email').isEmail().normalizeEmail().withMessage('Valid admin email required'),
  body('admin.password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ...organizationPolicyValidators,
], validate, ctrl.createOrg);
router.put('/organizations/:id', [
  body('name').optional().trim().notEmpty(),
  ...organizationPolicyValidators,
], validate, ctrl.updateOrg);
router.delete('/organizations/:id',              ctrl.deleteOrg);
router.get('/organizations/:id/users',           ctrl.orgUsers);
router.get('/organizations/:id/leave-policy',    ctrl.getLeavePolicy);
router.put('/organizations/:id/leave-policy',    ctrl.setLeavePolicy);
router.post('/organizations/:orgId/departments', [
  body('name').notEmpty().withMessage('Department name is required'),
], validate, ctrl.addDepartment);
router.get('/offices/:officeId/security',        ctrl.officeSecurityDetail);
router.put('/offices/:officeId/settings',        ctrl.updateOfficeSecurity);
router.get('/reports',                           ctrl.systemReport);
router.get('/employees/:userId/records',         ctrl.employeeFullRecord);
router.put('/employees/:userId/reemploy',        ctrl.reemployEmployee);

// User management: suspend/activate ADMINS only; reassign EMPLOYEES only
router.put('/profile',                           ctrl.updateProfile);
router.post('/reset',                            ctrl.resetSystem);
router.put('/users/:userId/suspend',             ctrl.suspendAdmin);
router.put('/users/:userId/activate',            ctrl.activateAdmin);
router.put('/users/:userId/reassign',            ctrl.reassignEmployee);

module.exports = router;
