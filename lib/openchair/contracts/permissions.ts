export const OPENCHAIR_ACTIONS = [
  "appointment.create",
  "appointment.publish",
  "appointment.read",
  "appointment.cancel",
  "appointment.complete",
  "beneficiary.create",
  "beneficiary.read",
  "beneficiary.update",
  "candidate.select",
  "funding.read",
  "funding.approve",
  "funding.pay",
  "payment.link.send",
  "outreach.start",
  "outreach.monitor",
  "outreach.control",
  "workflow.admin",
] as const;

export type OpenChairAction = (typeof OPENCHAIR_ACTIONS)[number];

export const VIEWER_ROLES = [
  "clinic",
  "nonprofit",
  "sponsor",
  "operator",
] as const;

export type ViewerRole = (typeof VIEWER_ROLES)[number];
