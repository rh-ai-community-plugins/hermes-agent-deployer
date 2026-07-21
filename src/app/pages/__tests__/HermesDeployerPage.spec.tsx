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

jest.mock('../../hooks/useProjects', () => ({
  useProjects: () => ({
    projects: [
      { metadata: { name: 'my-project', uid: '1' } },
      { metadata: { name: 'other-project', uid: '2' } },
    ],
    loading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));

jest.mock('../../api/instanceApi', () => ({
  listAgentTypes: jest.fn().mockResolvedValue([]),
}));

describe('HermesDeployerPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the page title', () => {
    render(<HermesDeployerPage />);
    expect(screen.getByText('Hermes Agent Deployer')).toBeTruthy();
  });

  it('renders the project selector', () => {
    render(<HermesDeployerPage />);
    expect(screen.getByLabelText('Select a project')).toBeTruthy();
  });

  it('shows select prompt when no project chosen', () => {
    render(<HermesDeployerPage />);
    expect(screen.getByText('Select a project', { selector: 'h3' })).toBeTruthy();
  });
});
