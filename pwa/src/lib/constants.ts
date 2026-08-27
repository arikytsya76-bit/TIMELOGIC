import { Utensils, Coffee, Sunrise, User, Heart, type LucideIcon } from "lucide-react";

// Mirrors mobile/src/constants/types.ts BREAK_TYPES (icons mapped to lucide).
export interface BreakType {
  type: string;
  label: string;
  icon: LucideIcon;
  maxMinutes: number;
  color: string;
}

export const BREAK_TYPES: BreakType[] = [
  { type: "LUNCH", label: "Lunch Break", icon: Utensils, maxMinutes: 60, color: "#F97316" },
  { type: "SHORT_BREAK", label: "Short Break", icon: Coffee, maxMinutes: 15, color: "#1D4ED8" },
  { type: "PRAYER", label: "Prayer Break", icon: Sunrise, maxMinutes: 20, color: "#8B5CF6" },
  { type: "PERSONAL", label: "Personal Break", icon: User, maxMinutes: 15, color: "#14B8A6" },
  { type: "NURSING", label: "Nursing Break", icon: Heart, maxMinutes: 30, color: "#EC4899" },
];

export const LEAVE_TYPES = [
  { type: "ANNUAL", label: "Annual Leave" },
  { type: "SICK", label: "Sick Leave" },
  { type: "CASUAL", label: "Casual Leave" },
  { type: "MATERNITY", label: "Maternity Leave" },
  { type: "PATERNITY", label: "Paternity Leave" },
  { type: "UNPAID", label: "Unpaid Leave" },
  { type: "COMPASSIONATE", label: "Compassionate Leave" },
];

// Mirrors mobile StatusBadge STATUS_MAP. Uses CSS-variable tokens so badge
// colours swap automatically between light and dark themes.
export const STATUS_MAP: Record<string, { bg: string; text: string; label: string }> = {
  PRESENT: { bg: "var(--c-success-bg)", text: "var(--c-success-dark)", label: "Present" },
  LATE: { bg: "var(--c-warning-bg)", text: "var(--c-warning-dark)", label: "Late" },
  COMPLETELY_LATE: { bg: "var(--c-danger-bg)", text: "var(--c-danger-dark)", label: "Completely Late" },
  ABSENT: { bg: "var(--c-danger-bg)", text: "var(--c-danger-dark)", label: "Absent" },
  ON_LEAVE: { bg: "var(--c-primary-bg)", text: "var(--c-primary-dark)", label: "On Leave" },
  HALF_DAY: { bg: "var(--c-orange-bg)", text: "var(--c-orange)", label: "Half Day" },
  WEEKEND: { bg: "var(--c-gray100)", text: "var(--c-gray500)", label: "Weekend" },
  HOLIDAY: { bg: "var(--c-teal-bg)", text: "var(--c-teal)", label: "Holiday" },
  ACTIVE: { bg: "var(--c-success-bg)", text: "var(--c-success-dark)", label: "Active" },
  SUSPENDED: { bg: "var(--c-danger-bg)", text: "var(--c-danger-dark)", label: "Suspended" },
  REVIEW_REQUIRED: { bg: "var(--c-orange-bg)", text: "var(--c-orange)", label: "Under Review" },
};

export const LEAVE_COLORS: Record<string, string> = {
  ANNUAL: "#1D4ED8", SICK: "#10B981", CASUAL: "#F59E0B",
  MATERNITY: "#EC4899", PATERNITY: "#8B5CF6", UNPAID: "#64748B", COMPASSIONATE: "#F97316",
};
export const LEAVE_LABELS: Record<string, string> = {
  ANNUAL: "Annual Leave", SICK: "Sick Leave", CASUAL: "Casual Leave",
  MATERNITY: "Maternity", PATERNITY: "Paternity", UNPAID: "Unpaid Leave", COMPASSIONATE: "Compassionate",
};
