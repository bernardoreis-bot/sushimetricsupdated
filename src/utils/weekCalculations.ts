export interface WeekInfo {
  weekNumber: 1 | 2 | 3;
  endingDate: Date;
  formattedDate: string;
  displayLabel: string;
}

export function getLastThreeSundays(): WeekInfo[] {
  const today = new Date();
  const sundays: WeekInfo[] = [];

  let currentDate = new Date(today);
  currentDate.setHours(0, 0, 0, 0);

  const dayOfWeek = currentDate.getDay();
  const daysUntilLastSunday = dayOfWeek === 0 ? 0 : dayOfWeek;
  currentDate.setDate(currentDate.getDate() - daysUntilLastSunday);

  for (let i = 0; i < 3; i++) {
    const sunday = new Date(currentDate);
    sunday.setDate(currentDate.getDate() - (i * 7));

    const weekNumber = (3 - i) as 1 | 2 | 3;
    const formattedDate = sunday.toISOString().split('T')[0];
    const displayDate = sunday.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    sundays.push({
      weekNumber,
      endingDate: sunday,
      formattedDate,
      displayLabel: `Week ${weekNumber} (ending ${displayDate})`
    });
  }

  return sundays.reverse();
}

export function formatDateForDisplay(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export function getWeekKey(weekNumber: 1 | 2 | 3): 'week1' | 'week2' | 'week3' {
  return `week${weekNumber}` as 'week1' | 'week2' | 'week3';
}
