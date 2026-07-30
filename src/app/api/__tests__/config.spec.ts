describe('getInstanceDefaults', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('fetches and returns config from /config.json', async () => {
    const mockConfig = {
      hermesImage: 'quay.io/test:v1',
      oauthProxy: { enabled: false, image: 'proxy:v1' },
      pvc: { size: '5Gi' },
      resources: {
        requests: { cpu: '100m', memory: '256Mi' },
        limits: { cpu: '2', memory: '2Gi' },
      },
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockConfig),
    });

    const { getInstanceDefaults } = await import('../config');
    const result = await getInstanceDefaults();
    expect(result).toEqual(mockConfig);
    expect(global.fetch).toHaveBeenCalledWith('/config.json');
  });

  it('returns fallback defaults when fetch fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const { getInstanceDefaults } = await import('../config');
    const result = await getInstanceDefaults();
    expect(result.hermesImage).toBe('quay.io/rh-ai-community-plugins/hermes-sandbox:0.2.0');
    expect(result.pvc.size).toBe('1Gi');
  });

  it('returns fallback when response is not ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      statusText: 'Not Found',
    });

    const { getInstanceDefaults } = await import('../config');
    const result = await getInstanceDefaults();
    expect(result.hermesImage).toBe('quay.io/rh-ai-community-plugins/hermes-sandbox:0.2.0');
  });

  it('caches the result on subsequent calls', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        hermesImage: 'cached:v1',
        oauthProxy: { enabled: true, image: 'p' },
        pvc: { size: '1Gi' },
        resources: { requests: { cpu: '1', memory: '1Gi' }, limits: { cpu: '1', memory: '1Gi' } },
      }),
    });

    const { getInstanceDefaults } = await import('../config');
    await getInstanceDefaults();
    await getInstanceDefaults();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
