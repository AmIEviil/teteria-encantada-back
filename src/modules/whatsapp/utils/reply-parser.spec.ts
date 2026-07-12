import { parseConfirmationReply } from './reply-parser';

describe('parseConfirmationReply', () => {
  it('interpreta texto afirmativo como CONFIRM', () => {
    expect(parseConfirmationReply('Sí')).toBe('CONFIRM');
    expect(parseConfirmationReply('si')).toBe('CONFIRM');
    expect(parseConfirmationReply('SI')).toBe('CONFIRM');
    expect(parseConfirmationReply('  sí  ')).toBe('CONFIRM');
  });

  it('interpreta texto negativo como DECLINE', () => {
    expect(parseConfirmationReply('No')).toBe('DECLINE');
    expect(parseConfirmationReply('no')).toBe('DECLINE');
  });

  it('interpreta payloads de botón', () => {
    expect(parseConfirmationReply('CONFIRM_YES')).toBe('CONFIRM');
    expect(parseConfirmationReply('CONFIRM_NO')).toBe('DECLINE');
  });

  it('devuelve UNKNOWN para cualquier otra cosa', () => {
    expect(parseConfirmationReply('quizás')).toBe('UNKNOWN');
    expect(parseConfirmationReply('')).toBe('UNKNOWN');
  });
});
