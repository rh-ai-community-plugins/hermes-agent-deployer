import React from 'react';
import { render, screen } from '@testing-library/react';
import InstanceList from '../InstanceList';
import { HermesInstance } from '../../types';

const instance: HermesInstance = {
  name: 'agent-1',
  displayName: 'Agent 1',
  namespace: 'test-ns',
  agentType: 'hermes',
  status: 'Running',
  routeUrl: 'https://agent-1.example.com',
  createdAt: '2026-01-01T00:00:00Z',
  config: { modelName: 'llama-3', modelUrl: 'https://vllm.example.com/v1', pvcSize: '1Gi', oauthProxyEnabled: false },
};

describe('InstanceList', () => {
  it('shows empty state when there are no instances', () => {
    render(<InstanceList instances={[]} onDelete={jest.fn()} onDeploy={jest.fn()} loading={false} />);
    expect(screen.getByText('No instances deployed')).toBeTruthy();
    expect(screen.getByText('Deploy New Instance')).toBeTruthy();
  });

  it('renders instance rows', () => {
    render(<InstanceList instances={[instance]} onDelete={jest.fn()} onDeploy={jest.fn()} loading={false} />);
    expect(screen.getByText('Agent 1')).toBeTruthy();
    expect(screen.getByText('test-ns')).toBeTruthy();
    expect(screen.getByText('Running')).toBeTruthy();
  });

  it('renders route URL as a link', () => {
    render(<InstanceList instances={[instance]} onDelete={jest.fn()} onDeploy={jest.fn()} loading={false} />);
    const link = screen.getByText('https://agent-1.example.com');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('https://agent-1.example.com');
  });

  it('shows dash when no route URL', () => {
    const noRoute = { ...instance, routeUrl: '' };
    render(<InstanceList instances={[noRoute]} onDelete={jest.fn()} onDeploy={jest.fn()} loading={false} />);
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('does not show empty state while loading', () => {
    const { container } = render(<InstanceList instances={[]} onDelete={jest.fn()} onDeploy={jest.fn()} loading={true} />);
    expect(container.querySelector('table')).toBeTruthy();
  });
});
