export const formatUKDate = (dateString: string | Date | null | undefined): string => {
  if (!dateString) return '';

  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;

  if (isNaN(date.getTime())) return '';

  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

export const formatUKDateTime = (dateString: string | Date | null | undefined): string => {
  if (!dateString) return '';

  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;

  if (isNaN(date.getTime())) return '';

  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const parseUKDate = (ukDateString: string): Date | null => {
  if (!ukDateString) return null;

  const parts = ukDateString.trim().split('/');
  if (parts.length !== 3) return null;

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);

  if (day < 1 || day > 31 || month < 0 || month > 11 || year < 1900 || year > 2100) {
    return null;
  }

  const date = new Date(year, month, day);

  if (isNaN(date.getTime())) return null;
  if (date.getDate() !== day || date.getMonth() !== month || date.getFullYear() !== year) {
    return null;
  }

  return date;
};

export const validateUKDate = (dateString: string): { valid: boolean; error?: string } => {
  if (!dateString || !dateString.trim()) {
    return { valid: false, error: 'Date is required' };
  }

  const ukDatePattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  if (!ukDatePattern.test(dateString.trim())) {
    return {
      valid: false,
      error: 'Date must be in UK format DD/MM/YYYY. Example: 01/10/2025'
    };
  }

  const date = parseUKDate(dateString);
  if (!date) {
    return {
      valid: false,
      error: 'Invalid date. Please check day, month, and year values are correct.'
    };
  }

  return { valid: true };
};

export const formatDateForInput = (dateString: string | Date | null | undefined): string => {
  if (!dateString) return '';

  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;

  if (isNaN(date.getTime())) return '';

  return date.toISOString().split('T')[0];
};

export const convertISOToUKDate = (isoDate: string): string => {
  if (!isoDate) return '';
  return formatUKDate(isoDate);
};

export const convertUKDateToISO = (ukDate: string): string => {
  const date = parseUKDate(ukDate);
  if (!date) return '';
  return date.toISOString().split('T')[0];
};

export const UK_DATE_FORMAT_HINT = 'UK date format DD/MM/YYYY required';
export const UK_DATE_EXAMPLE = 'Example: 25/12/2025';
export const UK_DATE_ERROR = 'Date must be in UK format DD/MM/YYYY. Example: 01/10/2025';
