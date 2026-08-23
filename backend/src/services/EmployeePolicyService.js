const { prisma } = require('../config/database');

const METHODS = ['PHONE', 'MANUAL', 'BOTH'];

function methodCapabilities(method) {
  return {
    phone: method === 'PHONE' || method === 'BOTH',
    manual: method === 'MANUAL' || method === 'BOTH',
  };
}

function assertMethodAllowed(org, method) {
  const normalized = String(method || 'PHONE').toUpperCase();
  if (!METHODS.includes(normalized)) {
    throw Object.assign(new Error('Check-in method must be PHONE, MANUAL, or BOTH.'), { status: 400 });
  }
  const requested = methodCapabilities(normalized);
  if (requested.phone && !org?.allowDeviceCheckIn) {
    throw Object.assign(new Error('Phone/device check-in is disabled for this organization.'), { status: 400 });
  }
  if (requested.manual && !org?.allowManualCheckIn) {
    throw Object.assign(new Error('Manual check-in is disabled for this organization.'), { status: 400 });
  }
  return normalized;
}

function assertChannelAllowed(org, method, channel) {
  const caps = methodCapabilities(method);
  if (channel === 'PHONE' && (!org?.allowDeviceCheckIn || !caps.phone)) {
    throw Object.assign(
      new Error('This employee is configured for manual check-in at the Admin station.'),
      { status: 403, code: 'PHONE_CHECKIN_DISABLED' }
    );
  }
  if (channel === 'MANUAL' && (!org?.allowManualCheckIn || !caps.manual)) {
    throw Object.assign(
      new Error('This employee is not permitted to use manual check-in.'),
      { status: 403, code: 'MANUAL_CHECKIN_DISABLED' }
    );
  }
}

async function getOrganizationPolicy(orgId) {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      subscriptionTier: true,
      allowDeviceCheckIn: true,
      allowManualCheckIn: true,
      hasStudents: true,
      openingTime: true,
      timezone: true,
    },
  });
  if (!org) throw Object.assign(new Error('Organization not found.'), { status: 404 });
  return org;
}

function compatibleMethodForOrganization(org, currentMethod = 'PHONE') {
  const current = methodCapabilities(currentMethod);
  const phone = Boolean(org?.allowDeviceCheckIn);
  const manual = Boolean(org?.allowManualCheckIn);
  if (!phone && !manual) {
    throw Object.assign(new Error('The target organization has no employee check-in channel enabled.'), { status: 400 });
  }
  if (current.phone && current.manual && phone && manual) return 'BOTH';
  if (current.phone && phone) return 'PHONE';
  if (current.manual && manual) return 'MANUAL';
  if (phone && manual) return 'BOTH';
  return phone ? 'PHONE' : 'MANUAL';
}

module.exports = {
  METHODS,
  methodCapabilities,
  assertMethodAllowed,
  assertChannelAllowed,
  getOrganizationPolicy,
  compatibleMethodForOrganization,
};
