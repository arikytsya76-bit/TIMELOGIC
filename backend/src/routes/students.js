const router = require('express').Router();
const { body, param, query } = require('express-validator');
const controller = require('../controllers/studentController');
const { authenticate } = require('../middleware/auth');
const { isAdmin } = require('../middleware/roleGuard');
const { validate } = require('../middleware/validate');
const { stationLimiter } = require('../middleware/rateLimiter');

router.use(authenticate, isAdmin);

router.get('/', [
  query('status').optional().isIn(['ACTIVE', 'INACTIVE', 'ALL']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 200 }),
], validate, controller.list);
router.get('/history', [query('studentId').optional().isUUID()], validate, controller.history);

router.post('/', [
  body('firstName').trim().notEmpty(),
  body('lastName').trim().notEmpty(),
  body('studentCode').trim().notEmpty(),
  body('className').optional({ nullable: true }).isString(),
  body('status').optional().isIn(['ACTIVE', 'INACTIVE']),
], validate, controller.create);

router.put('/:studentId', [
  param('studentId').isUUID(),
  body('firstName').optional().trim().notEmpty(),
  body('lastName').optional().trim().notEmpty(),
  body('studentCode').optional().trim().notEmpty(),
  body('className').optional({ nullable: true }).isString(),
  body('status').optional().isIn(['ACTIVE', 'INACTIVE']),
], validate, controller.update);

router.delete('/:studentId', [param('studentId').isUUID()], validate, controller.archive);
router.post('/:studentId/check-in', stationLimiter, [param('studentId').isUUID()], validate, controller.checkIn);
router.post('/:studentId/check-out', stationLimiter, [param('studentId').isUUID()], validate, controller.checkOut);

module.exports = router;
