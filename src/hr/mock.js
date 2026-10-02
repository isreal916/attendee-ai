/**
 * Mock HR adapter — a seeded demo company so the service runs without
 * AttendeeHRM. Same interface as the real adapter: every method takes the
 * verified identity and returns only that employee's data.
 *
 * Sign in with `Authorization: Bearer demo-ada` (or demo-tunde, demo-ngozi).
 */
import { weekdayOf } from "../dates.js";

// DEMO_COMPANY_ID gives a test run its own memory namespaces, so earlier runs cannot affect it.
const COMPANY = { companyId: process.env.DEMO_COMPANY_ID || "demo", companyName: "Lumen Logistics (demo)" };

const EMPLOYEES = {
  "demo-ada": {
    userId: "1001", pin: "1001", name: "Ada Okafor",
    role: "Frontend Developer", department: "Engineering", branch: "Lagos HQ",
    startedDaysAgo: 12, manager: "Engineering Manager",
    leave: { Annual: [20, 0], Sick: [10, 0], Study: [5, 0] },
    shift: { name: "Day", in: "09:00", out: "17:00", off: [0, 6] },
    attendance: { late: 1, absent: 0 }, netPay: 420000,
  },
  "demo-tunde": {
    userId: "1002", pin: "1002", name: "Tunde Bello",
    role: "Warehouse Shift Supervisor", department: "Operations", branch: "Apapa Depot",
    startedDaysAgo: 760, manager: "Operations Manager",
    leave: { Annual: [21, 12], Sick: [10, 2], Compassionate: [5, 0] },
    shift: { name: "Early", in: "06:00", out: "14:00", off: [0, 3] },
    attendance: { late: 3, absent: 1 }, netPay: 310000,
  },
  "demo-ngozi": {
    userId: "1003", pin: "1003", name: "Ngozi Eze",
    role: "Senior Backend Engineer", department: "Engineering", branch: "Lagos HQ",
    startedDaysAgo: 1480, manager: "Head of Engineering",
    leave: { Annual: [25, 9], Sick: [10, 0], Study: [5, 2] },
    shift: { name: "Day", in: "09:00", out: "17:00", off: [0, 6] },
    attendance: { late: 0, absent: 0 }, netPay: 780000,
  },
};

const pad = (n) => String(n).padStart(2, "0");
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function employeeFor(identity) {
  const emp = Object.values(EMPLOYEES).find((e) => e.userId === identity.userId);
  if (!emp) throw new Error("employee not found");
  return emp;
}

function parseMonth(month) {
  const m = /^(\d{4})-(\d{2})$/.exec(month ?? "");
  const now = new Date();
  return m ? { year: Number(m[1]), monthIndex: Number(m[2]) - 1 } : { year: now.getFullYear(), monthIndex: now.getMonth() };
}

export const mockAdapter = {
  name: "mock",

  /** Bearer token → verified identity, or null. */
  async resolveIdentity(token) {
    const emp = EMPLOYEES[token];
    if (!emp) return null;
    return { ...COMPANY, userId: emp.userId, pin: emp.pin, name: emp.name };
  },

  async getProfile(identity) {
    const e = employeeFor(identity);
    const start = new Date(Date.now() - e.startedDaysAgo * 86_400_000);
    return {
      name: e.name, job_title: e.role, grade: null, department: e.department, branch: e.branch,
      company: COMPANY.companyName, start_date: dateKey(start), reports_to: e.manager,
    };
  },

  async getLeaveBalance(identity, { year } = {}) {
    const e = employeeFor(identity);
    const types = Object.entries(e.leave).map(([type, [entitled, used]]) => ({
      type, entitled_days: entitled, used_days: used, remaining_days: entitled - used,
    }));
    return {
      leave_year: year ?? new Date().getFullYear(),
      types,
      total_remaining_days: types.reduce((n, t) => n + t.remaining_days, 0),
    };
  },

  async getAttendanceSummary(identity, { month } = {}) {
    const e = employeeFor(identity);
    const { year, monthIndex } = parseMonth(month);
    const today = new Date();
    const isCurrent = year === today.getFullYear() && monthIndex === today.getMonth();
    const lastDay = isCurrent ? today.getDate() : new Date(year, monthIndex + 1, 0).getDate();
    let working = 0;
    for (let d = 1; d <= lastDay; d++) {
      if (!e.shift.off.includes(new Date(year, monthIndex, d).getDay())) working++;
    }
    const absent = Math.min(e.attendance.absent, working);
    return {
      month: `${year}-${pad(monthIndex + 1)}`,
      working_days_so_far: working,
      days_present: working - absent,
      days_absent: absent,
      times_late: Math.min(e.attendance.late, working),
      usual_clock_in: e.shift.in,
    };
  },

  async getShifts(identity, { month } = {}) {
    const e = employeeFor(identity);
    const { year, monthIndex } = parseMonth(month);
    const today = new Date();
    const from = year === today.getFullYear() && monthIndex === today.getMonth() ? today.getDate() : 1;
    const days = [];
    const last = new Date(year, monthIndex + 1, 0).getDate();
    for (let d = from; d <= last && days.length < 14; d++) {
      const date = new Date(year, monthIndex, d);
      const off = e.shift.off.includes(date.getDay());
      days.push(
        off
          ? { date: dateKey(date), weekday: weekdayOf(dateKey(date)), off: true }
          : { date: dateKey(date), weekday: weekdayOf(dateKey(date)), shift: e.shift.name, clock_in: e.shift.in, clock_out: e.shift.out },
      );
    }
    return { shift_name: e.shift.name, days };
  },

  async getPaySummary(identity, { month } = {}) {
    const e = employeeFor(identity);
    const { year, monthIndex } = parseMonth(month);
    const gross = Math.round(e.netPay / 0.82);
    return {
      month: `${year}-${pad(monthIndex + 1)}`,
      currency: "NGN",
      gross_pay: gross,
      total_deductions: gross - e.netPay,
      net_pay: e.netPay,
      status: "paid",
    };
  },
};
