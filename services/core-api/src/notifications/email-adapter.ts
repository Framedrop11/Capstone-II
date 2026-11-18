import nodemailer from 'nodemailer';

export interface EmailNotificationAdapter {
  reportShared(recipient: string): Promise<void>;
  close(): void;
}

export function createEmailNotificationAdapter(config: {
  host: string;
  port: number;
  from: string;
}): EmailNotificationAdapter {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: false,
    connectionTimeout: 2_000,
    greetingTimeout: 2_000,
    socketTimeout: 4_000,
  });
  return {
    async reportShared(recipient) {
      await transport.sendMail({
        from: config.from,
        to: recipient,
        subject: 'A CareLens report was shared with you',
        text: 'A patient has shared a CareLens screening report with you. Sign in to CareLens to review it. Access may be revoked by the patient at any time. CareLens is a screening aid, not a diagnosis.',
      });
    },
    close() { transport.close(); },
  };
}
