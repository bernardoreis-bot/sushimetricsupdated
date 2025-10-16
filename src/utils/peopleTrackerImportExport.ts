import type { StaffMember } from './peopleTrackerCalculations';
import { formatUKDate, formatUKDateTime, validateUKDate, convertUKDateToISO, UK_DATE_ERROR } from './dateFormat';

export interface ImportRow {
  name: string;
  role: string;
  start_date: string;
  end_date?: string;
  training_hours: number;
  department: string;
  notes?: string;
}

export const generateSampleCSV = (): string => {
  const instructionLine1 = '# SUSHI METRICS STAFF IMPORT TEMPLATE';
  const instructionLine2 = '# Date Format: DD/MM/YYYY (UK format only)';
  const instructionLine3 = '# Example dates: 25/12/2024, 01/10/2025';
  const instructionLine4 = '# Required fields: name, role, start_date';
  const headers = ['name', 'role', 'start_date', 'end_date', 'training_hours', 'department', 'notes'];
  const sampleRow1 = ['John Doe', 'Chef', '15/01/2024', '', '40', 'Kitchen', 'Example staff member'];
  const sampleRow2 = ['Jane Smith', 'Server', '20/03/2024', '15/09/2024', '25', 'Front of House', 'Left for university'];

  return [
    instructionLine1,
    instructionLine2,
    instructionLine3,
    instructionLine4,
    '',
    headers.join(','),
    sampleRow1.join(','),
    sampleRow2.join(',')
  ].join('\n');
};

export const downloadSampleTemplate = () => {
  const csv = generateSampleCSV();
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'sushi_metrics_staff_import_template.csv';
  link.click();
  URL.revokeObjectURL(url);
};

export const exportToCSV = (staff: StaffMember[], currentRate: number): void => {
  const instructionLine1 = '# SUSHI METRICS STAFF EXPORT';
  const instructionLine2 = `# Exported: ${formatUKDateTime(new Date())}`;
  const instructionLine3 = '# All dates in UK format DD/MM/YYYY';

  const headers = [
    'Name',
    'Role',
    'Department',
    'Start Date (DD/MM/YYYY)',
    'End Date (DD/MM/YYYY)',
    'Training Hours',
    'Training Rate Applied (£)',
    'Training Cost (£)',
    'Rate Locked At',
    'Status',
    'Notes'
  ];

  const rows = staff.map(s => [
    s.name,
    s.role,
    s.department || 'General',
    formatUKDate(s.start_date),
    s.end_date ? formatUKDate(s.end_date) : '',
    s.training_hours.toString(),
    (s.training_rate_applied !== null ? s.training_rate_applied : currentRate).toFixed(2),
    (s.training_cost_calculated !== null ? s.training_cost_calculated : s.training_hours * currentRate).toFixed(2),
    s.rate_locked_at ? formatUKDateTime(s.rate_locked_at) : '',
    s.end_date ? 'Inactive' : 'Active',
    s.notes || ''
  ]);

  const csv = [
    instructionLine1,
    instructionLine2,
    instructionLine3,
    '',
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const today = new Date();
  const ukDate = formatUKDate(today).replace(/\//g, '-');
  link.download = `sushi_metrics_staff_export_${ukDate}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

export const parseCSV = (content: string): ImportRow[] => {
  const lines = content.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
  if (lines.length < 2) throw new Error('CSV file is empty or invalid');

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[()]/g, '').replace(/\s+/g, '_'));
  const rows: ImportRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));

    const row: any = {};
    headers.forEach((header, index) => {
      const cleanHeader = header.replace('start_date_dd/mm/yyyy', 'start_date')
                                 .replace('end_date_dd/mm/yyyy', 'end_date')
                                 .replace('start_date_dd_mm_yyyy', 'start_date')
                                 .replace('end_date_dd_mm_yyyy', 'end_date');
      row[cleanHeader] = values[index] || '';
    });

    if (!row.name || !row.role || !row.start_date) {
      throw new Error(`Row ${i + 1}: Missing required fields (name, role, start_date)`);
    }

    rows.push({
      name: row.name,
      role: row.role,
      start_date: row.start_date,
      end_date: row.end_date || undefined,
      training_hours: parseFloat(row.training_hours || '0'),
      department: row.department || 'General',
      notes: row.notes || undefined
    });
  }

  return rows;
};

export const validateImportRow = (row: ImportRow, existingStaff: StaffMember[]): string[] => {
  const errors: string[] = [];

  if (row.name.length < 2) {
    errors.push('Name must be at least 2 characters');
  }

  const startDateValidation = validateUKDate(row.start_date);
  if (!startDateValidation.valid) {
    errors.push(`Start date: ${startDateValidation.error}`);
  }

  if (row.end_date) {
    const endDateValidation = validateUKDate(row.end_date);
    if (!endDateValidation.valid) {
      errors.push(`End date: ${endDateValidation.error}`);
    }
  }

  if (row.training_hours < 0) {
    errors.push('Training hours cannot be negative');
  }

  if (startDateValidation.valid) {
    const startISO = convertUKDateToISO(row.start_date);
    const endISO = row.end_date ? convertUKDateToISO(row.end_date) : null;

    if (endISO && startISO > endISO) {
      errors.push('End date must be after start date');
    }

    const isDuplicate = existingStaff.some(s => {
      if (s.name.toLowerCase() !== row.name.toLowerCase()) return false;

      const existingStart = new Date(s.start_date);
      const existingEnd = s.end_date ? new Date(s.end_date) : new Date('2099-12-31');
      const newStart = new Date(startISO);
      const newEnd = endISO ? new Date(endISO) : new Date('2099-12-31');

      return (newStart <= existingEnd && newEnd >= existingStart);
    });

    if (isDuplicate) {
      errors.push('Duplicate staff member with overlapping period');
    }
  }

  return errors;
};
