const path = require('path')
const fs = require('fs/promises')

const isNotFoundError = (error) =>
  Boolean(error && typeof error === 'object' && error.code === 'ENOENT')

const copyDirectoryIfPresent = async (source, destination) => {
  try {
    await fs.cp(source, destination, { recursive: true })
    return true
  } catch (error) {
    if (isNotFoundError(error)) return false
    throw error
  }
}

const copyFileIfPresent = async (source, destination) => {
  try {
    const info = await fs.stat(source)
    if (!info.isFile()) return false
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.copyFile(source, destination)
    return true
  } catch (error) {
    if (isNotFoundError(error)) return false
    throw error
  }
}

const copyBundledExtensions = async (outputPath) => {
  const src = path.join(__dirname, '../../extensions')
  const dst = path.join(outputPath, 'extensions')
  await fs.mkdir(dst, { recursive: true })
  const directories = (await fs.readdir(src, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
  const skippedExtensionPattern = /^(?!kc3kai).*$/
  for (const dir of directories) {
    if (skippedExtensionPattern.test(dir)) {
      await copyDirectoryIfPresent(path.join(src, dir), path.join(dst, dir))
    }
  }
}

const copyMinimumCache = async (config, options) => {
  const minCacheSrc = path.join(__dirname, '../../packages/kccacheproxy/minimum-cache.zip')
  const resourcesDir =
    options.platform === 'darwin'
      ? config.packagerConfig.name + '.app/Contents/Resources'
      : 'resources'
  const minCacheDest = path.join(options.outputPaths[0], resourcesDir, 'minimum-cache.zip')

  const copied = await copyFileIfPresent(minCacheSrc, minCacheDest)
  if (copied) {
    console.log('Copied minimum-cache.zip to ', minCacheDest)
    return
  }

  console.warn(
    [
      'minimum-cache.zip not found; skipping bundled KCCacheProxy cache dump.',
      `Expected: ${minCacheSrc}`,
      'Generate it with packages/kccacheproxy/build.sh or packages/kccacheproxy/build.bat before packaging a release that should include the built-in cache dump.',
    ].join(' '),
  )
}

module.exports = {
  packagerConfig: {
    name: 'kancolle-assistant',
    appBundleId: 'io.github.kevinsuu.kancolle-assistant',
    asar: true,
    extraResource: ['browser/ui'],
    icon: 'icon',
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32', 'linux'],
    },
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: () => ({
        name: 'kancolle-assistant',
        setupIcon: 'icon.ico',
        authors: 'kevinsuu',
      }),
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-webpack',
      config: {
        mainConfig: './webpack.main.config.js',
        renderer: {
          config: './webpack.renderer.config.js',
          entryPoints: [
            {
              name: 'browser',
              preload: {
                js: './preload.ts',
              },
            },
          ],
        },
        devServer: {
          client: {
            overlay: false,
          },
        },
      },
    },
  ].filter(Boolean),
  hooks: {
    postPackage: async (config, options) => {
      try {
        await copyBundledExtensions(options.outputPaths[0])
      } catch (error) {
        console.log('Error copying extensions', error)
      }
      try {
        await copyMinimumCache(config, options)
      } catch (error) {
        console.log('Error copying minimum-cache.zip', error)
      }
    },
  },
}
