/**
 * mailer.js - Service to send emails
 */

class mailer {
  static deps = { modules: [], config: 'mailer' };

  constructor(backpack) {
    this.config = backpack.config.mailer;
    if (this.config.ses?.credentials?.accessKeyId) {
      // Use SES instead of nodemailer
      const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
      const client = new SESClient(this.config.ses);
      this.sendEmail = async (mailerObject) => {
        const sesObject = {
          Destination: { ToAddresses: [mailerObject.to] },
          ReplyToAddresses: [mailerObject.from],
          Source: mailerObject.from,
          ReturnPath: mailerObject.from,
          Message: {
            Subject: { Data: mailerObject.subject },
            //Html: { Data: this.template.render(mailerObject.page, data), },
            Body: { Text: { Data: mailerObject.text } },
          },
        };
        console.log('sesObject', sesObject); // XXX XXX
        const command = new SendEmailCommand(sesObject);
        return await client.send(command);
      };
    } else {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport(this.config.transport_options);
      this.sendEmail = (mailerObject) => transporter.sendMail({ ...mailerObject, from: `${mailerObject.source} <${mailerObject.from}>` });
    }
  }

  async send(ctx, type, details) {
    const f = 'mailer.send:' + type + ':';
    const { email: to, subject, text } = details;
    const mailOptions = { source: '__TEMPLATE_PROJ_NAME__', from: this.config.from, to, subject, text };
    if (this.config.level3) ctx.log(f, { mailOptions });
    const start_time = Date.now();
    const transporterResponse = await this.sendEmail(mailOptions);
    const time_ms = Date.now() - start_time;
    ctx.log(f, { transporterResponse, time_ms });
  }
}

exports.mailer = mailer;
