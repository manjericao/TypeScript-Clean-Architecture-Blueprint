declare module 'xss-clean' {
  import { RequestHandler } from 'express';

  interface XssCleanOptions { // eslint-disable-line
  }

  export default function xssClean(options?: XssCleanOptions): RequestHandler;
}
