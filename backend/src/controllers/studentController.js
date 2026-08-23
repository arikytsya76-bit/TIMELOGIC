const StudentAttendanceService = require('../services/StudentAttendanceService');

const list = async (req, res, next) => {
  try {
    const result = await StudentAttendanceService.list(req.user.orgId, req.query);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
};

const create = async (req, res, next) => {
  try {
    const student = await StudentAttendanceService.create(req.user.orgId, req.body);
    res.status(201).json({ success: true, data: student });
  } catch (error) { next(error); }
};

const history = async (req, res, next) => {
  try {
    const result = await StudentAttendanceService.history(req.user.orgId, req.query);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
};

const update = async (req, res, next) => {
  try {
    const student = await StudentAttendanceService.update(req.user.orgId, req.params.studentId, req.body);
    res.json({ success: true, data: student });
  } catch (error) { next(error); }
};

const archive = async (req, res, next) => {
  try {
    const student = await StudentAttendanceService.archive(req.user.orgId, req.params.studentId);
    res.json({ success: true, data: student });
  } catch (error) { next(error); }
};

const checkIn = async (req, res, next) => {
  try {
    const record = await StudentAttendanceService.checkIn(req.user.orgId, req.user.id, req.params.studentId);
    res.status(201).json({ success: true, data: record });
  } catch (error) { next(error); }
};

const checkOut = async (req, res, next) => {
  try {
    const record = await StudentAttendanceService.checkOut(req.user.orgId, req.user.id, req.params.studentId);
    res.json({ success: true, data: record });
  } catch (error) { next(error); }
};

module.exports = { list, history, create, update, archive, checkIn, checkOut };
