declare module 'nodemailer' {
  interface Transporter {
    sendMail(message: {
      from: string;
      to: string;
      subject: string;
      text: string;
    }): Promise<unknown>;
    close(): void;
  }

  const nodemailer: {
    createTransport(options: {
      host: string;
      port: number;
      secure: boolean;
      connectionTimeout: number;
      greetingTimeout: number;
      socketTimeout: number;
    }): Transporter;
  };

  export default nodemailer;
}
