import React from 'react';
import { render, screen } from '@testing-library/react';
import StatusBadge from '../StatusBadge';
import { InstanceStatus } from '../../types';

describe('StatusBadge', () => {
  const statuses: InstanceStatus[] = ['Running', 'Starting', 'Pending', 'Error', 'Terminating', 'Unknown'];

  it.each(statuses)('renders the %s status text', (status) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(status)).toBeTruthy();
  });

  it('renders as a PatternFly Label', () => {
    const { container } = render(<StatusBadge status="Running" />);
    expect(container.querySelector('.pf-v6-c-label')).toBeTruthy();
  });
});
