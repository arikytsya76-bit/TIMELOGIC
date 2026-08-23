const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');

router.post('/login', authLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  body().custom((body) => {
    if (!body.email) throw new Error('Email is required');
    return true;
  }),
], validate, ctrl.login);

router.post('/logout',          authenticate, ctrl.logout);
router.post('/refresh',         [body('refreshToken').notEmpty()], validate, ctrl.refresh);
router.get('/me',               authenticate, ctrl.me);
router.put('/change-password',  authenticate, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }),
], validate, ctrl.changePassword);

module.exports = router;
