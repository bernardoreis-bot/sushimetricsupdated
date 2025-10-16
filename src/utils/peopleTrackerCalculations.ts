export interface StaffMember {
  id: string;
  name: string;
  role: string;
  start_date: string;
  end_date: string | null;
  training_hours: number;
  training_rate_applied: number | null;
  training_cost_calculated: number | null;
  rate_locked_at: string | null;
  department: string;
  notes: string | null;
  is_archived: boolean;
  site_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PeriodConfig {
  label: string;
  days: number;
}

export const PERIOD_PRESETS: PeriodConfig[] = [
  { label: '30 Days', days: 30 },
  { label: '60 Days', days: 60 },
  { label: '90 Days', days: 90 },
  { label: '180 Days', days: 180 },
  { label: '1 Year', days: 365 },
  { label: '2 Years', days: 730 },
  { label: '3 Years', days: 1095 },
];

// Period-specific turnover rate calculation
// Formula: (Separations in period / Average headcount in period) × 100
export const calculateTurnoverRate = (
  staff: StaffMember[],
  startDate: Date,
  endDate: Date
): number => {
  // Staff working at start of period
  const startHeadcount = staff.filter(s => {
    const start = new Date(s.start_date);
    return start <= startDate && (!s.end_date || new Date(s.end_date) > startDate);
  }).length;

  // Staff working at end of period
  const endHeadcount = staff.filter(s => {
    const start = new Date(s.start_date);
    return start <= endDate && (!s.end_date || new Date(s.end_date) > endDate);
  }).length;

  const avgHeadcount = (startHeadcount + endHeadcount) / 2;

  if (avgHeadcount === 0) return 0;

  // Separations during this specific period
  const separations = staff.filter(s => {
    if (!s.end_date) return false;
    const endDateObj = new Date(s.end_date);
    return endDateObj >= startDate && endDateObj <= endDate;
  }).length;

  return (separations / avgHeadcount) * 100;
};

// Period-specific retention rate calculation
// Formula: (Staff remaining at end / Staff at start) × 100
export const calculateRetentionRate = (
  staff: StaffMember[],
  startDate: Date,
  endDate: Date
): number => {
  // Staff working at start of period
  const startingStaff = staff.filter(s => {
    const start = new Date(s.start_date);
    return start <= startDate && (!s.end_date || new Date(s.end_date) > startDate);
  });

  const startingHeadcount = startingStaff.length;

  if (startingHeadcount === 0) return 0;

  // Staff from starting cohort who are still working at end of period
  const remainedAtEnd = startingStaff.filter(s => {
    if (!s.end_date) return true; // Still active
    const endDateObj = new Date(s.end_date);
    return endDateObj > endDate; // Left after period ended
  }).length;

  return (remainedAtEnd / startingHeadcount) * 100;
};

export const calculateAverageHeadcount = (
  staff: StaffMember[],
  startDate: Date,
  endDate: Date
): number => {
  const startHeadcount = staff.filter(s => {
    const start = new Date(s.start_date);
    return start <= startDate;
  }).filter(s => !s.end_date || new Date(s.end_date) > startDate).length;

  const endHeadcount = staff.filter(s => {
    const start = new Date(s.start_date);
    return start <= endDate;
  }).filter(s => !s.end_date || new Date(s.end_date) > endDate).length;

  return (startHeadcount + endHeadcount) / 2;
};

export const calculateTrainingCost = (
  staff: StaffMember,
  currentHourlyRate: number
): number => {
  if (staff.training_rate_applied !== null && staff.rate_locked_at !== null) {
    return staff.training_cost_calculated || (staff.training_hours * staff.training_rate_applied);
  }

  return staff.training_hours * currentHourlyRate;
};

export const getTotalTrainingCost = (
  staff: StaffMember[],
  currentHourlyRate: number
): number => {
  return staff.reduce((sum, s) => sum + calculateTrainingCost(s, currentHourlyRate), 0);
};

export const getActiveStaff = (staff: StaffMember[]): StaffMember[] => {
  return staff.filter(s => !s.end_date);
};

export const getInactiveStaff = (staff: StaffMember[]): StaffMember[] => {
  return staff.filter(s => s.end_date !== null);
};

export const filterStaffByPeriod = (
  staff: StaffMember[],
  startDate: Date,
  endDate: Date
): StaffMember[] => {
  return staff.filter(s => {
    const start = new Date(s.start_date);
    const end = s.end_date ? new Date(s.end_date) : new Date();

    return (start <= endDate && end >= startDate);
  });
};

export const filterStaffByDepartment = (
  staff: StaffMember[],
  departments: string[]
): StaffMember[] => {
  if (departments.length === 0) return staff;
  return staff.filter(s => departments.includes(s.department || 'General'));
};

export const getUniqueDepartments = (staff: StaffMember[]): string[] => {
  const departments = new Set<string>();
  staff.forEach(s => departments.add(s.department || 'General'));
  return Array.from(departments).sort();
};

export const getAverageTrainingCost = (
  staff: StaffMember[],
  currentHourlyRate: number
): number => {
  const staffWithTraining = staff.filter(s => {
    const cost = calculateTrainingCost(s, currentHourlyRate);
    return cost > 0;
  });

  if (staffWithTraining.length === 0) return 0;

  const totalCost = staffWithTraining.reduce(
    (sum, s) => sum + calculateTrainingCost(s, currentHourlyRate),
    0
  );

  return totalCost / staffWithTraining.length;
};

export const getAverageTrainingHours = (staff: StaffMember[]): number => {
  const staffWithTraining = staff.filter(s => s.training_hours > 0);

  if (staffWithTraining.length === 0) return 0;

  const totalHours = staffWithTraining.reduce((sum, s) => sum + s.training_hours, 0);

  return totalHours / staffWithTraining.length;
};

export const getStaffWithTrainingCount = (staff: StaffMember[]): number => {
  return staff.filter(s => s.training_hours > 0).length;
};

export interface HistoricalDataPoint {
  period: string;
  periodStart: Date;
  periodEnd: Date;
  turnoverRate: number;
  retentionRate: number;
  avgHeadcount: number;
  totalTrainingCost: number;
  avgTrainingCost: number;
  avgTrainingHours: number;
  activeCount: number;
  inactiveCount: number;
  separations: number;
  // Calculation details for tooltips
  startHeadcount: number;
  endHeadcount: number;
  newHires: number;
  remainedCount: number;
}

export const generateHistoricalData = (
  staff: StaffMember[],
  currentHourlyRate: number,
  months: number = 12
): HistoricalDataPoint[] => {
  const dataPoints: HistoricalDataPoint[] = [];
  const today = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const periodEnd = new Date(today.getFullYear(), today.getMonth() - i, today.getDate());
    const periodStart = new Date(periodEnd);
    periodStart.setMonth(periodStart.getMonth() - 1);

    // Calculate headcounts
    const startHeadcount = staff.filter(s => {
      const start = new Date(s.start_date);
      return start <= periodStart && (!s.end_date || new Date(s.end_date) > periodStart);
    }).length;

    const endHeadcount = staff.filter(s => {
      const start = new Date(s.start_date);
      return start <= periodEnd && (!s.end_date || new Date(s.end_date) > periodEnd);
    }).length;

    const avgHeadcount = (startHeadcount + endHeadcount) / 2;

    // Calculate separations (people who left during period)
    const separations = staff.filter(s => {
      if (!s.end_date) return false;
      const endDate = new Date(s.end_date);
      return endDate >= periodStart && endDate <= periodEnd;
    }).length;

    // Calculate new hires (people who started during period)
    const newHires = staff.filter(s => {
      const start = new Date(s.start_date);
      return start >= periodStart && start <= periodEnd;
    }).length;

    // Calculate who remained from start cohort
    const startingStaff = staff.filter(s => {
      const start = new Date(s.start_date);
      return start <= periodStart && (!s.end_date || new Date(s.end_date) > periodStart);
    });

    const remainedCount = startingStaff.filter(s => {
      if (!s.end_date) return true;
      const endDate = new Date(s.end_date);
      return endDate > periodEnd;
    }).length;

    // Calculate rates for this specific period
    const turnoverRate = calculateTurnoverRate(staff, periodStart, periodEnd);
    const retentionRate = calculateRetentionRate(staff, periodStart, periodEnd);

    // Get period staff for training calculations
    const periodStaff = filterStaffByPeriod(staff, periodStart, periodEnd);
    const activeStaff = getActiveStaff(periodStaff);
    const inactiveStaff = getInactiveStaff(periodStaff);

    dataPoints.push({
      period: periodEnd.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
      periodStart,
      periodEnd,
      turnoverRate,
      retentionRate,
      avgHeadcount,
      totalTrainingCost: getTotalTrainingCost(periodStaff, currentHourlyRate),
      avgTrainingCost: getAverageTrainingCost(periodStaff, currentHourlyRate),
      avgTrainingHours: getAverageTrainingHours(periodStaff),
      activeCount: activeStaff.length,
      inactiveCount: inactiveStaff.length,
      separations,
      startHeadcount,
      endHeadcount,
      newHires,
      remainedCount
    });
  }

  return dataPoints;
};

// Default benchmarks for UK Sushi Chef Hospitality sector (2025)
// Based on latest hospitality data and chef sector trends
export const DEFAULT_INDUSTRY_BENCHMARKS = {
  retentionRate: 33,  // 33% of sushi chefs remain for one year
  turnoverRate: 67,   // 67% leave each year
  source: 'UK Sushi Chef Hospitality sector (2025)'
};
