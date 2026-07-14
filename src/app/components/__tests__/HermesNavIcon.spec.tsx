import React from 'react';
import { render } from '@testing-library/react';
import HermesNavIcon from '../HermesNavIcon';

describe('HermesNavIcon', () => {
  it('renders an SVG element', () => {
    const { container } = render(<HermesNavIcon />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('has the HA text', () => {
    const { container } = render(<HermesNavIcon />);
    const text = container.querySelector('text');
    expect(text?.textContent).toBe('HA');
  });

  it('uses the pf-v6-svg class', () => {
    const { container } = render(<HermesNavIcon />);
    const svg = container.querySelector('svg');
    expect(svg?.classList.contains('pf-v6-svg')).toBe(true);
  });
});
