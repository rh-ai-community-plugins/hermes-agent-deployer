import { renderHook, waitFor, act } from '@testing-library/react';
import { useInstances } from '../useInstances';

beforeEach(() => {
  jest.useFakeTimers();
  jest.restoreAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

const mockInstances = [
  { name: 'a1', namespace: 'ns1', agentType: 'hermes', status: 'Running', routeUrl: '', createdAt: '', config: { modelName: 'm', modelUrl: 'u', pvcSize: '1Gi', oauthProxyEnabled: false } },
];

describe('useInstances', () => {
  it('fetches instances on mount', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ instances: mockInstances, errors: [] }),
    });

    const { result } = renderHook(() => useInstances());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.instances).toHaveLength(1);
    expect(result.current.instances[0].name).toBe('a1');
  });

  it('sets error on fetch failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const { result } = renderHook(() => useInstances());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
  });

  it('polls on an interval', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ instances: [], errors: [] }),
    });

    renderHook(() => useInstances());

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    act(() => { jest.advanceTimersByTime(10000); });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });

  it('calls the BFF endpoint', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ instances: [], errors: [] }),
    });

    renderHook(() => useInstances());

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(global.fetch).toHaveBeenCalledWith(
      '/hermes-agent-deployer/api/instances',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
