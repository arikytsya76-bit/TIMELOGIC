const { v4: uuidv4 } = require('uuid');
const { prisma } = require('../config/database');
const NotificationService = require('./NotificationService');

class LeaveService {
  async withLifecycleStatus(leaves) {
    const list = Array.isArray(leaves) ? leaves : [leaves];
    const employeeIds = [...new Set(list.map((leave) => leave.employeeId).filter(Boolean))];
    const today = new Date();
    const returnDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const checkIns = employeeIds.length
      ? await prisma.attendanceRecord.findMany({
          where: { employeeId: { in: employeeIds }, date: { gte: returnDay }, clockInTime: { not: null } },
          select: { employeeId: true },
        })
      : [];
    const checkedIn = new Set(checkIns.map((record) => record.employeeId));
    return list.map((leave) => {
      if (leave.status !== 'APPROVED') return { ...leave, lifecycleStatus: leave.status };
      const end = new Date(leave.endDate);
      end.setHours(23, 59, 59, 999);
      const lifecycleStatus = today <= end ? 'ACTIVE' : checkedIn.has(leave.employeeId) ? 'ENDED' : 'EXTENDED';
      return { ...leave, lifecycleStatus };
    });
  }

  async requestLeave(employeeId, data) {
    const { leaveType, startDate, endDate, reason, attachmentUrls = [] } = data;

    const start = new Date(startDate);
    const end = new Date(endDate);
    const totalDays = this._calcDays(start, end);

    const balance = await prisma.leaveBalance.findFirst({
      where: { employeeId, leaveType, year: start.getFullYear() },
    });

    if (balance) {
      const available = balance.remaining - balance.pending;
      if (totalDays > available) {
        throw Object.assign(
          new Error(`Insufficient ${leaveType} balance. You have ${available} day(s) available.`),
          { status: 400 }
        );
      }
    }

    const conflict = await this.checkConflicts(employeeId, start, end);
    if (conflict) {
      throw Object.assign(new Error('Leave dates overlap with an existing request'), { status: 409 });
    }

    const leave = await prisma.leaveRequest.create({
      data: {
        id: uuidv4(),
        employeeId,
        leaveType,
        startDate: start,
        endDate: end,
        totalDays,
        reason,
        attachmentUrls,
        status: 'PENDING',
      },
    });

    // Update pending balance
    if (balance) {
      await prisma.leaveBalance.update({
        where: { id: balance.id },
        data: { pending: { increment: totalDays } },
      });
    }

    // Notify admins
    const admins = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, status: 'ACTIVE' },
    });
    for (const admin of admins) {
      await NotificationService.notifyAdmin(admin.id, `New leave request from employee ${employeeId}`);
    }

    return leave;
  }

  async approveLeave(adminId, leaveId) {
    const leave = await this._findPendingLeave(leaveId);

    const updated = await prisma.leaveRequest.update({
      where: { id: leaveId },
      data: { status: 'APPROVED', approvedBy: adminId, approvedAt: new Date() },
    });

    await this._adjustBalance(leave.employeeId, leave.leaveType, leave.startDate.getFullYear(), {
      pendingDelta: -leave.totalDays,
      usedDelta: leave.totalDays,
      remainingDelta: -leave.totalDays,
    });

    await NotificationService.notifyEmployee(leave.employeeId, `Your ${leave.leaveType} leave has been approved`);
    return updated;
  }

  async rejectLeave(adminId, leaveId, rejectionReason) {
    const leave = await this._findPendingLeave(leaveId);

    const updated = await prisma.leaveRequest.update({
      where: { id: leaveId },
      data: { status: 'REJECTED', approvedBy: adminId, approvedAt: new Date(), rejectionReason },
    });

    await this._adjustBalance(leave.employeeId, leave.leaveType, leave.startDate.getFullYear(), {
      pendingDelta: -leave.totalDays,
    });

    await NotificationService.notifyEmployee(leave.employeeId, `Your ${leave.leaveType} leave was rejected: ${rejectionReason}`);
    return updated;
  }

  async cancelLeave(employeeId, leaveId) {
    const leave = await prisma.leaveRequest.findFirst({
      where: { id: leaveId, employeeId, status: { in: ['PENDING', 'APPROVED'] } },
    });

    if (!leave) throw Object.assign(new Error('Leave request not found or cannot be cancelled'), { status: 404 });

    const updated = await prisma.leaveRequest.update({
      where: { id: leaveId },
      data: { status: 'CANCELLED' },
    });

    const balanceDelta = leave.status === 'PENDING'
      ? { pendingDelta: -leave.totalDays }
      : { usedDelta: -leave.totalDays, remainingDelta: leave.totalDays };

    await this._adjustBalance(employeeId, leave.leaveType, leave.startDate.getFullYear(), balanceDelta);
    return updated;
  }

  async getBalance(employeeId) {
    const year = new Date().getFullYear();
    return prisma.leaveBalance.findMany({
      where: { employeeId, year },
    });
  }

  async getTeamCalendar(departmentId, month) {
    if (!departmentId) return { department: null, leaves: [] };

    const date = month ? new Date(month) : new Date();
    if (Number.isNaN(date.getTime())) {
      throw Object.assign(new Error('Invalid calendar month'), { status: 400 });
    }
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);

    const dept = await prisma.department.findUnique({
      where: { id: departmentId },
      include: { employees: { select: { id: true, firstName: true, lastName: true } } },
    });

    if (!dept) throw Object.assign(new Error('Department not found'), { status: 404 });

    const empIds = dept.employees.map((e) => e.id);
    const leaves = await prisma.leaveRequest.findMany({
      where: {
        employeeId: { in: empIds },
        status: 'APPROVED',
        startDate: { lte: end },
        endDate: { gte: start },
      },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });

    return { department: dept, leaves: await this.withLifecycleStatus(leaves) };
  }

  async checkConflicts(employeeId, startDate, endDate) {
    const conflict = await prisma.leaveRequest.findFirst({
      where: {
        employeeId,
        status: { in: ['PENDING', 'APPROVED'] },
        OR: [
          { startDate: { lte: endDate }, endDate: { gte: startDate } },
        ],
      },
    });
    return !!conflict;
  }

  // Default entitlement when the organization hasn't customised a leave type.
  static DEFAULT_LEAVE_DAYS = { ANNUAL: 14, SICK: 10, CASUAL: 5, MATERNITY: 90, PATERNITY: 14, UNPAID: 0, COMPASSIONATE: 3 };

  async initBalances(employeeId, year) {
    const leaveTypes = Object.keys(LeaveService.DEFAULT_LEAVE_DAYS);

    // Pull the employee's organization leave policy (Super-Admin configured).
    const emp = await prisma.user.findUnique({ where: { id: employeeId }, select: { orgId: true } });
    const org = emp ? await prisma.organization.findUnique({ where: { id: emp.orgId }, select: { leavePolicy: true } }) : null;
    const policy = (org && org.leavePolicy && typeof org.leavePolicy === 'object') ? org.leavePolicy : {};
    const daysFor = (lt) => {
      const v = policy[lt];
      return (typeof v === 'number' && v >= 0) ? v : LeaveService.DEFAULT_LEAVE_DAYS[lt];
    };

    return Promise.all(
      leaveTypes.map((lt) => {
        const days = daysFor(lt);
        return prisma.leaveBalance.upsert({
          where: { employeeId_leaveType_year: { employeeId, leaveType: lt, year } },
          create: { id: uuidv4(), employeeId, leaveType: lt, year, totalEntitled: days, remaining: days },
          update: {},
        });
      })
    );
  }

  // Re-apply the org's leave policy to ALL its employees' balances for the year
  // (used when the Super Admin changes the policy). Adjusts remaining by the delta.
  async applyPolicyToOrg(orgId, year) {
    const employees = await prisma.user.findMany({
      where: { orgId, role: 'EMPLOYEE', status: { not: 'TERMINATED' } }, select: { id: true },
    });
    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { leavePolicy: true } });
    const policy = (org && org.leavePolicy && typeof org.leavePolicy === 'object') ? org.leavePolicy : {};
    const types = Object.keys(LeaveService.DEFAULT_LEAVE_DAYS);

    for (const e of employees) {
      for (const lt of types) {
        const entitled = (typeof policy[lt] === 'number' && policy[lt] >= 0) ? policy[lt] : LeaveService.DEFAULT_LEAVE_DAYS[lt];
        const bal = await prisma.leaveBalance.findFirst({ where: { employeeId: e.id, leaveType: lt, year } });
        if (!bal) {
          await prisma.leaveBalance.create({ data: { id: uuidv4(), employeeId: e.id, leaveType: lt, year, totalEntitled: entitled, remaining: entitled } });
        } else {
          // remaining = entitled - used - (already pending stays)
          const remaining = Math.max(0, entitled - bal.used);
          await prisma.leaveBalance.update({ where: { id: bal.id }, data: { totalEntitled: entitled, remaining } });
        }
      }
    }
  }

  // ── private ──────────────────────────────────────────────────────────────────

  async _findPendingLeave(leaveId) {
    const leave = await prisma.leaveRequest.findFirst({ where: { id: leaveId, status: 'PENDING' } });
    if (!leave) throw Object.assign(new Error('Leave request not found or not pending'), { status: 404 });
    return leave;
  }

  async _adjustBalance(employeeId, leaveType, year, deltas) {
    const { pendingDelta = 0, usedDelta = 0, remainingDelta = 0 } = deltas;
    const balance = await prisma.leaveBalance.findFirst({ where: { employeeId, leaveType, year } });
    if (!balance) return;

    await prisma.leaveBalance.update({
      where: { id: balance.id },
      data: {
        pending:   { increment: pendingDelta },
        used:      { increment: usedDelta },
        remaining: { increment: remainingDelta },
      },
    });
  }

  _calcDays(start, end) {
    const msPerDay = 86400000;
    return Math.round((end - start) / msPerDay) + 1;
  }
}

module.exports = new LeaveService();
