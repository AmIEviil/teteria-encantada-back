export const BUSINESS_TIMEZONE = 'America/Santiago';

// 'sv-SE' formatea como YYYY-MM-DD, que es justo lo que guarda una columna date.
export const todayInSantiago = (): string =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: BUSINESS_TIMEZONE }).format(
    new Date(),
  );

export const lastDayOfMonth = (mes: string): string => {
  const [year, month] = mes.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return `${mes}-${String(lastDay).padStart(2, '0')}`;
};
