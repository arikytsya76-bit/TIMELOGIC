const LeaveService = require('../services/LeaveService');

const requestLeave = async (req, res, next) => {
  try {
    const leave = await LeaveService.requestLeave(req.user.id, req.body);
    res.status(201).json({ success: true, data: leave });
  } catch (err) { next(err); }
};

const approveLeave = async (req, res, next) => {
  try {
    const leave = await LeaveService.approveLeave(req.user.id, req.params.leaveId);
    res.json({ success: true, data: leave });
  } catch (err) { next(err); }
};

const rejectLeave = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const leave = await LeaveService.rejectLeave(req.user.id, req.params.leaveId, reason);
    res.json({ success: true, data: leave });
  } catch (err) { next(err); }
};

const cancelLeave = async (req, res, next) => {
  try {
    const leave = await LeaveService.cancelLeave(req.user.id, req.params.leaveId);
    res.json({ success: true, data: leave });
  } catch (err) { next(err); }
};

const getBalance = async (req, res, next) => {
  try {
    const employeeId = req.params.employeeId || req.user.id;
    const balances = await LeaveService.getBalance(employeeId);
    res.json({ success: true, data: balances });
  } catch (err) { next(err); }
};

const getTeamCalendar = async (req, res, next) => {
  try {
    const { departmentId, month } = req.query;
    const result = await LeaveService.getTeamCalendar(departmentId, month);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const getMyLeaves = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (+page - 1) * +limit;
    const { prisma } = require('../config/database');
    const [leaves, total] = await Promise.all([
      prisma.leaveRequest.findMany({
        where: { employeeId: req.user.id, ...(status && { status }) },
        orderBy: { createdAt: 'desc' },
        skip,
        take: +limit,
      }),
      prisma.leaveRequest.count({ where: { employeeId: req.user.id, ...(status && { status }) } }),
    ]);
    res.json({ success: true, data: await LeaveService.withLifecycleStatus(leaves), total, page: +page, totalPages: Math.ceil(total / +limit) });
  } catch (err) { next(err); }
};

const getPendingLeaves = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (+page - 1) * +limit;
    const { prisma } = require('../config/database');
    const [leaves, total] = await Promise.all([
      prisma.leaveRequest.findMany({
        where: { status: 'PENDING', employee: { orgId: req.user.orgId } },
        include: { employee: { select: { firstName: true, lastName: true, departmentId: true } } },
        orderBy: { createdAt: 'asc' },
        skip,
        take: +limit,
      }),
      prisma.leaveRequest.count({ where: { status: 'PENDING', employee: { orgId: req.user.orgId } } }),
    ]);
    res.json({ success: true, data: leaves, total, page: +page, totalPages: Math.ceil(total / +limit) });
  } catch (err) { next(err); }
};

module.exports = { requestLeave, approveLeave, rejectLeave, cancelLeave, getBalance, getTeamCalendar, getMyLeaves, getPendingLeaves };
