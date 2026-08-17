import { addDependenciesToPackageJson, readJson } from '@nx/devkit'
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing'

import * as utils from '@abgov/nx-oc'
import { environments } from '@abgov/nx-oc'
import { Schema } from './schema'
import generator from './dotnet-service'

jest.mock('@abgov/nx-oc', () => ({
  ...jest.requireActual('@abgov/nx-oc'),
  getAdspConfiguration: jest.fn(),
  deploymentGenerator: jest.fn(),
}))
const utilsMock = utils as jest.Mocked<typeof utils>
utilsMock.getAdspConfiguration.mockResolvedValue({
  tenant: 'test',
  tenantRealm: 'test',
  accessServiceUrl: environments.test.accessServiceUrl,
  directoryServiceUrl: environments.test.directoryServiceUrl,
})
utilsMock.deploymentGenerator.mockResolvedValue()

describe('Dotnet Service Generator', () => {
  const options: Schema = {
    name: 'test',
    env: 'dev',
  }

  it('can run', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' })
    addDependenciesToPackageJson(
      host,
      {},
      {
        '@nx/dotnet': '^23.0.0',
      },
    )
    await generator(host, options)
    expect(utils.deploymentGenerator).toHaveBeenCalled()
    expect(host.exists('apps/test/test.csproj')).toBeTruthy()
    expect(host.exists('apps/test/Program.cs')).toBeTruthy()
    expect(host.exists('NuGet.Config')).toBeTruthy()
  })

  it('adds @nx/dotnet to nx.json plugins', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' })
    addDependenciesToPackageJson(
      host,
      {},
      {
        '@nx/dotnet': '^23.0.0',
      },
    )
    await generator(host, options)
    const nxJson = readJson(host, 'nx.json')
    expect(nxJson.plugins).toContain('@nx/dotnet')
  })

  it('throws when @nx/dotnet is not installed', async () => {
    const host = createTreeWithEmptyWorkspace({ layout: 'apps-libs' })
    await expect(generator(host, options)).rejects.toThrow('@nx/dotnet')
  })
})
