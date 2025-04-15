export interface RequestParams {
  id?: string;
  email?: string;
  page?: number;
  limit?: number;
  offset?: number;
  search?: string;
  sort?: string;
  order?: string;
  fields?: string;
  include?: string;
  exclude?: string;
}

export interface HttpRequest {
  body?: unknown;
  params: RequestParams;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface ResponseObject {
  json: (data: unknown) => void;
}

export interface HttpResponse {
  status: (code: number) => ResponseObject;
}

export type HttpNext = () => void;

export type ControllerMethod = (
  request: HttpRequest,
  response: HttpResponse,
  next: HttpNext
) => Promise<void>;
