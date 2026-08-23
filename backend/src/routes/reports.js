const router = require('express').Router();
const ctrl = require('../controllers/reportController');
const { authenticate } = require('../middleware/auth');
const { isAdmin } = require('../middleware/roleGuard');

router.get('/server-time', authenticate, isAdmin, ctrl.serverTime);
router.get('/live-stats', authenticate, isAdmin, ctrl.liveStats);
router.get('/daily', authenticate, isAdmin, ctrl.daily);
router.get('/weekly', authenticate, isAdmin, ctrl.weekly);
router.get('/monthly', authenticate, isAdmin, ctrl.monthly);
router.get('/custom', authenticate, isAdmin, ctrl.custom);
router.get('/by-department', authenticate, isAdmin, ctrl.byDepartment);
router.get('/by-employee', authenticate, isAdmin, ctrl.byEmployee);
router.get('/export/excel', authenticate, isAdmin, ctrl.exportExcel);
router.get('/export/csv', authenticate, isAdmin, ctrl.exportCSV);

module.exports = router;
