const router = require('express').Router();
const { body, query } = require('express-validator');
const ctrl = require('../controllers/attendanceController');
const { authenticate } = require('../middleware/auth');
const { isAdmin } = require('../middleware/roleGuard');
const { scanLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');

// Step 1 — validate Wi-Fi, then issue a one-time verification code
router.post('/check-in/challenge', authenticate, scanLimiter, [
  body('sessionId').notEmpty().withMessage('sessionId is required'),
  body('wifiSSID').optional({ nullable: true }).isString(),
  body('deviceId').optional().isString(),
], validate, ctrl.issueChallenge);

// Step 2 — submit check-in with the code + device/wifi context
router.post('/check-in', authenticate, scanLimiter, [
  body('sessionId').notEmpty().withMessage('sessionId is required'),
  body('challengeCode').notEmpty().withMessage('Verification code is required'),
  body('deviceId').optional().isString(),
  body('wifiSSID').optional({ nullable: true }).isString(),
  body('platform').optional().isString(),
  body('model').optional().isString(),
], validate, ctrl.checkIn);

router.post('/check-out', authenticate, [
  // sessionId is optional — the service resolves it from today's record
  body('sessionId').optional().isUUID(),
  body('deviceId').optional().isString(),
  body('wifiSSID').optional({ nullable: true }).isString(),
], validate, ctrl.checkOut);

router.get('/network', authenticate, ctrl.network);
router.post('/heartbeat', authenticate, ctrl.heartbeat);

router.get('/current-session', authenticate, ctrl.getCurrentSession);

router.get('/status', authenticate, ctrl.getStatus);

router.get('/status/:employeeId', authenticate, isAdmin, ctrl.getStatus);

router.get('/live', authenticate, isAdmin, ctrl.getLiveAttendance);

// startDate / endDate are optional — controller defaults to last 30 days
router.get('/history', authenticate, [
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
], validate, ctrl.getHistory);
router.get('/penalties/monthly', authenticate, isAdmin, [query('month').matches(/^\d{4}-(0[1-9]|1[0-2])$/).withMessage('month must use YYYY-MM format')], validate, ctrl.getMonthlyPenalties);

router.get('/history/:employeeId', authenticate, isAdmin, ctrl.getHistory);

router.get('/flagged', authenticate, isAdmin, ctrl.getFlagged);

router.put('/records/:recordId/flag', authenticate, isAdmin, [
  body('reason').optional().default('Manually flagged'),
], validate, ctrl.flagRecord);

router.put('/records/:recordId/approve', authenticate, isAdmin, ctrl.approveRecord);

module.exports = router;
