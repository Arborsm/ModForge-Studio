const fs = require('node:fs')
const path = require('node:path')

const desktopRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(desktopRoot, '../..')
const tauriRoot = path.join(desktopRoot, 'src-tauri')
const tauriBundleRoot = path.join(tauriRoot, 'target/release/bundle')
const electronDistRoot = path.join(desktopRoot, 'dist')
const releaseRoot = path.join(repoRoot, 'dist/release')
const uploadRoot = path.join(repoRoot, 'dist/release-artifacts')
const platformNames = {
  darwin: 'macos',
  linux: 'linux',
  win32: 'windows',
}
const architectureNames = {
  arm64: 'arm64',
  x64: 'x64',
}
const artifactExtensions = new Set(['.appimage', '.deb', '.dmg', '.exe', '.msi', '.rpm'])
const artifactNames = new Set(['nsis.zip'])
const currentPlatform = platformNames[process.platform] ?? process.platform
const currentArch = architectureNames[process.arch] ?? process.arch
const targetRoot = path.join(releaseRoot, `${currentPlatform}-${currentArch}`)
const artifactRootsByPlatform = {
  linux: [{ root: electronDistRoot, relativeRoot: electronDistRoot }],
  macos: [{ root: path.join(tauriBundleRoot, 'dmg'), relativeRoot: tauriBundleRoot }],
  windows: [
    { root: path.join(tauriBundleRoot, 'msi'), relativeRoot: tauriBundleRoot },
    { root: path.join(tauriBundleRoot, 'nsis'), relativeRoot: tauriBundleRoot },
  ],
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

function collectArtifacts(rootConfig) {
  return walkFiles(rootConfig.root)
    .filter(isReleaseArtifact)
    .map((filePath) => ({
      filePath,
      relativeRoot: rootConfig.relativeRoot,
    }))
}

function copyArtifact(artifact) {
  const relativePath = path.relative(artifact.relativeRoot, artifact.filePath)
  const targetPath = path.join(targetRoot, relativePath)

  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.copyFileSync(artifact.filePath, targetPath)

  return targetPath
}

function artifactKind(artifact) {
  const extension = path.extname(artifact.filePath).toLowerCase().replace(/^\./u, '')
  if (currentPlatform === 'linux') {
    return extension || 'bundle'
  }

  const segments = path.relative(artifact.relativeRoot, artifact.filePath).split(path.sep)
  return segments[0] || extension || 'bundle'
}

function sanitizeFileName(fileName) {
  return fileName.replace(/[^a-zA-Z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '')
}

function copyUploadArtifact(artifact) {
  const kind = artifactKind(artifact)
  const fileName = sanitizeFileName(path.basename(artifact.filePath))
  const targetPath = path.join(uploadRoot, `${currentPlatform}-${currentArch}-${kind}-${fileName}`)

  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.copyFileSync(artifact.filePath, targetPath)

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
  const artifactRoots = artifactRootsByPlatform[currentPlatform] ?? [{ root: tauriBundleRoot, relativeRoot: tauriBundleRoot }]
  const artifacts = artifactRoots.flatMap(collectArtifacts)

  if (artifacts.length === 0) {
    const searchedRoots = artifactRoots.map((artifactRoot) => path.relative(repoRoot, artifactRoot.root)).join(', ')
    throw new Error(`No release artifacts found under ${searchedRoots}`)
  }

  fs.rmSync(targetRoot, { recursive: true, force: true })
  fs.rmSync(uploadRoot, { recursive: true, force: true })

  const copiedArtifacts = artifacts.map((artifact) => {
    const targetPath = copyArtifact(artifact)
    const uploadPath = copyUploadArtifact(artifact)
    const size = fs.statSync(targetPath).size
    return {
      size,
      targetPath,
      uploadPath,
    }
  })

  for (const artifact of copiedArtifacts) {
    console.log(`${formatBytes(artifact.size)} ${path.relative(repoRoot, artifact.targetPath)}`)
    console.log(`upload ${path.relative(repoRoot, artifact.uploadPath)}`)
  }
}

main()
