const { v4: uuidv4 } = require('uuid');
const { prisma } = require('../config/database');
const ExcelJS = require('exceljs');
const { dateOnly } = require('../utils/attendanceClock');

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function isoDate(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function isoUtcDateTime(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

function reportDate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00.000Z`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw Object.assign(new Error('Invalid report date.'), { status: 400 });
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

class ReportService {
  async generateDaily(date, adminId, orgId) {
    const d = reportDate(date);
    return this._generate('daily', d, d, adminId, orgId);
  }

  async generateWeekly(weekStart, adminId, orgId) {
    const start = reportDate(weekStart);
    const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
    return this._generate('weekly', start, end, adminId, orgId);
  }

  async generateMonthly(year, month, adminId, orgId) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0));
    return this._generate('monthly', start, end, adminId, orgId);
  }

  async generateCustom(startDate, endDate, adminId, orgId) {
    return this._generate('custom', reportDate(startDate), reportDate(endDate), adminId, orgId);
  }

  async generateByDepartment(departmentId, startDate, endDate, adminId, orgId) {
    const employees = await prisma.user.findMany({
      where: { departmentId, orgId, status: 'ACTIVE' },
      select: { id: true },
    });
    const empIds = employees.map((e) => e.id);
    return this._generate('department', reportDate(startDate), reportDate(endDate), adminId, orgId, { employeeId: { in: empIds } });
  }

  async generateByEmployee(employeeId, startDate, endDate, adminId, orgId) {
    const employee = await prisma.user.findFirst({ where: { id: employeeId, orgId }, select: { id: true } });
    if (!employee) throw Object.assign(new Error('Employee not found.'), { status: 404 });
    return this._generate('employee', reportDate(startDate), reportDate(endDate), adminId, orgId, { employeeId });
  }

  // ─── Comprehensive export with full database ───────────────────────────────

  async buildFullExport(orgId) {
    const orgFilter = orgId && orgId !== 'platform-org' ? { orgId } : {};
    const empOrgFilter = orgId && orgId !== 'platform-org' ? { employee: { orgId } } : {};
    const sessionOrgFilter = orgId && orgId !== 'platform-org' ? { office: { orgId } } : {};
    const scanOrgFilter = orgId && orgId !== 'platform-org' ? { employee: { orgId } } : {};
    const scopedOrgId = orgId && orgId !== 'platform-org' ? orgId : null;
    const scopedUserIds = scopedOrgId
      ? (await prisma.user.findMany({ where: { orgId: scopedOrgId }, select: { id: true } })).map((user) => user.id)
      : null;

    const [
      employees,
      attendanceRecords,
      leaveRequests,
      breakRecords,
      fraudAlerts,
      sessions,
      scanAttempts,
      studentRecords,
      studentAttendance,
      adminLoginEvents,
      screenshotLogs,
      securitySettings,
      emergencyControls,
      attendanceReports,
      notificationLogs,
    ] = await Promise.all([
      prisma.user.findMany({
        where: { ...orgFilter, role: { in: ['EMPLOYEE', 'ADMIN', 'SUPER_ADMIN'] } },
        select: {
          id: true, firstName: true, lastName: true, email: true, employeeCode: true,
          role: true, shiftType: true, status: true, createdAt: true,
          organization: { select: { name: true } },
          department: { select: { name: true } },
          profileImageUrl: true, lastLoginAt: true,
        },
        orderBy: [{ organization: { name: 'asc' } }, { firstName: 'asc' }],
      }),
      prisma.attendanceRecord.findMany({
        where: empOrgFilter,
        include: {
          employee: {
            select: {
              firstName: true, lastName: true, email: true, employeeCode: true, status: true,
              organization: { select: { name: true } },
              department: { select: { name: true } },
            },
          },
          session: { select: { sessionName: true, startTime: true, endTime: true } },
          checkInRecorder: { select: { firstName: true, lastName: true, email: true } },
          checkOutRecorder: { select: { firstName: true, lastName: true, email: true } },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.leaveRequest.findMany({
        where: empOrgFilter,
        include: {
          employee: {
            select: {
              firstName: true, lastName: true, employeeCode: true,
              organization: { select: { name: true } },
            },
          },
          approver: { select: { firstName: true, lastName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.breakRecord.findMany({
        where: empOrgFilter,
        include: {
          employee: {
            select: {
              firstName: true, lastName: true, employeeCode: true,
              organization: { select: { name: true } },
            },
          },
          attendanceRecord: { select: { date: true, session: { select: { sessionName: true } } } },
        },
        orderBy: { startTime: 'desc' },
      }),
      prisma.fraudAlert.findMany({
        where: empOrgFilter,
        include: {
          employee: {
            select: {
              firstName: true, lastName: true, employeeCode: true,
              organization: { select: { name: true } },
            },
          },
          session: { select: { sessionName: true, startTime: true } },
          resolver: { select: { firstName: true, lastName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.attendanceSession.findMany({
        where: sessionOrgFilter,
        select: {
          id: true, sessionName: true, officeName: true, orgName: true, status: true,
          startTime: true, endTime: true, createdAt: true,
          office: { select: { name: true, organization: { select: { name: true } } } },
          _count: { select: { attendanceRecords: true, scanAttempts: true, fraudAlerts: true } },
        },
        orderBy: { startTime: 'desc' },
      }),
      prisma.scanAttempt.findMany({
        where: scanOrgFilter,
        include: {
          employee: { select: { firstName: true, lastName: true, employeeCode: true, organization: { select: { name: true } } } },
          session: { select: { sessionName: true, startTime: true } },
        },
        orderBy: { timestamp: 'desc' },
      }),
      prisma.student.findMany({
        where: orgFilter,
        include: { organization: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.studentAttendance.findMany({
        where: scopedOrgId ? { student: { orgId: scopedOrgId } } : {},
        include: {
          student: { select: { studentCode: true, firstName: true, lastName: true, organization: { select: { name: true } } } },
          checkedInBy: { select: { firstName: true, lastName: true, email: true } },
          checkedOutBy: { select: { firstName: true, lastName: true, email: true } },
        },
        orderBy: { date: 'desc' },
      }),
      prisma.adminLoginEvent.findMany({
        where: orgFilter,
        include: {
          admin: { select: { firstName: true, lastName: true, email: true, organization: { select: { name: true } } } },
          organization: { select: { name: true } },
        },
        orderBy: { loggedInAt: 'desc' },
      }),
      prisma.screenshotLog.findMany({
        where: scopedUserIds ? { employeeId: { in: scopedUserIds } } : {},
        orderBy: { timestamp: 'desc' },
      }),
      prisma.securitySettings.findMany({
        where: scopedOrgId ? { office: { orgId: scopedOrgId } } : {},
        include: { office: { select: { name: true, organization: { select: { name: true } } } }, updater: { select: { firstName: true, lastName: true, email: true } } },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.emergencyControl.findMany({
        where: scopedOrgId ? { admin: { orgId: scopedOrgId } } : {},
        include: {
          admin: { select: { firstName: true, lastName: true, email: true } },
          sessions: { select: { session: { select: { sessionName: true, officeName: true } } } },
        },
        orderBy: { timestamp: 'desc' },
      }),
      prisma.attendanceReport.findMany({
        where: scopedOrgId ? { generator: { orgId: scopedOrgId } } : {},
        include: { generator: { select: { firstName: true, lastName: true, email: true } } },
        orderBy: { generatedAt: 'desc' },
      }),
      prisma.notificationLog.findMany({
        where: scopedUserIds ? { userId: { in: scopedUserIds } } : {},
        orderBy: { sentAt: 'desc' },
      }),
    ]);

    return {
      employees,
      attendanceRecords,
      leaveRequests,
      breakRecords,
      fraudAlerts,
      sessions,
      scanAttempts,
      studentRecords,
      studentAttendance,
      adminLoginEvents,
      screenshotLogs,
      securitySettings,
      emergencyControls,
      attendanceReports,
      notificationLogs,
    };
  }

  async exportToExcel(records, reportMeta) {
    // Legacy single-sheet export
    return this._buildExcelFromAttendance(records);
  }

  async exportFullToExcel(orgId) {
    const data = await this.buildFullExport(orgId);
    const workbook = new ExcelJS.Workbook();
    const employeeById = new Map(data.employees.map((employee) => [employee.id, employee]));

    const sheets = [
      ['Attendance', data.attendanceRecords.map((r) => ({
        Organization: r.employee?.organization?.name ?? '',
        Date: isoDate(r.date),
        Day: r.date ? new Date(r.date).toLocaleDateString('en-GB', { weekday: 'long' }) : '',
        Month: r.date ? new Date(r.date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '',
        'Employee Code': r.employee?.employeeCode ?? '',
        'Employee Name': `${r.employee?.firstName ?? ''} ${r.employee?.lastName ?? ''}`.trim(),
        'Emp Status': r.employee?.status ?? '',
        Department: r.employee?.department?.name ?? '',
        Session: r.session?.sessionName ?? '',
        'Clock In': r.clockInTime ? this._fmtTime(r.clockInTime) : '',
        'Check-In Source': r.checkInSource ?? '',
        'Check-In Recorded By': r.checkInRecorder ? `${r.checkInRecorder.firstName} ${r.checkInRecorder.lastName}`.trim() : '',
        'Clock Out': r.clockOutTime ? this._fmtTime(r.clockOutTime) : '',
        'Check-Out Source': r.checkOutSource ?? '',
        'Check-Out Recorded By': r.checkOutRecorder ? `${r.checkOutRecorder.firstName} ${r.checkOutRecorder.lastName}`.trim() : '',
        Status: r.status ?? '',
        'Penalty (NGN)': r.penalty ?? 0,
        'Work Hours': r.totalWorkHours?.toFixed(2) ?? '',
        'Break (min)': r.totalBreakMinutes ?? 0,
        'WiFi Verified': r.wifiVerified ? 'Yes' : 'No',
        'Device Verified': r.deviceVerified ? 'Yes' : 'No',
        Flagged: r.flagged ? 'Yes' : 'No',
        'Flag Reason': r.flagReason ?? '',
      })), 'No attendance records'],
      ['Employees', data.employees.map((e) => ({
        Organization: e.organization?.name ?? '',
        'Employee Code': e.employeeCode ?? '',
        'First Name': e.firstName ?? '',
        'Last Name': e.lastName ?? '',
        Email: e.email ?? '',
        Department: e.department?.name ?? '',
        Role: e.role ?? '',
        'Shift Type': e.shiftType ?? '',
        'Employment Status': e.status ?? '',
        'Face Registered': e.profileImageUrl ? 'Yes' : 'No',
        'Last Login': e.lastLoginAt ? isoUtcDateTime(e.lastLoginAt) : '',
        Joined: isoDate(e.createdAt),
      })), 'No employees'],
      ['Leave Requests', data.leaveRequests.map((l) => ({
        Organization: l.employee?.organization?.name ?? '',
        'Employee Code': l.employee?.employeeCode ?? '',
        'Employee Name': `${l.employee?.firstName ?? ''} ${l.employee?.lastName ?? ''}`.trim(),
        'Leave Type': l.leaveType ?? '',
        'Start Date': isoDate(l.startDate),
        'End Date': isoDate(l.endDate),
        'Total Days': l.totalDays ?? '',
        Status: l.status ?? '',
        Reason: l.reason ?? '',
        'Submitted': isoDate(l.createdAt),
        'Approved By': l.approver ? `${l.approver.firstName} ${l.approver.lastName}`.trim() : '',
      })), 'No leave requests'],
      ['Break Records', data.breakRecords.map((b) => ({
        Organization: b.employee?.organization?.name ?? '',
        'Employee Code': b.employee?.employeeCode ?? '',
        'Employee Name': `${b.employee?.firstName ?? ''} ${b.employee?.lastName ?? ''}`.trim(),
        'Break Type': b.breakType ?? '',
        Start: b.startTime ? this._fmtTime(b.startTime) : '',
        End: b.endTime ? this._fmtTime(b.endTime) : 'Active',
        'Duration (min)': b.durationMinutes ?? '',
        'Penalty (NGN)': b.penalty ?? 0,
        'Auto-Ended': b.isAutoEnded ? 'Yes' : 'No',
        'Session': b.attendanceRecord?.session?.sessionName ?? '',
        'Attendance Date': isoDate(b.attendanceRecord?.date),
      })), 'No break records'],
      ['Fraud Alerts', data.fraudAlerts.map((f) => ({
        Organization: f.employee?.organization?.name ?? '',
        'Employee Code': f.employee?.employeeCode ?? '',
        'Employee Name': `${f.employee?.firstName ?? ''} ${f.employee?.lastName ?? ''}`.trim(),
        'Fraud Type': f.fraudType ?? '',
        Severity: f.severity ?? '',
        Description: f.description ?? '',
        Status: f.status ?? '',
        'Session': f.session?.sessionName ?? '',
        Date: isoDate(f.createdAt),
        'Resolved By': f.resolver ? `${f.resolver.firstName} ${f.resolver.lastName}`.trim() : '',
      })), 'No fraud alerts'],
      ['Sessions', (data.sessions ?? []).map((s) => ({
        Organization: s.office?.organization?.name ?? s.orgName ?? '',
        Office: s.office?.name ?? s.officeName ?? '',
        Session: s.sessionName ?? '',
        Status: s.status ?? '',
        Date: isoDate(s.startTime),
        'Start Time': s.startTime ? this._fmtTime(s.startTime) : '',
        'End Time': s.endTime ? this._fmtTime(s.endTime) : '',
        'Check-ins': s._count?.attendanceRecords ?? 0,
        'Scan Attempts': s._count?.scanAttempts ?? 0,
        'Fraud Alerts': s._count?.fraudAlerts ?? 0,
      })), 'No sessions'],
      ['Scan Attempts', data.scanAttempts.map((s) => ({
        Organization: s.employee?.organization?.name ?? '',
        'Employee Code': s.employee?.employeeCode ?? '',
        'Employee Name': `${s.employee?.firstName ?? ''} ${s.employee?.lastName ?? ''}`.trim(),
        Session: s.session?.sessionName ?? '',
        Timestamp: isoUtcDateTime(s.timestamp),
        'Scan Result': s.result ?? '',
        'Device ID': s.deviceId ?? '',
        'WiFi SSID': s.wifiSSID ?? '',
        'IP Address': s.ipAddress ?? '',
      })), 'No scan attempts'],
      ['Students', data.studentRecords.map((s) => ({
        Organization: s.organization?.name ?? '',
        'Student Code': s.studentCode ?? '',
        'First Name': s.firstName ?? '',
        'Last Name': s.lastName ?? '',
        Class: s.className ?? '',
        Status: s.status ?? '',
        Created: isoDate(s.createdAt),
      })), 'No students'],
      ['Student Attendance', data.studentAttendance.map((s) => ({
        Organization: s.student?.organization?.name ?? '',
        'Student Code': s.student?.studentCode ?? '',
        'Student Name': `${s.student?.firstName ?? ''} ${s.student?.lastName ?? ''}`.trim(),
        Date: isoDate(s.date),
        'Check In': s.checkInTime ? this._fmtTime(s.checkInTime) : '',
        'Check Out': s.checkOutTime ? this._fmtTime(s.checkOutTime) : '',
        'Checked In By': s.checkedInBy ? `${s.checkedInBy.firstName} ${s.checkedInBy.lastName}`.trim() : '',
        'Checked Out By': s.checkedOutBy ? `${s.checkedOutBy.firstName} ${s.checkedOutBy.lastName}`.trim() : '',
      })), 'No student attendance'],
      ['Admin Login Events', data.adminLoginEvents.map((e) => ({
        Organization: e.organization?.name ?? '',
        'Admin Name': e.admin ? `${e.admin.firstName} ${e.admin.lastName}`.trim() : '',
        Email: e.admin?.email ?? '',
        'Attendance Status': e.attendanceStatus ?? '',
        'Minutes Late': e.minutesLate ?? 0,
        Penalty: e.penalty ?? 0,
        'Logged In At': isoUtcDateTime(e.loggedInAt),
        'IP Address': e.ipAddress ?? '',
      })), 'No admin login events'],
      ['Screenshot Logs', data.screenshotLogs.map((s) => ({
        Organization: employeeById.get(s.employeeId)?.organization?.name ?? '',
        'Employee Code': employeeById.get(s.employeeId)?.employeeCode ?? '',
        'Employee Name': `${employeeById.get(s.employeeId)?.firstName ?? ''} ${employeeById.get(s.employeeId)?.lastName ?? ''}`.trim(),
        Platform: s.platform ?? '',
        'Device ID': s.deviceId ?? '',
        Timestamp: isoUtcDateTime(s.timestamp),
        'Session ID': s.sessionId ?? '',
      })), 'No screenshot logs'],
      ['Security Settings', data.securitySettings.map((s) => ({
        Organization: s.office?.organization?.name ?? '',
        Office: s.office?.name ?? '',
        'WiFi Required': s.wifiRequired ? 'Yes' : 'No',
        'Device Binding': s.deviceBindingEnabled ? 'Yes' : 'No',
        'Screenshot Protection': s.screenshotProtection ? 'Yes' : 'No',
        'Late Threshold (min)': s.lateThresholdMinutes ?? 0,
        'Max Failed Attempts': s.maxFailedAttempts ?? 0,
        'Updated By': s.updater ? `${s.updater.firstName} ${s.updater.lastName}`.trim() : '',
        'Updated At': isoUtcDateTime(s.updatedAt),
      })), 'No security settings'],
      ['Emergency Controls', data.emergencyControls.map((e) => ({
        Organization: e.admin?.organization?.name ?? '',
        'Triggered By': e.admin ? `${e.admin.firstName} ${e.admin.lastName}`.trim() : '',
        Action: e.action ?? '',
        Reason: e.reason ?? '',
        'Triggered At': isoUtcDateTime(e.timestamp),
        'Is Reverted': e.isReverted ? 'Yes' : 'No',
        'Reverted At': isoUtcDateTime(e.revertedAt),
        'Sessions': e.sessions?.map((s) => s.session?.sessionName ?? '').filter(Boolean).join('; ') ?? '',
      })), 'No emergency controls'],
      ['Report History', data.attendanceReports.map((r) => ({
        Type: r.reportType ?? '',
        'Generated By': r.generator ? `${r.generator.firstName} ${r.generator.lastName}`.trim() : '',
        'Generated At': isoUtcDateTime(r.generatedAt),
        'Range Start': isoDate(r.dateRangeStart),
        'Range End': isoDate(r.dateRangeEnd),
        'Present': r.totalPresent ?? 0,
        'Late': r.totalLate ?? 0,
        'Absent': r.totalAbsent ?? 0,
        'On Leave': r.totalOnLeave ?? 0,
        'Flagged': r.totalFlagged ?? 0,
        'Average Work Hours': r.averageWorkHours ?? '',
        'Average Break (min)': r.averageBreakMinutes ?? '',
      })), 'No report history'],
      ['Notifications', data.notificationLogs.map((n) => ({
        'User ID': n.userId ?? '',
        Channel: n.channel ?? '',
        Subject: n.subject ?? '',
        Status: n.status ?? '',
        'Sent At': isoUtcDateTime(n.sentAt),
        Body: n.body ?? '',
      })), 'No notification logs'],
    ];

    sheets.forEach(([name, rows, emptyMessage]) => this._appendWorksheet(workbook, name, rows, emptyMessage));
    return this._writeExcelBuffer(workbook);
  }

  async exportFullToCSV(orgId) {
    const data = await this.buildFullExport(orgId);
    const employeeById = new Map(data.employees.map((employee) => [employee.id, employee]));
    const sections = [];

    const addSection = (title, headers, rows) => {
      sections.push(title);
      sections.push(headers.join(','));
      rows.forEach((row) => sections.push(row.map((value) => csvEscape(value)).join(',')));
      sections.push('');
    };

    addSection('ATTENDANCE RECORDS (ALL)',
      ['Organization', 'Date', 'Day', 'Month', 'Employee Code', 'Employee Name', 'Emp Status', 'Department', 'Session', 'Clock In', 'Check-In Source', 'Check-In Recorded By', 'Clock Out', 'Check-Out Source', 'Check-Out Recorded By', 'Status', 'Penalty (NGN)', 'Work Hours', 'Break (min)', 'WiFi Verified', 'Device Verified', 'Flagged', 'Flag Reason'],
      data.attendanceRecords.map((r) => [
        r.employee?.organization?.name ?? '',
        isoDate(r.date),
        r.date ? new Date(r.date).toLocaleDateString('en-GB', { weekday: 'long' }) : '',
        r.date ? new Date(r.date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '',
        r.employee?.employeeCode ?? '',
        `${r.employee?.firstName ?? ''} ${r.employee?.lastName ?? ''}`.trim(),
        r.employee?.status ?? '',
        r.employee?.department?.name ?? '',
        r.session?.sessionName ?? '',
        r.clockInTime ? this._fmtTime(r.clockInTime) : '',
        r.checkInSource ?? '',
        r.checkInRecorder ? `${r.checkInRecorder.firstName} ${r.checkInRecorder.lastName}`.trim() : '',
        r.clockOutTime ? this._fmtTime(r.clockOutTime) : '',
        r.checkOutSource ?? '',
        r.checkOutRecorder ? `${r.checkOutRecorder.firstName} ${r.checkOutRecorder.lastName}`.trim() : '',
        r.status ?? '',
        r.penalty ?? 0,
        r.totalWorkHours?.toFixed(2) ?? '',
        r.totalBreakMinutes ?? 0,
        r.wifiVerified ? 'Yes' : 'No',
        r.deviceVerified ? 'Yes' : 'No',
        r.flagged ? 'Yes' : 'No',
        r.flagReason ?? '',
      ]));

    addSection('EMPLOYEES (ALL)',
      ['Organization', 'Employee Code', 'First Name', 'Last Name', 'Email', 'Department', 'Role', 'Shift Type', 'Employment Status', 'Face Registered', 'Last Login', 'Joined'],
      data.employees.map((e) => [
        e.organization?.name ?? '',
        e.employeeCode ?? '',
        e.firstName ?? '',
        e.lastName ?? '',
        e.email ?? '',
        e.department?.name ?? '',
        e.role ?? '',
        e.shiftType ?? '',
        e.status ?? '',
        e.profileImageUrl ? 'Yes' : 'No',
        e.lastLoginAt ? isoUtcDateTime(e.lastLoginAt) : '',
        isoDate(e.createdAt),
      ]));

    addSection('LEAVE REQUESTS',
      ['Organization', 'Employee Code', 'Employee Name', 'Leave Type', 'Start Date', 'End Date', 'Total Days', 'Status', 'Reason', 'Submitted', 'Approved By'],
      data.leaveRequests.map((l) => [
        l.employee?.organization?.name ?? '',
        l.employee?.employeeCode ?? '',
        `${l.employee?.firstName ?? ''} ${l.employee?.lastName ?? ''}`.trim(),
        l.leaveType ?? '',
        isoDate(l.startDate),
        isoDate(l.endDate),
        l.totalDays ?? '',
        l.status ?? '',
        l.reason ?? '',
        isoDate(l.createdAt),
        l.approver ? `${l.approver.firstName} ${l.approver.lastName}`.trim() : '',
      ]));

    addSection('BREAK RECORDS',
      ['Organization', 'Employee Code', 'Employee Name', 'Break Type', 'Start', 'End', 'Duration (min)', 'Penalty (NGN)', 'Auto-Ended', 'Session', 'Attendance Date'],
      data.breakRecords.map((b) => [
        b.employee?.organization?.name ?? '',
        b.employee?.employeeCode ?? '',
        `${b.employee?.firstName ?? ''} ${b.employee?.lastName ?? ''}`.trim(),
        b.breakType ?? '',
        b.startTime ? this._fmtTime(b.startTime) : '',
        b.endTime ? this._fmtTime(b.endTime) : 'Active',
        b.durationMinutes ?? '',
        b.penalty ?? 0,
        b.isAutoEnded ? 'Yes' : 'No',
        b.attendanceRecord?.session?.sessionName ?? '',
        isoDate(b.attendanceRecord?.date),
      ]));

    addSection('FRAUD ALERTS',
      ['Organization', 'Employee Code', 'Employee Name', 'Fraud Type', 'Severity', 'Description', 'Status', 'Session', 'Date', 'Resolved By'],
      data.fraudAlerts.map((f) => [
        f.employee?.organization?.name ?? '',
        f.employee?.employeeCode ?? '',
        `${f.employee?.firstName ?? ''} ${f.employee?.lastName ?? ''}`.trim(),
        f.fraudType ?? '',
        f.severity ?? '',
        f.description ?? '',
        f.status ?? '',
        f.session?.sessionName ?? '',
        isoDate(f.createdAt),
        f.resolver ? `${f.resolver.firstName} ${f.resolver.lastName}`.trim() : '',
      ]));

    addSection('ATTENDANCE SESSIONS',
      ['Organization', 'Office', 'Session', 'Status', 'Date', 'Start Time', 'End Time', 'Check-ins', 'Scan Attempts', 'Fraud Alerts'],
      (data.sessions ?? []).map((s) => [
        s.office?.organization?.name ?? s.orgName ?? '',
        s.office?.name ?? s.officeName ?? '',
        s.sessionName ?? '',
        s.status ?? '',
        isoDate(s.startTime),
        s.startTime ? this._fmtTime(s.startTime) : '',
        s.endTime ? this._fmtTime(s.endTime) : '',
        s._count?.attendanceRecords ?? 0,
        s._count?.scanAttempts ?? 0,
        s._count?.fraudAlerts ?? 0,
      ]));

    addSection('SCAN ATTEMPTS',
      ['Organization', 'Employee Code', 'Employee Name', 'Session', 'Timestamp', 'Scan Result', 'Device ID', 'WiFi SSID', 'IP Address'],
      data.scanAttempts.map((s) => [
        s.employee?.organization?.name ?? '',
        s.employee?.employeeCode ?? '',
        `${s.employee?.firstName ?? ''} ${s.employee?.lastName ?? ''}`.trim(),
        s.session?.sessionName ?? '',
        isoUtcDateTime(s.timestamp),
        s.result ?? '',
        s.deviceId ?? '',
        s.wifiSSID ?? '',
        s.ipAddress ?? '',
      ]));

    addSection('STUDENTS',
      ['Organization', 'Student Code', 'First Name', 'Last Name', 'Class', 'Status', 'Created'],
      data.studentRecords.map((s) => [
        s.organization?.name ?? '',
        s.studentCode ?? '',
        s.firstName ?? '',
        s.lastName ?? '',
        s.className ?? '',
        s.status ?? '',
        isoDate(s.createdAt),
      ]));

    addSection('STUDENT ATTENDANCE',
      ['Organization', 'Student Code', 'Student Name', 'Date', 'Check In', 'Check Out', 'Checked In By', 'Checked Out By'],
      data.studentAttendance.map((s) => [
        s.student?.organization?.name ?? '',
        s.student?.studentCode ?? '',
        `${s.student?.firstName ?? ''} ${s.student?.lastName ?? ''}`.trim(),
        isoDate(s.date),
        s.checkInTime ? this._fmtTime(s.checkInTime) : '',
        s.checkOutTime ? this._fmtTime(s.checkOutTime) : '',
        s.checkedInBy ? `${s.checkedInBy.firstName} ${s.checkedInBy.lastName}`.trim() : '',
        s.checkedOutBy ? `${s.checkedOutBy.firstName} ${s.checkedOutBy.lastName}`.trim() : '',
      ]));

    addSection('ADMIN LOGIN EVENTS',
      ['Organization', 'Admin Name', 'Email', 'Attendance Status', 'Minutes Late', 'Penalty', 'Logged In At', 'IP Address'],
      data.adminLoginEvents.map((e) => [
        e.organization?.name ?? '',
        e.admin ? `${e.admin.firstName} ${e.admin.lastName}`.trim() : '',
        e.admin?.email ?? '',
        e.attendanceStatus ?? '',
        e.minutesLate ?? 0,
        e.penalty ?? 0,
        isoUtcDateTime(e.loggedInAt),
        e.ipAddress ?? '',
      ]));

    addSection('SCREENSHOT LOGS',
      ['Organization', 'Employee Code', 'Employee Name', 'Platform', 'Device ID', 'Timestamp', 'Session ID'],
      data.screenshotLogs.map((s) => [
        employeeById.get(s.employeeId)?.organization?.name ?? '',
        employeeById.get(s.employeeId)?.employeeCode ?? '',
        `${employeeById.get(s.employeeId)?.firstName ?? ''} ${employeeById.get(s.employeeId)?.lastName ?? ''}`.trim(),
        s.platform ?? '',
        s.deviceId ?? '',
        isoUtcDateTime(s.timestamp),
        s.sessionId ?? '',
      ]));

    addSection('SECURITY SETTINGS',
      ['Organization', 'Office', 'WiFi Required', 'Device Binding', 'Screenshot Protection', 'Late Threshold (min)', 'Max Failed Attempts', 'Updated By', 'Updated At'],
      data.securitySettings.map((s) => [
        s.office?.organization?.name ?? '',
        s.office?.name ?? '',
        s.wifiRequired ? 'Yes' : 'No',
        s.deviceBindingEnabled ? 'Yes' : 'No',
        s.screenshotProtection ? 'Yes' : 'No',
        s.lateThresholdMinutes ?? 0,
        s.maxFailedAttempts ?? 0,
        s.updater ? `${s.updater.firstName} ${s.updater.lastName}`.trim() : '',
        isoUtcDateTime(s.updatedAt),
      ]));

    addSection('EMERGENCY CONTROLS',
      ['Organization', 'Triggered By', 'Action', 'Reason', 'Triggered At', 'Is Reverted', 'Reverted At', 'Sessions'],
      data.emergencyControls.map((e) => [
        e.admin?.organization?.name ?? '',
        e.admin ? `${e.admin.firstName} ${e.admin.lastName}`.trim() : '',
        e.action ?? '',
        e.reason ?? '',
        isoUtcDateTime(e.timestamp),
        e.isReverted ? 'Yes' : 'No',
        isoUtcDateTime(e.revertedAt),
        e.sessions?.map((s) => s.session?.sessionName ?? '').filter(Boolean).join('; ') ?? '',
      ]));

    addSection('REPORT HISTORY',
      ['Type', 'Generated By', 'Generated At', 'Range Start', 'Range End', 'Present', 'Late', 'Absent', 'On Leave', 'Flagged', 'Average Work Hours', 'Average Break (min)'],
      data.attendanceReports.map((r) => [
        r.reportType ?? '',
        r.generator ? `${r.generator.firstName} ${r.generator.lastName}`.trim() : '',
        isoUtcDateTime(r.generatedAt),
        isoDate(r.dateRangeStart),
        isoDate(r.dateRangeEnd),
        r.totalPresent ?? 0,
        r.totalLate ?? 0,
        r.totalAbsent ?? 0,
        r.totalOnLeave ?? 0,
        r.totalFlagged ?? 0,
        r.averageWorkHours ?? '',
        r.averageBreakMinutes ?? '',
      ]));

    addSection('NOTIFICATIONS',
      ['User ID', 'Channel', 'Subject', 'Status', 'Sent At', 'Body'],
      data.notificationLogs.map((n) => [
        n.userId ?? '',
        n.channel ?? '',
        n.subject ?? '',
        n.status ?? '',
        isoUtcDateTime(n.sentAt),
        n.body ?? '',
      ]));

    return sections.join('\n');
  }

  exportToCSV(records) {
    // Legacy CSV export
    const rows = records.map((r) => ({
      date: r.date?.toISOString().split('T')[0],
      employee: `${r.employee?.firstName ?? r.employeeId} ${r.employee?.lastName ?? ''}`.trim(),
      status: r.status,
      clockIn: r.clockInTime ? this._fmtTime(r.clockInTime) : '',
      checkInSource: r.checkInSource ?? '',
      clockOut: r.clockOutTime ? this._fmtTime(r.clockOutTime) : '',
      checkOutSource: r.checkOutSource ?? '',
      workHours: r.totalWorkHours?.toFixed(2) ?? '',
      breakMinutes: r.totalBreakMinutes ?? 0,
      wifiVerified: r.wifiVerified ? 'Yes' : 'No',
      flagged: r.flagged ? 'Yes' : 'No',
    }));
    if (!rows.length) return '';
    const headers = Object.keys(rows[0]).join(',');
    const lines = rows.map((r) => Object.values(r).join(','));
    return [headers, ...lines].join('\n');
  }

  _fmtTime(d) {
    if (!d) return '';
    return new Date(d).toLocaleString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  }

  async _buildExcelFromAttendance(records) {
    const rows = records.map((r) => ({
      Date: r.date?.toISOString().split('T')[0],
      Employee: `${r.employee?.firstName ?? r.employeeId} ${r.employee?.lastName ?? ''}`.trim(),
      Status: r.status,
      'Clock In': r.clockInTime ? this._fmtTime(r.clockInTime) : '',
      'Check-In Source': r.checkInSource ?? '',
      'Clock Out': r.clockOutTime ? this._fmtTime(r.clockOutTime) : '',
      'Check-Out Source': r.checkOutSource ?? '',
      'Work Hours': r.totalWorkHours?.toFixed(2) ?? '',
      'Break (min)': r.totalBreakMinutes ?? 0,
      'WiFi OK': r.wifiVerified ? 'Yes' : 'No',
      Flagged: r.flagged ? 'Yes' : 'No',
    }));
    const workbook = new ExcelJS.Workbook();
    this._appendWorksheet(workbook, 'Attendance', rows, 'No attendance records');
    return this._writeExcelBuffer(workbook);
  }

  _appendWorksheet(workbook, name, rows, emptyMessage) {
    const worksheet = workbook.addWorksheet(name);
    const exportRows = rows.length ? rows : [{ Note: emptyMessage }];
    const headers = Object.keys(exportRows[0]);

    worksheet.addRow(headers);
    for (const row of exportRows) {
      worksheet.addRow(headers.map((header) => row[header]));
    }
  }

  async _writeExcelBuffer(workbook) {
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  }

  async getDashboardLiveStats(orgId, serverNow = new Date()) {
    const organization = await prisma.organization.findUnique({
      where: { id: orgId }, select: { timezone: true },
    });
    const today = dateOnly(serverNow, organization?.timezone || 'Africa/Lagos');

    const orgEmployees = await prisma.user.findMany({
      where: { orgId, role: 'EMPLOYEE', status: 'ACTIVE' },
      select: { id: true },
    });
    const empIds = orgEmployees.map((e) => e.id);
    const total = empIds.length;

    const [todayRecords, onLeave, flagged, openAlerts, activeSessions] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where: { employeeId: { in: empIds }, date: today },
        select: { employeeId: true, status: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.leaveRequest.count({ where: { employeeId: { in: empIds }, status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today } } }),
      prisma.attendanceRecord.count({ where: { employeeId: { in: empIds }, date: today, flagged: true } }),
      prisma.fraudAlert.count({ where: { employeeId: { in: empIds }, status: 'NEW' } }),
      prisma.attendanceSession.count({ where: { office: { orgId }, status: { in: ['ACTIVE', 'PAUSED'] } } }),
    ]);

    const latestByEmployee = new Map();
    for (const record of todayRecords) {
      if (!latestByEmployee.has(record.employeeId)) latestByEmployee.set(record.employeeId, record.status);
    }
    const present = [...latestByEmployee.values()].filter((status) => status === 'PRESENT').length;
    const late = [...latestByEmployee.values()].filter((status) => status === 'LATE').length;
    const absent = [...latestByEmployee.values()].filter((status) => status === 'ABSENT').length;
    const attendanceRate = total ? Math.round(((present + late) / total) * 100) : 0;
    return { total, present, late, onLeave, absent, notRecorded: Math.max(0, total - present - late - onLeave - absent), attendanceRate, flagged, openAlerts, activeSessions, serverDate: today.toISOString().slice(0, 10), timezone: organization?.timezone || 'Africa/Lagos' };
  }

  // ── private ──────────────────────────────────────────────────────────────────

  async _generate(reportType, start, end, adminId, orgId, extraFilter = {}) {
    const orgFilter = orgId
      ? { employee: { orgId, role: 'EMPLOYEE' } }
      : {};

    const records = await prisma.attendanceRecord.findMany({
      where: {
        date: { gte: start, lte: end },
        ...orgFilter,
        ...extraFilter,
      },
      include: { employee: { select: { firstName: true, lastName: true, departmentId: true, department: { select: { name: true } } } } },
    });

    const totalPresent  = records.filter((r) => r.status === 'PRESENT').length;
    const totalLate     = records.filter((r) => r.status === 'LATE').length;
    const totalAbsent   = records.filter((r) => r.status === 'ABSENT').length;
    const totalOnLeave  = records.filter((r) => r.status === 'ON_LEAVE').length;
    const totalFlagged  = records.filter((r) => r.flagged).length;
    const avgWork       = records.filter((r) => r.totalWorkHours).reduce((s, r) => s + r.totalWorkHours, 0) / (records.length || 1);
    const avgBreak      = Math.round(records.reduce((s, r) => s + r.totalBreakMinutes, 0) / (records.length || 1));

    // Check adminId still exists (can be deleted after org removal)
    const adminExists = adminId
      ? await prisma.user.findUnique({ where: { id: adminId }, select: { id: true } }).catch(() => null)
      : null;

    const report = adminExists
      ? await prisma.attendanceReport.create({
          data: {
            id: uuidv4(), reportType,
            dateRangeStart: start, dateRangeEnd: end,
            totalPresent, totalLate, totalAbsent, totalOnLeave, totalFlagged,
            averageWorkHours: parseFloat(avgWork.toFixed(2)),
            averageBreakMinutes: avgBreak,
            generatedBy: adminId,
            metadata: { recordCount: records.length },
          },
        }).catch(() => ({ id: null, reportType }))
      : { id: null, reportType };

    return { report, records };
  }
}

module.exports = new ReportService();
