const router = require('express').Router();
const { body } = require('express-validator');
const controller = require('../controllers/publicRegistrationController');
const { validate } = require('../middleware/validate');

router.get('/organizations', controller.listOrganizations);
router.post('/organizations', [
  body('name').trim().notEmpty(),
  body('admin.firstName').trim().notEmpty(),
  body('admin.lastName').trim().notEmpty(),
  body('admin.email').isEmail().normalizeEmail(),
  body('admin.password').isLength({ min: 8 }),
  body('allowDeviceCheckIn').optional().isBoolean().toBoolean(),
  body('allowManualCheckIn').optional().isBoolean().toBoolean(),
  body('hasStudents').optional().isBoolean().toBoolean(),
], validate, controller.createOrganization);
router.post('/employees', controller.uploadEmployeePhoto, [
  body('firstName').trim().notEmpty(),
  body('lastName').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
], validate, controller.createEmployee);

module.exports = router;
