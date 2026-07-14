import { renderHook, waitFor } from '@testing-library/react';
import { useNamespaces } from '../useNamespaces';

jest.mock('../../api/k8sApi', () => ({
  listNamespaces: jest.fn(),
}));

import { listNamespaces } from '../../api/k8sApi';
const mockListNamespaces = listNamespaces as jest.MockedFunction<typeof listNamespaces>;

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('useNamespaces', () => {
  it('returns namespaces on success', async () => {
    mockListNamespaces.mockResolvedValue(['ns1', 'ns2']);

    const { result } = renderHook(() => useNamespaces());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.namespaces).toEqual(['ns1', 'ns2']);
    expect(result.current.error).toBeNull();
  });

  it('sets error on failure', async () => {
    mockListNamespaces.mockRejectedValue(new Error('Forbidden'));

    const { result } = renderHook(() => useNamespaces());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Forbidden');
    expect(result.current.namespaces).toEqual([]);
  });
});
