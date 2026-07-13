const sendMail = jest.fn().mockResolvedValue({ messageId: '1' });
jest.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail }),
}));

import { MailerService } from './mailer.service';

describe('MailerService', () => {
  beforeEach(() => {
    process.env.SMTP_HOST = 'smtp.test';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'u';
    process.env.SMTP_PASS = 'p';
    process.env.SMTP_FROM = 'from@test.cl';
    sendMail.mockClear();
  });

  it('envía con from de env y adjuntos', async () => {
    const svc = new MailerService();
    await svc.send({
      to: 'buyer@test.cl',
      subject: 'Tus tickets',
      html: '<p>hola</p>',
      attachments: [{ filename: 'tickets.pdf', content: Buffer.from('x') }],
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const arg = sendMail.mock.calls[0][0];
    expect(arg.from).toBe('from@test.cl');
    expect(arg.to).toBe('buyer@test.cl');
    expect(arg.attachments[0].filename).toBe('tickets.pdf');
  });
});
