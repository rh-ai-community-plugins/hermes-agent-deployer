import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import PolicySelector from '../PolicySelector';

const MOCK_TEMPLATES = {
  templates: [
    { tier: 'standard', displayName: 'Standard', description: 'Standard policy' },
    { tier: 'restricted', displayName: 'Restricted', description: 'Restricted policy' },
    { tier: 'permissive', displayName: 'Permissive', description: 'Permissive policy' },
  ],
};

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(MOCK_TEMPLATES),
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('PolicySelector', () => {
  it('fetches and renders policy templates', async () => {
    render(<PolicySelector value="standard" onChange={jest.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('Standard')).toBeTruthy();
    });
    expect(global.fetch).toHaveBeenCalledWith('/hermes-agent-deployer/api/policies/templates');
  });

  it('shows description for selected tier', async () => {
    render(<PolicySelector value="standard" onChange={jest.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('Standard policy')).toBeTruthy();
    });
  });

  it('renders empty when fetch fails', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('fail'));
    const { container } = render(<PolicySelector value="standard" onChange={jest.fn()} />);
    await waitFor(() => {
      const select = container.querySelector('select');
      expect(select?.options.length ?? 0).toBe(0);
    });
  });
});
