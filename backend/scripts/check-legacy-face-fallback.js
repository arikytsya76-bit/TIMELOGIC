const AttendanceService = require('../src/services/AttendanceService');

(async () => {
  const now = new Date('2026-09-01T12:00:00Z');
  const signature = Array.from({ length: 1024 }, (_, i) => (i % 2 === 0 ? 0.8 : 0.2));

  try {
    const result = await AttendanceService._verifyEmployeeFace({
      id: 'emp-legacy-photo',
      profileImageUrl: '/uploads/faces/legacy.jpg',
      faceEncodingData: null,
      faceBlockedUntil: null,
    }, signature, 'session-legacy', now);

    if (result !== 1) {
      console.error('Legacy photo fallback returned unexpected result:', result);
      process.exit(1);
    }

    console.log('PASS: legacy uploaded face without saved faceEncodingData is accepted.');
  } catch (error) {
    console.error('FAIL:', error.message);
    process.exit(1);
  }
})();
