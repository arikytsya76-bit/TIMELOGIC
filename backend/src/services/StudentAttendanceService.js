const { v4: uuidv4 } = require('uuid');
const { prisma } = require('../config/database');
const { dateOnly, officeHoursFor } = require('../utils/attendanceClock');
const { getCurrentServerTime } = require('../utils/networkTime');

class StudentAttendanceService {
  async _organization(orgId, requireEnabled = true) {
    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true, name: true, hasStudents: true, timezone: true,
        offices: {
          where: { isActive: true }, orderBy: { createdAt: 'asc' }, take: 1,
          select: { openTime: true, closeTime: true, timezone: true, weeklySchedule: true },
        },
      },
    });
    if (!organization) throw Object.assign(new Error('Organization not found.'), { status: 404 });
    if (requireEnabled && !organization.hasStudents) {
      throw Object.assign(new Error('Student attendance is not enabled for this organization.'), { status: 403 });
    }
    return organization;
  }

  async list(orgId, { search = '', status = 'ALL', page = 1, limit = 100 } = {}) {
    const organization = await this._organization(orgId);
    const now = await getCurrentServerTime();
    const office = organization.offices[0] ?? { timezone: organization.timezone };
      const attendanceTimezone = office.timezone || organization.timezone;
      const today = dateOnly(now, attendanceTimezone);
    // Student attendance is an administrator station workflow and remains
    // available on Sundays; the employee schedule must not disable this tab.
    const sunday = false;
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 100));
    const where = {
      orgId,
      ...(status && status !== 'ALL' ? { status } : {}),
      ...(search ? {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { studentCode: { contains: search, mode: 'insensitive' } },
          { className: { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
    };
    const [students, total] = await Promise.all([
      prisma.student.findMany({
        where,
        include: {
          attendanceRecords: {
            where: { date: today }, take: 1,
            include: {
              checkedInBy: { select: { id: true, firstName: true, lastName: true } },
              checkedOutBy: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      prisma.student.count({ where }),
    ]);
    const openAttendance = students.length ? await prisma.studentAttendance.findMany({
      where: {
        studentId: { in: students.map((student) => student.id) },
        date: today,
        checkOutTime: null,
      },
      orderBy: { checkInTime: 'desc' },
      include: {
        checkedInBy: { select: { id: true, firstName: true, lastName: true } },
        checkedOutBy: { select: { id: true, firstName: true, lastName: true } },
      },
    }) : [];
    const openByStudent = new Map();
    for (const record of openAttendance) {
      if (!openByStudent.has(record.studentId)) openByStudent.set(record.studentId, record);
    }
    return {
      enabled: true,
      organization,
      sunday,
      message: sunday ? 'Student attendance is unavailable today because this office is closed.' : null,
      serverTime: now,
      students: students.map((student) => ({
        ...student,
        todayAttendance: openByStudent.get(student.id) ?? student.attendanceRecords[0] ?? null,
        attendanceRecords: undefined,
      })),
      total,
      page: safePage,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async create(orgId, input) {
    await this._organization(orgId);
    try {
      return await prisma.student.create({
        data: {
          id: uuidv4(), orgId,
          firstName: String(input.firstName).trim(),
          lastName: String(input.lastName).trim(),
          studentCode: String(input.studentCode).trim().toUpperCase(),
          className: input.className?.trim() || null,
          status: input.status || 'ACTIVE',
        },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw Object.assign(new Error('Student code already exists in this organization.'), { status: 409 });
      }
      throw error;
    }
  }

  async history(orgId, { studentId, page = 1, limit = 100 } = {}) {
    await this._organization(orgId);
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 100));
    const where = { student: { orgId }, ...(studentId ? { studentId } : {}) };
    const [records, total] = await Promise.all([
      prisma.studentAttendance.findMany({
        where,
        include: { student: true, checkedInBy: { select: { firstName: true, lastName: true } }, checkedOutBy: { select: { firstName: true, lastName: true } } },
        orderBy: [{ date: 'desc' }, { checkInTime: 'desc' }],
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      prisma.studentAttendance.count({ where }),
    ]);
    return { records, total, page: safePage, totalPages: Math.ceil(total / safeLimit) };
  }

  async update(orgId, studentId, input) {
    await this._organization(orgId);
    const student = await prisma.student.findFirst({ where: { id: studentId, orgId }, select: { id: true } });
    if (!student) throw Object.assign(new Error('Student not found.'), { status: 404 });
    const data = {
      ...(input.firstName !== undefined ? { firstName: String(input.firstName).trim() } : {}),
      ...(input.lastName !== undefined ? { lastName: String(input.lastName).trim() } : {}),
      ...(input.studentCode !== undefined ? { studentCode: String(input.studentCode).trim().toUpperCase() } : {}),
      ...(input.className !== undefined ? { className: input.className?.trim() || null } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    };
    try {
      return await prisma.student.update({ where: { id: student.id }, data });
    } catch (error) {
      if (error.code === 'P2002') {
        throw Object.assign(new Error('Student code already exists in this organization.'), { status: 409 });
      }
      throw error;
    }
  }

  async archive(orgId, studentId) {
    return this.update(orgId, studentId, { status: 'INACTIVE' });
  }

  async checkIn(orgId, adminId, studentId) {
    const organization = await this._organization(orgId);
    const student = await prisma.student.findFirst({
      where: { id: studentId, orgId, status: 'ACTIVE' }, select: { id: true },
    });
    if (!student) throw Object.assign(new Error('Active student not found.'), { status: 404 });
    const checkInTime = await getCurrentServerTime();
    const office = organization.offices[0] ?? { timezone: organization.timezone };
      const date = dateOnly(checkInTime, office.timezone || organization.timezone);
    const existingOpen = await prisma.studentAttendance.findFirst({
      where: { studentId: student.id, checkOutTime: null }, select: { id: true },
    });
    if (existingOpen) {
      throw Object.assign(new Error('Student is already checked in and must be checked out first.'), { status: 409 });
    }
    try {
      return await prisma.studentAttendance.create({
        data: {
          id: uuidv4(), studentId: student.id, date, checkInTime,
          checkedInById: adminId,
        },
        include: { student: true },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw Object.assign(new Error('Student is already checked in today.'), { status: 409 });
      }
      throw error;
    }
  }

  async checkOut(orgId, adminId, studentId) {
    // Checkout remains available as a cleanup path if a capability was disabled
    // concurrently or old local data already contains an open student visit.
    await this._organization(orgId, false);
    const student = await prisma.student.findFirst({
      where: { id: studentId, orgId }, select: { id: true },
    });
    if (!student) throw Object.assign(new Error('Student not found.'), { status: 404 });
    const checkOutTime = await getCurrentServerTime();
    const record = await prisma.studentAttendance.findFirst({
      where: { studentId: student.id, checkOutTime: null },
      orderBy: { checkInTime: 'desc' },
    });
    if (!record) throw Object.assign(new Error('Student has no open check-in.'), { status: 404 });
    const changed = await prisma.studentAttendance.updateMany({
      where: { id: record.id, checkOutTime: null },
      data: { checkOutTime, checkedOutById: adminId },
    });
    if (!changed.count) throw Object.assign(new Error('Student is already checked out today.'), { status: 409 });
    return prisma.studentAttendance.findUnique({
      where: { id: record.id },
      include: { student: true },
    });
  }
}

module.exports = new StudentAttendanceService();
