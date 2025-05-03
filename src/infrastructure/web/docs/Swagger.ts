import path from 'path';

import { injectable, inject } from 'inversify';

import { IConfig } from '@application/contracts/infrastructure';
import { Types } from '@interface/types';

interface SwaggerOptions {
  swaggerDefinition: {
    openapi: string;
    info: {
      title: string;
      description: string;
      produces: string[];
      consumes: string[];
      contact: {
        name: string;
        url: string;
        email: string;
      };
      version: string;
    };
    components: {
      securitySchemes: {
        bearerAuth: {
          type: string;
          scheme: string;
          bearerFormat: string;
          description: string;
        };
      };
    };
    servers: {
      url: string;
      description: string;
    }[];
    security: { [key: string]: string[] }[];
  };
  apis: string[];
}

@injectable()
export class SwaggerOptionsProvider {
  constructor(@inject(Types.Config) private config: IConfig) {}

  public getSwaggerOptions(): SwaggerOptions {
    return {
      swaggerDefinition: {
        openapi: '3.0.3',
        info: {
          title: 'PPL API.',
          description: 'Documentation of the PPL API',
          produces: ['application/json'],
          consumes: ['application/json'],
          contact: {
            name: 'API Support',
            url: 'https://www.ppl.com.br/support',
            email: 'support@ppl.com.br'
          },
          version: '1.0.0'
        },
        components: {
          securitySchemes: {
            bearerAuth: {
              description: 'Enter your JWT token in the format: Bearer <token>',
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT'
            }
          }
        },
        servers: [
          {
            url: `${this.config.server.protocol}://${this.config.server.host}:${this.config.server.port}/api/${this.config.server.version}`,
            description: 'Development server'
          },
          {
            url: 'https://hom.ppl.com.br/api/',
            description: 'Staging server'
          },
          {
            url: 'https://ppl.com.br/api/',
            description: 'Production server'
          }
        ],
        security: [
          {
            bearerAuth: []
          }
        ]
      },
      // Look for documentation in both web routes and enterprise entities directories
      apis: [
        path.resolve('./src/infrastructure/web/routes/modules', '*.ts'),
        path.resolve('./src/enterprise/entities', '*.ts')
      ]
    };
  }
}
