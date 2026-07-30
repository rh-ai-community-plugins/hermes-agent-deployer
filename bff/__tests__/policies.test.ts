import { policiesHandler } from '../src/routes/policies';
import { Request, Response } from 'express';

function mockRes() {
  const res: Record<string, unknown> = {
    body: undefined,
    json(data: unknown) {
      res.body = data;
      return res;
    },
  };
  return res as unknown as Response;
}

describe('GET /api/policies/templates', () => {
  it('returns policy templates', () => {
    const res = mockRes();
    policiesHandler({} as Request, res);
    const body = (res as unknown as Record<string, unknown>).body as {
      templates: Array<{ tier: string; displayName: string; description: string }>;
    };
    expect(body.templates).toHaveLength(3);
    expect(body.templates.map((t) => t.tier)).toEqual(['standard', 'restricted', 'permissive']);
  });

  it('each template has required fields', () => {
    const res = mockRes();
    policiesHandler({} as Request, res);
    const body = (res as unknown as Record<string, unknown>).body as {
      templates: Array<{ tier: string; displayName: string; description: string }>;
    };
    for (const t of body.templates) {
      expect(t.tier).toBeTruthy();
      expect(t.displayName).toBeTruthy();
      expect(t.description).toBeTruthy();
    }
  });
});
