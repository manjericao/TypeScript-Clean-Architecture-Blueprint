import { Request, Response, NextFunction } from 'express';

import { HttpRequest, HttpResponse, HttpNext, RequestParams } from 'src/interface/http/adapters';

export class ExpressAdapter {
  static toHttpRequest(req: Request): HttpRequest {
    const params: RequestParams = {
      id: req.params.id,
      email: req.params.email,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
      search: req.query.search as string,
      sort: req.query.sort as string,
      order: req.query.order as string,
      fields: req.query.fields as string,
      include: req.query.include as string,
      exclude: req.query.exclude as string
    };

    return {
      body: req.body,
      params,
      query: req.query as Record<string, unknown>,
      headers: req.headers as Record<string, string>
    };
  }

  static toHttpResponse(res: Response): HttpResponse {
    return {
      status: (code: number) => ({
        json: (data: unknown) => res.status(code).json(data)
      })
    };
  }

  static toHttpNext(next: NextFunction): HttpNext {
    return () => next();
  }
}
