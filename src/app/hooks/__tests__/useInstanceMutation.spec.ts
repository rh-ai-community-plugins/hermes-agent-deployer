import { renderHook, act, waitFor } from '@testing-library/react';
import { useInstanceMutation } from '../useInstanceMutation';

jest.mock('../../api/instanceApi', () => ({
  createInstance: jest.fn(),
  deleteInstance: jest.fn(),
  suspendInstance: jest.fn(),
  resumeInstance: jest.fn(),
}));

import { createInstance, deleteInstance, suspendInstance, resumeInstance } from '../../api/instanceApi';
const mockCreate = createInstance as jest.MockedFunction<typeof createInstance>;
const mockDelete = deleteInstance as jest.MockedFunction<typeof deleteInstance>;
const mockSuspend = suspendInstance as jest.MockedFunction<typeof suspendInstance>;
const mockResume = resumeInstance as jest.MockedFunction<typeof resumeInstance>;

const req = {
  name: 'test',
  displayName: 'Test',
  namespace: 'ns',
  agentType: 'hermes',
  modelName: 'm',
  modelUrl: 'u',
  apiKey: 'k',
  pvcSize: '1Gi',
  oauthProxyEnabled: false,
};

const instance = {
  name: 'test',
  displayName: 'Test',
  namespace: 'ns',
  agentType: 'hermes',
  status: 'Pending' as const,
  routeUrl: '',
  createdAt: '',
  config: { modelName: 'm', modelUrl: 'u', pvcSize: '1Gi', oauthProxyEnabled: false },
};

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('useInstanceMutation', () => {
  it('creates an instance and tracks creating state', async () => {
    mockCreate.mockResolvedValue(instance);

    const { result } = renderHook(() => useInstanceMutation());
    expect(result.current.creating).toBe(false);

    let promise: Promise<unknown>;
    act(() => {
      promise = result.current.createInstance(req);
    });

    await waitFor(() => expect(result.current.creating).toBe(false));
    await promise!;
    expect(mockCreate).toHaveBeenCalledWith(req);
  });

  it('sets error on create failure', async () => {
    mockCreate.mockRejectedValue(new Error('Conflict'));

    const { result } = renderHook(() => useInstanceMutation());

    await act(async () => {
      try {
        await result.current.createInstance(req);
      } catch {
        // expected
      }
    });

    expect(result.current.error).toBe('Conflict');
    expect(result.current.creating).toBe(false);
  });

  it('deletes an instance', async () => {
    mockDelete.mockResolvedValue();

    const { result } = renderHook(() => useInstanceMutation());

    await act(async () => {
      await result.current.deleteInstance('test', 'ns');
    });

    expect(mockDelete).toHaveBeenCalledWith('test', 'ns');
    expect(result.current.deleting).toBe(false);
  });

  it('suspends an instance', async () => {
    mockSuspend.mockResolvedValue();

    const { result } = renderHook(() => useInstanceMutation());

    await act(async () => {
      await result.current.suspendInstance('test', 'ns');
    });

    expect(mockSuspend).toHaveBeenCalledWith('test', 'ns');
  });

  it('resumes an instance', async () => {
    mockResume.mockResolvedValue();

    const { result } = renderHook(() => useInstanceMutation());

    await act(async () => {
      await result.current.resumeInstance('test', 'ns');
    });

    expect(mockResume).toHaveBeenCalledWith('test', 'ns');
  });
});
