const ReportService = require('../services/ReportService');
const { getCurrentServerTime } = require('../utils/networkTime');
const { dateKey, zonedParts } = require('../utils/attendanceClock');

const LAGOS_TZ = 'Africa/Lagos';

function formatLagosDate(date) {
  return dateKey(date, LAGOS_TZ);
}

const serverTime = async (req, res, next) => {
  try {
    const now = await getCurrentServerTime();
    res.json({
      success: true,
      data: {
        now: now.toISOString(),
        iso: now.toISOString(),
        timezone: LAGOS_TZ,
        localTime: new Intl.DateTimeFormat('en-GB', {
          timeZone: LAGOS_TZ,
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        }).format(now),
        utcString: now.toUTCString(),
      },
    });
  } catch (err) { next(err); }
};

const daily = async (req, res, next) => {
  try {
    const { date } = req.query;
    const result = await ReportService.generateDaily(date || await getCurrentServerTime(), req.user.id, req.user.orgId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const weekly = async (req, res, next) => {
  try {
    // Default weekStart to the most recent Monday
    const now = await getCurrentServerTime();
    const local = zonedParts(now, LAGOS_TZ);
    const dayOfWeek = new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay();
    const monday = new Date(Date.UTC(local.year, local.month - 1, local.day - (dayOfWeek === 0 ? 6 : dayOfWeek - 1)));
    const weekStart = req.query.weekStart || dateKey(monday, 'UTC');
    const result = await ReportService.generateWeekly(weekStart, req.user.id, req.user.orgId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const monthly = async (req, res, next) => {
  try {
    // Default to current month/year when not provided
    const now = await getCurrentServerTime();
    const local = zonedParts(now, LAGOS_TZ);
    const year  = req.query.year  ? +req.query.year  : local.year;
    const month = req.query.month ? +req.query.month : local.month;
    const result = await ReportService.generateMonthly(year, month, req.user.id, req.user.orgId);
    const records = result.records ?? [];
    const departmentMap = new Map();
    for (const record of records) {
      const department = record.employee?.department?.name || 'No department';
      const current = departmentMap.get(department) ?? { department, total: 0, attended: 0 };
      current.total += 1;
      if (record.status === 'PRESENT' || record.status === 'LATE') current.attended += 1;
      departmentMap.set(department, current);
    }
    const report = result.report ?? {};
    res.json({ success: true, data: {
      ...result,
      totalPresent: report.totalPresent ?? records.filter((record) => record.status === 'PRESENT').length,
      totalLate: report.totalLate ?? records.filter((record) => record.status === 'LATE').length,
      totalAbsent: report.totalAbsent ?? records.filter((record) => record.status === 'ABSENT').length,
      avgWorkHours: report.averageWorkHours ?? 0,
      period: `${year}-${String(month).padStart(2, '0')}`,
      departmentStats: [...departmentMap.values()].map((item) => ({
        department: item.department,
        attendanceRate: item.total ? Math.round((item.attended / item.total) * 100) : 0,
      })),
    } });
  } catch (err) { next(err); }
};

const custom = async (req, res, next) => {
  try {
    const now = await getCurrentServerTime();
    const local = zonedParts(now, LAGOS_TZ);
    const startDate = req.query.startDate || `${local.year}-${String(local.month).padStart(2, '0')}-01`;
    const endDate   = req.query.endDate   || dateKey(now, LAGOS_TZ);
    const result = await ReportService.generateCustom(startDate, endDate, req.user.id, req.user.orgId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const byDepartment = async (req, res, next) => {
  try {
    const { departmentId, startDate, endDate } = req.query;
    const result = await ReportService.generateByDepartment(departmentId, startDate, endDate, req.user.id, req.user.orgId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const byEmployee = async (req, res, next) => {
  try {
    const { employeeId, startDate, endDate } = req.query;
    const result = await ReportService.generateByEmployee(employeeId, startDate, endDate, req.user.id, req.user.orgId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const exportExcel = async (req, res, next) => {
  try {
    const today = formatLagosDate(await getCurrentServerTime());
    // Super Admin (platform-org) gets ALL orgs; regular admin gets only their org
    const exportOrgId = req.user.role === 'SUPER_ADMIN' ? null : req.user.orgId;
    const buffer = await ReportService.exportFullToExcel(exportOrgId);
    const prefix = req.user.role === 'SUPER_ADMIN' ? 'all-orgs' : 'org';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${prefix}-full-report-${today.replaceAll('/', '-')}.xlsx"`);
    res.send(buffer);
  } catch (err) { next(err); }
};

const exportCSV = async (req, res, next) => {
  try {
    const today = formatLagosDate(await getCurrentServerTime());
    const exportOrgId = req.user.role === 'SUPER_ADMIN' ? null : req.user.orgId;
    const csv = await ReportService.exportFullToCSV(exportOrgId);
    const prefix = req.user.role === 'SUPER_ADMIN' ? 'all-orgs' : 'org';
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${prefix}-full-report-${today.replaceAll('/', '-')}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
};

const liveStats = async (req, res, next) => {
  try {
    const stats = await ReportService.getDashboardLiveStats(req.user.orgId);
    res.json({ success: true, data: stats });
  } catch (err) { next(err); }
};

module.exports = { serverTime, daily, weekly, monthly, custom, byDepartment, byEmployee, exportExcel, exportCSV, liveStats };
