import React from 'react';
import { render, screen } from '@testing-library/react';

jest.unmock('react-router-dom');

import { MemoryRouter } from 'react-router-dom';
import App from '../App';

jest.mock('../components/CommunityBanner', () => () => <div data-testid="community-banner">Banner</div>);
jest.mock('../pages/HermesDeployerPage', () => () => <div data-testid="deployer-page">Page</div>);

const renderApp = () =>
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );

describe('App', () => {
  it('renders the CommunityBanner', () => {
    renderApp();
    expect(screen.getByTestId('community-banner')).toBeTruthy();
  });

  it('wraps content in community-plugin-layout', () => {
    const { container } = renderApp();
    expect(container.querySelector('.community-plugin-layout')).toBeTruthy();
  });
});
