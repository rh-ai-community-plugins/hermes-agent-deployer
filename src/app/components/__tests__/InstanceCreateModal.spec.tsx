import React from 'react';
import { render, screen } from '@testing-library/react';
import InstanceCreateModal from '../InstanceCreateModal';

jest.mock('../../hooks/useNamespaces', () => ({
  useNamespaces: () => ({ namespaces: ['ns-1', 'ns-2'], loading: false, error: null, refresh: jest.fn() }),
}));

jest.mock('../../hooks/useInstanceDefaults', () => ({
  useInstanceDefaults: () => ({
    defaults: {
      hermesImage: 'quay.io/test:v1',
      oauthProxy: { enabled: true, image: 'proxy:v1' },
      pvc: { size: '2Gi' },
      resources: { requests: { cpu: '200m', memory: '512Mi' }, limits: { cpu: '1', memory: '1Gi' } },
    },
    loading: false,
    error: null,
  }),
}));

jest.mock('../../api/instanceApi', () => ({
  listAgentTypes: jest.fn().mockResolvedValue([
    { name: 'hermes', displayName: 'Hermes Agent', description: 'Test', image: 'test:v1' },
  ]),
}));

describe('InstanceCreateModal', () => {
  it('renders the modal title when open', () => {
    render(<InstanceCreateModal isOpen={true} onClose={jest.fn()} onSubmit={jest.fn()} />);
    expect(screen.getByText('Deploy New Agent Instance')).toBeTruthy();
  });

  it('has required form fields', () => {
    render(<InstanceCreateModal isOpen={true} onClose={jest.fn()} onSubmit={jest.fn()} />);
    expect(screen.getByText('Instance name')).toBeTruthy();
    expect(screen.getByText('Namespace')).toBeTruthy();
    expect(screen.getByText('Model name')).toBeTruthy();
    expect(screen.getByText('Model API URL')).toBeTruthy();
    expect(screen.getByText('API key')).toBeTruthy();
  });

  it('has Deploy and Cancel buttons', () => {
    render(<InstanceCreateModal isOpen={true} onClose={jest.fn()} onSubmit={jest.fn()} />);
    expect(screen.getByText('Deploy')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  it('does not render content when closed', () => {
    render(<InstanceCreateModal isOpen={false} onClose={jest.fn()} onSubmit={jest.fn()} />);
    expect(screen.queryByText('Deploy New Agent Instance')).toBeNull();
  });
});
