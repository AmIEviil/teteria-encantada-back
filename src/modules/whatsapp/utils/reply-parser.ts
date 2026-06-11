export type ConfirmationDecision = 'CONFIRM' | 'DECLINE' | 'UNKNOWN';

const AFFIRMATIVE = new Set(['si', 'confirm_yes', 'yes']);
const NEGATIVE = new Set(['no', 'confirm_no', 'cancel']);

// Quita tildes/diacríticos: "sí" -> "si". Rango ̀-ͯ = marcas combinantes.
function deaccent(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function parseConfirmationReply(raw: string): ConfirmationDecision {
  const key = deaccent(raw.trim().toLowerCase());

  if (AFFIRMATIVE.has(key)) {
    return 'CONFIRM';
  }
  if (NEGATIVE.has(key)) {
    return 'DECLINE';
  }
  return 'UNKNOWN';
}
