const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const desktopRoot = path.resolve(__dirname, '..')
const tauriRoot = path.join(desktopRoot, 'src-tauri')
const tauriConfigPath = path.join(tauriRoot, 'tauri.conf.json')
const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf8'))
const productName = tauriConfig.productName
const version = tauriConfig.version
const packageName = 'modforge-studio'
const installDirName = 'modforge-studio'
const binaryName = 'modforge_studio_desktop'
const architectures = {
  x64: {
    deb: 'amd64',
    rpm: 'x86_64',
  },
}
const architecture = architectures[process.arch]
const releaseRoot = path.join(tauriRoot, 'target/release')
const rpmRoot = path.join(releaseRoot, 'bundle/rpm-system')
const sourcePackageName = `${packageName}-${version}`
const sourceRoot = path.join(rpmRoot, 'SOURCES', sourcePackageName)
const specPath = path.join(rpmRoot, 'SPECS', `${packageName}.spec`)

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: desktopRoot,
    stdio: 'inherit',
    ...options,
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status}`)
  }
}

function requireCommand(command) {
  const result = spawnSync('sh', ['-c', `command -v ${command}`], {
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    throw new Error(`Missing required command: ${command}`)
  }
}

function copyDirectory(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.cpSync(from, to, { recursive: true, force: true, dereference: false })
}

function writeSpec() {
  const spec = `Name: ${packageName}
Version: ${version}
Release: 1%{?dist}
Summary: Desktop host for ${productName}
License: Proprietary
BuildArch: ${architecture.rpm}
Source0: ${packageName}-%{version}.tar.gz
AutoReqProv: no
%global debug_package %{nil}
%global __brp_strip /bin/true
%global __brp_strip_comment_note /bin/true
%global __brp_strip_static_archive /bin/true
%global __brp_remove_la_files /bin/true

%description
Desktop host for ${productName}.

%prep
%setup -q

%build

%install
rm -rf %{buildroot}
mkdir -p %{buildroot}
cp -a . %{buildroot}/

%files
/usr/bin/${binaryName}
/usr/share/applications/${packageName}.desktop
/usr/share/icons/hicolor
/usr/share/${installDirName}

%changelog
* Mon Jun 01 2026 ${productName} <dev@modforge.studio> - ${version}-1
- Experimental CEF rpm package.
`

  fs.mkdirSync(path.dirname(specPath), { recursive: true })
  fs.writeFileSync(specPath, spec)
}

function prepareSources() {
  if (!architecture) {
    throw new Error(`Unsupported RPM architecture: ${process.arch}`)
  }

  const debDataRoot = path.join(releaseRoot, `bundle/deb/${productName}_${version}_${architecture.deb}/data`)

  if (!fs.existsSync(debDataRoot)) {
    throw new Error(`Missing deb bundle staging directory: ${debDataRoot}. Run "pnpm --filter @modforge/desktop release:linux:deb" first.`)
  }

  fs.rmSync(rpmRoot, { recursive: true, force: true })
  for (const dir of ['BUILD', 'BUILDROOT', 'RPMS', 'SOURCES', 'SPECS', 'SRPMS']) {
    fs.mkdirSync(path.join(rpmRoot, dir), { recursive: true })
  }

  fs.mkdirSync(path.join(sourceRoot, 'usr/bin'), { recursive: true })
  fs.mkdirSync(path.join(sourceRoot, 'usr/share/applications'), { recursive: true })

  copyDirectory(path.join(debDataRoot, 'usr/share', productName), path.join(sourceRoot, 'usr/share', installDirName))
  copyDirectory(path.join(debDataRoot, 'usr/share/icons/hicolor'), path.join(sourceRoot, 'usr/share/icons/hicolor'))

  fs.symlinkSync(`../share/${installDirName}/${binaryName}`, path.join(sourceRoot, 'usr/bin', binaryName))

  const desktopFile = fs.readFileSync(path.join(debDataRoot, 'usr/share/applications', `${productName}.desktop`), 'utf8')
  fs.writeFileSync(path.join(sourceRoot, 'usr/share/applications', `${packageName}.desktop`), desktopFile)

  run('tar', ['-C', path.join(rpmRoot, 'SOURCES'), '-czf', path.join(rpmRoot, 'SOURCES', `${sourcePackageName}.tar.gz`), sourcePackageName])
}

function main() {
  if (process.platform !== 'linux') {
    throw new Error('RPM bundling is only supported on Linux.')
  }

  requireCommand('rpmbuild')
  requireCommand('tar')
  prepareSources()
  writeSpec()

  run('rpmbuild', [
    '--define',
    `_topdir ${rpmRoot}`,
    '--define',
    `_dbpath ${path.join(rpmRoot, 'rpmdb')}`,
    '--define',
    '_binary_payload w3.zstdio',
    '-bb',
    specPath,
  ])
}

main()
