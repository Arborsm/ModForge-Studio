const fs = require('node:fs')
const path = require('node:path')

const desktopRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(desktopRoot, '../..')
const tauriRoot = path.join(desktopRoot, 'src-tauri')
const bundleRoot = path.join(tauriRoot, 'target/release/bundle')
const releaseRoot = path.join(repoRoot, 'dist/release')
const platformNames = {
  darwin: 'macos',
  linux: 'linux',
  win32: 'windows',
}
const architectureNames = {
  arm64: 'arm64',
  x64: 'x64',
}
const artifactExtensions = new Set(['.appimage', '.deb', '.dmg', '.msi', '.rpm'])
const artifactNames = new Set(['nsis.zip'])
const currentPlatform = platformNames[process.platform] ?? process.platform
const currentArch = architectureNames[process.arch] ?? process.arch
const targetRoot = path.join(releaseRoot, `${currentPlatform}-${currentArch}`)
const artifactRootsByPlatform = {
  linux: [path.join(bundleRoot, 'deb'), path.join(bundleRoot, 'appimage'), path.join(bundleRoot, 'rpm-system', 'RPMS')],
  macos: [path.join(bundleRoot, 'dmg'), path.join(bundleRoot, 'macos')],
  windows: [path.join(bundleRoot, 'msi'), path.join(bundleRoot, 'nsis')],
}

function walkFiles(root) {
  if (!fs.existsSync(root)) {
    return []
  }

  const entries = fs.readdirSync(root, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name)

    if (entry.isDirectory()) {
      files.push(...walkFiles(entryPath))
      continue
    }

    if (entry.isFile()) {
      files.push(entryPath)
    }
  }

  return files
}

function isReleaseArtifact(filePath) {
  const fileName = path.basename(filePath).toLowerCase()
  return artifactExtensions.has(path.extname(fileName)) || artifactNames.has(fileName)
}

function copyArtifact(filePath) {
  const relativePath = path.relative(bundleRoot, filePath)
  const targetPath = path.join(targetRoot, relativePath)

  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.copyFileSync(filePath, targetPath)

  return targetPath
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function main() {
  const artifactRoots = artifactRootsByPlatform[currentPlatform] ?? [bundleRoot]
  const artifacts = artifactRoots.flatMap(walkFiles).filter(isReleaseArtifact)

  if (artifacts.length === 0) {
    throw new Error(`No release artifacts found under ${bundleRoot}`)
  }

  fs.rmSync(targetRoot, { recursive: true, force: true })

  const copiedArtifacts = artifacts.map((artifact) => {
    const targetPath = copyArtifact(artifact)
    const size = fs.statSync(targetPath).size
    return {
      size,
      targetPath,
    }
  })

  for (const artifact of copiedArtifacts) {
    console.log(`${formatBytes(artifact.size)} ${path.relative(repoRoot, artifact.targetPath)}`)
  }
}

main()
