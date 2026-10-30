import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { resetServerBuildNotice, useServerBuild } from '@/services/appVersion';
import AboutSettings from '../AboutSettings';

const renderAbout = () => render(<MemoryRouter><AboutSettings /></MemoryRouter>);

describe('About', () => {
  beforeEach(() => resetServerBuildNotice());

  it('shows this build and, once known, the server build', () => {
    renderAbout();
    expect(screen.getByText(__APP_VERSION__)).toBeInTheDocument();
    expect(screen.getByText('Not checked yet')).toBeInTheDocument();

    act(() => useServerBuild.setState({ build: { version: __APP_VERSION__, commit: null } }));
    expect(screen.getAllByText(__APP_VERSION__)).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Reload to update' })).toBeNull();
  });

  it('points out a newer server and offers to reload', () => {
    useServerBuild.setState({ build: { version: '99.0.0', commit: 'abc1234def' } });
    renderAbout();

    expect(screen.getByText(/99\.0\.0 \(abc1234\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload to update' })).toBeInTheDocument();
  });
});
