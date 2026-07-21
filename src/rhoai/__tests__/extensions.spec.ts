import {
  communityPluginsSectionExtension,
  hermesAreaExtension,
  hermesSectionExtension,
  hermesInstancesNavExtension,
  hermesRouteExtension,
  extensions,
} from '../extensions';

describe('extensions', () => {
  it('exports the correct number of extensions', () => {
    expect(extensions).toHaveLength(5);
  });

  it('has the shared community-plugins section first', () => {
    expect(communityPluginsSectionExtension.type).toBe('app.navigation/section');
    expect(communityPluginsSectionExtension.properties.id).toBe('community-plugins');
    expect(communityPluginsSectionExtension.properties.title).toBe('Community plugins');
  });

  it('registers the hermes area', () => {
    expect(hermesAreaExtension.type).toBe('app.area');
    expect(hermesAreaExtension.properties.id).toBe('hermes-agent-deployer');
  });

  it('nests hermes section under community-plugins', () => {
    expect(hermesSectionExtension.type).toBe('app.navigation/section');
    expect(hermesSectionExtension.properties.section).toBe('community-plugins');
    expect(hermesSectionExtension.properties.id).toBe('hermes-agent-deployer');
  });

  it('defines the instances nav item', () => {
    expect(hermesInstancesNavExtension.type).toBe('app.navigation/href');
    expect(hermesInstancesNavExtension.properties.href).toBe('/hermes-agent-deployer');
    expect(hermesInstancesNavExtension.properties.section).toBe('hermes-agent-deployer');
  });

  it('defines the route with lazy component loading', () => {
    expect(hermesRouteExtension.type).toBe('app.route');
    expect(hermesRouteExtension.properties.path).toBe('/hermes-agent-deployer/*');
    expect(typeof hermesRouteExtension.properties.component).toBe('function');
  });

  it('exports extensions as default', async () => {
    const mod = await import('../extensions');
    expect(mod.default).toEqual(extensions);
  });
});
