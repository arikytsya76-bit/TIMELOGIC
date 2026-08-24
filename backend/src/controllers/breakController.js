const BreakService = require('../services/BreakService');
const { prisma } = require('../config/database');
const { dayBounds } = require('../utils/attendanceClock');

const startBreak = async (req, res, next) => {
  try {
    const { breakType, notes } = req.body;
    const record = await BreakService.startBreak(req.user.id, breakType, notes);
    res.status(201).json({ success: true, data: record });
  } catch (err) { next(err); }
};

const startBreakForEmployee = async (req, res, next) => {
  try {
    const employee = await prisma.user.findFirst({
      where: { id: req.params.employeeId, orgId: req.user.orgId, role: 'EMPLOYEE', status: { not: 'TERMINATED' } },
      select: { id: true },
    });
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });
    const { breakType, notes } = req.body;
    const record = await BreakService.startBreakForEmployee(employee.id, breakType, notes || `Started by admin ${req.user.id}`);
    res.status(201).json({ success: true, data: record });
  } catch (err) { next(err); }
};

const endBreak = async (req, res, next) => {
  try {
    const { wifiSSID } = req.body;
    const record = await BreakService.endBreak(req.user.id, req.params.breakId, { wifiSSID });
    res.json({ success: true, data: record });
  } catch (err) { next(err); }
};

const getActiveBreak = async (req, res, next) => {
  try {
    const record = await BreakService.getActiveBreak(req.user.id);
    res.json({ success: true, data: record });
  } catch (err) { next(err); }
};

const getDailyBreaks = async (req, res, next) => {
  try {
    const { date } = req.query;

    if (req.params.employeeId) {
      const employee = await prisma.user.findFirst({
        where: { id: req.params.employeeId, orgId: req.user.orgId, role: 'EMPLOYEE' }, select: { id: true },
      });
      if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });
      // Specific employee — verify they belong to admin's org first
      const records = await BreakService.getDailyBreaks(req.params.employeeId, date);
      return res.json({ success: true, data: BreakService.withLifecycleStatus(records) });
    }

    // Admin requesting all employees' breaks for today → scope to their org
    if (req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN') {
      const organization = await prisma.organization.findUnique({
        where: { id: req.user.orgId }, select: { timezone: true },
      });
      const requested = date && /^\d{4}-\d{2}-\d{2}$/.test(String(date))
        ? new Date(`${date}T12:00:00.000Z`)
        : date ? new Date(date) : new Date();
      const bounds = dayBounds(requested, organization?.timezone || 'Africa/Lagos');

      const records = await prisma.breakRecord.findMany({
        where: {
          employee: { orgId: req.user.orgId },
          startTime: { gte: bounds.start, lt: bounds.end },
        },
        include: {
          employee: {
            select: {
              id: true, firstName: true, lastName: true,
              employeeCode: true,
              organization: { select: { timezone: true } },
              department: { select: { name: true, breakPolicy: true } },
            },
          },
        },
        orderBy: { startTime: 'desc' },
      });

      return res.json({ success: true, data: records });
    }

    // Employee requesting their own breaks
    const records = await BreakService.getDailyBreaks(req.user.id, date);
    res.json({ success: true, data: records });
  } catch (err) { next(err); }
};

module.exports = { startBreak, startBreakForEmployee, endBreak, getActiveBreak, getDailyBreaks };
