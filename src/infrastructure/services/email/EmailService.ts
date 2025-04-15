import nodemailer, { Transporter } from 'nodemailer';
import { inject, injectable } from 'inversify';
import * as fs from 'fs';
import * as path from 'path';
import * as handlebars from 'handlebars';
import { Types } from '@interface/types';
import { EmailOptions, IEmailService } from '@application/contracts/communication/email';
import { IConfig, ILogger } from '@application/contracts/infrastructure';

/**
 * Email service implementation using Nodemailer
 */
@injectable()
export class EmailService implements IEmailService {
  private transporter?: Transporter;
  private isConfigured: boolean = false;

  constructor(
    @inject(Types.Config) private readonly config: IConfig,
    @inject(Types.Logger) private readonly logger: ILogger
  ) {
    this.setupTransporter();
  }

  private setupTransporter(): void {
    try {
      const { smtp } = this.config;

      if (!smtp || !smtp.host || !smtp.port) {
        this.logger.error('Email configuration missing. Email service will not work.');
        return;
      }

      this.transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure || false,
        auth: {
          user: smtp.username,
          pass: smtp.password
        }
      });

      this.isConfigured = true;
    } catch (error) {
      this.logger.error('Failed to configure email transporter', { error });
    }
  }

  public async verify(): Promise<boolean> {
    if (!this.isConfigured) {
      this.logger.error('Email service not configured for verification');
      return false;
    }

    try {
      await this.transporter!.verify();
      this.logger.info('Email service connection verified successfully');
      return true;
    } catch (error) {
      this.logger.error('Email service connection verification failed', { error });
      return false;
    }
  }

  public async sendEmail(options: EmailOptions): Promise<void> {
    if (!this.isConfigured) {
      throw new Error('Email service not configured');
    }

    if (!options.to) {
      throw new Error('Recipient email address is required');
    }

    try {
      // Handle template rendering if template engine is configured
      let html = options.html;

      if (options.template && options.context) {
        html = this.renderTemplate(options.template, options.context);
      }

      const mailOptions = {
        from: this.config.smtp?.from || '"No Reply" <noreply@example.com>',
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: html
      };

      const info = await this.transporter!.sendMail(mailOptions) as { messageId: string };

      this.logger.info('Email sent successfully', {
        messageId: info.messageId,
        to: options.to,
        subject: options.subject
      });
    } catch (error) {
      this.logger.error('Failed to send email', { error, to: options.to });
      throw new Error(`Failed to send email: ${(error as Error).message}`);
    }
  }

  private renderTemplate(template: string, context: Record<string, unknown>): string {
    try {
      this.logger.debug('Rendering email template with Handlebars', { template, context });

      const templatePath = path.join('views', `${template}.hbs`);

      // Check if template exists
      if (!fs.existsSync(templatePath)) {
        this.logger.error('Email template not found', { template, path: templatePath });
        new Error(`Email template not found: ${template}`);
      }

      const templateContent = fs.readFileSync(templatePath, 'utf8');

      // Compile the template with Handlebars
      const compiledTemplate = handlebars.compile(templateContent);

      // Render the template with the provided context
      return compiledTemplate(context);
    } catch (error) {
      this.logger.error('Failed to render email template', {
        template,
        error: error instanceof Error ? error.message : String(error)
      });

      try {
        const fallbackPath = path.join('views', 'error-fallback.hbs');
        const fallbackTemplate = fs.readFileSync(fallbackPath, 'utf8');
        const compiledFallback = handlebars.compile(fallbackTemplate);

        return compiledFallback({
          subject: context.subject || 'Email Notification'
        });
      } catch (fallbackError) {
        this.logger.error('Error loading fallback template', {
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        });
        return `<!DOCTYPE html>
                <html lang="en">
                <head>
                  <meta charset="utf-8">
                  <title>${typeof context.subject === 'string' ? context.subject : 'Email Notification'}</title>
                </head>
                <body>
                  <h1>Message</h1>
                  <p>An error occurred while rendering the email template.</p>
                </body>
                </html>`;
      }
    }
  }
}
