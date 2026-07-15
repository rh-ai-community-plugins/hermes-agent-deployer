import React from 'react';
import { render, screen } from '@testing-library/react';
import HermesNavIcon from '../HermesNavIcon';

describe('HermesNavIcon', () => {
  it('renders the rocket emoji', () => {
    render(<HermesNavIcon />);
    expect(screen.getByRole('img', { name: /hermes agent deployer/i })).toBeTruthy();
  });

  it('displays the emoji text', () => {
    const { container } = render(<HermesNavIcon />);
    expect(container.textContent).toBe('🚀');
  });
});
