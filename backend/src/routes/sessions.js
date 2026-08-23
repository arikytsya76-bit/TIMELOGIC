const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/sessionController');
const { authenticate } = require('../middleware/auth');
const { isAdmin } = require('../middleware/roleGuard');
const { validate } = require('../middleware/validate');

router.post('/', authenticate, isAdmin, [
  body('sessionName').notEmpty().withMessage('Session name is required'),
  // officeId is optional — controller auto-resolves from the admin's org if not provided
  body('officeId').optional({ nullable: true }),
  body('startTime').optional().isISO8601(),
], validate, ctrl.createSession);

router.get('/', authenticate, isAdmin, ctrl.getActiveSessions);

router.post('/:id/start',      authenticate, isAdmin, ctrl.startSession);
router.post('/:id/pause',      authenticate, isAdmin, ctrl.pauseSession);
router.post('/:id/resume',     authenticate, isAdmin, ctrl.resumeSession);
router.post('/:id/end',        authenticate, isAdmin, ctrl.endSession);
router.post('/:id/lock',       authenticate, isAdmin, ctrl.lockSession);
router.post('/:id/refresh-qr', authenticate, isAdmin, ctrl.forceRefreshQR);

router.get('/:id/status', authenticate, isAdmin, ctrl.getLiveStatus);
router.get('/:id/qr',     authenticate, ctrl.getQRImage);

module.exports = router;
