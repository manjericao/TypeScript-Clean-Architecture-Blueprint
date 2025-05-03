import { existsSync, mkdirSync } from 'fs';
import { basename } from 'path';

import { injectable } from 'inversify';
import {
  createLogger,
  format,
  transports,
  config as winstonConfig,
  Logger,
  Logform
} from 'winston';

import { ILogger } from '@application/contracts/infrastructure';

@injectable()
export class WinstonLogger implements ILogger {
  private logger: Logger;

  constructor() {
    const logDir = 'logs';
    if (!existsSync(logDir)) {
      mkdirSync(logDir);
    }

    const baseFormat = format.combine(
      format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      format.errors({ stack: true }),
      format.splat(),
      format.json()
    );

    const consoleFormat = format.combine(format.colorize(), format.simple());

    const env = process.env.NODE_ENV || 'development';

    const loggerOptions = this.getLoggerOptions(env, logDir, baseFormat, consoleFormat);
    this.logger = createLogger(loggerOptions);
  }

  private getLoggerOptions(
    env: string,
    logDir: string,
    baseFormat: Logform.Format,
    consoleFormat: Logform.Format
  ) {
    const commonMeta = { service: 'ppl-service' };

    switch (env) {
      case 'development':
        return {
          levels: winstonConfig.npm.levels,
          format: format.combine(format.label({ label: basename(__filename) }), baseFormat),
          defaultMeta: { ...commonMeta },
          transports: [
            new transports.File({ filename: `${logDir}/dev-error.log`, level: 'error' }),
            new transports.File({ filename: `${logDir}/dev-combined.log` }),
            new transports.Console({ format: consoleFormat })
          ]
        };

      case 'test':
        return {
          level: 'debug',
          format: baseFormat,
          defaultMeta: { ...commonMeta, service: `${commonMeta.service}-test` },
          transports: [
            new transports.File({ filename: `${logDir}/test-error.log`, level: 'error' }),
            new transports.File({ filename: `${logDir}/test-combined.log`, level: 'debug' }),
            new transports.Console({ format: consoleFormat })
          ]
        };

      default: // production or any other environment
        return {
          levels: winstonConfig.npm.levels,
          format: baseFormat,
          defaultMeta: { ...commonMeta },
          transports: [
            new transports.File({ filename: `${logDir}/prod-error.log`, level: 'error' }),
            new transports.File({ filename: `${logDir}/prod-combined.log` }),
            new transports.Console({ format: consoleFormat })
          ]
        };
    }
  }

  info(message: string, ...args: unknown[]): void {
    this.logger.info(message, ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    this.logger.debug(message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.logger.error(message, ...args);
  }
}
