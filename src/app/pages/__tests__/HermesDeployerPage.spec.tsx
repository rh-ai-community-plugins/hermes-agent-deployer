import React from 'react';
import { render, screen } from '@testing-library/react';
import HermesDeployerPage from '../HermesDeployerPage';

jest.mock('../../hooks/useInstances', () => ({
  useInstances: () => ({
    instances: [],
    loading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));

jest.mock('../../hooks/useInstanceMutation', () => ({
  useInstanceMutation: () => ({
    createInstance: jest.fn(),
    deleteInstance: jest.fn(),
    creating: false,
    deleting: false,
    error: null,
  }),
}));

jest.mock('../../hooks/useNamespaces', () => ({
  useNamespaces: () => ({ namespaces: [], loading: false, error: null, refresh: jest.fn() }),
}));

jest.mock('../../hooks/useInstanceDefaults', () => ({
  useInstanceDefaults: () => ({ defaults: null, loading: false, error: null }),
}));

jest.mock('../../api/instanceApi', () => ({
  listAgentTypes: jest.fn().mockResolvedValue([]),
}));

describe('HermesDeployerPage', () => {
  it('renders the page title', () => {
    render(<HermesDeployerPage />);
    expect(screen.getByText('Hermes Agent Deployer')).toBeTruthy();
  });

  it('renders the Deploy New Instance button', () => {
    render(<HermesDeployerPage />);
    const buttons = screen.getAllByText('Deploy New Instance');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('shows empty state when no instances', () => {
    render(<HermesDeployerPage />);
    expect(screen.getByText('No instances deployed')).toBeTruthy();
  });
});
