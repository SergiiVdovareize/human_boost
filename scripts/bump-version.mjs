import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const cwd = process.cwd()
const pkgPath = resolve(cwd, 'package.json')
const manifestPath = resolve(cwd, 'manifest.json')
const changelogPath = resolve(cwd, 'CHANGELOG.md')

function run(cmd, options = {}) {
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : 'pipe',
      ...options,
    }).trim()
  } catch (err) {
    if (options.ignoreError) return ''
    throw err
  }
}

function parseSemver(version) {
  const clean = version.replace(/^v/, '')
  const [major, minor, patch] = clean.split('.').map((n) => Number.parseInt(n, 10))
  return {
    major: Number.isNaN(major) ? 1 : major,
    minor: Number.isNaN(minor) ? 0 : minor,
    patch: Number.isNaN(patch) ? 0 : patch,
  }
}

function getNextVersion(currentVersion, bumpType) {
  const { major, minor, patch } = parseSemver(currentVersion)
  switch (bumpType) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    default:
      return `${major}.${minor}.${patch + 1}`
  }
}

/**
 * Finds the commit where package.json version was last modified,
 * to analyze only the commits made after that.
 */
function findLastVersionCommit() {
  const hash = run('git log -n 1 -G "\\"version\\":" --pretty=format:"%H" package.json', {
    ignoreError: true,
  })
  if (hash) return hash

  const tag = run('git describe --tags --abbrev=0', { ignoreError: true })
  return tag || null
}

function analyzeCommits() {
  const lastRef = findLastVersionCommit()
  const range = lastRef ? `${lastRef}..HEAD` : 'HEAD'
  const logOutput = run(`git log ${range} --pretty=format:"%h%x09%s"`, { ignoreError: true })

  if (!logOutput) {
    return { bumpType: 'patch', features: [], fixes: [], others: [] }
  }

  const lines = logOutput.split('\n').filter(Boolean)
  const features = []
  const fixes = []
  const others = []
  let hasBreaking = false
  let hasFeature = false

  for (const line of lines) {
    const [hash, ...rest] = line.split('\t')
    const message = rest.join('\t').trim()
    if (!message) continue

    if (message.includes('BREAKING CHANGE') || /^[a-z]+(\([^)]+\))?!:/.test(message)) {
      hasBreaking = true
    }

    if (/^feat(\([^)]+\))?:/i.test(message)) {
      hasFeature = true
      features.push({ hash, message: message.replace(/^feat(\([^)]+\))?:\s*/i, '') })
    } else if (/^fix(\([^)]+\))?:/i.test(message)) {
      fixes.push({ hash, message: message.replace(/^fix(\([^)]+\))?:\s*/i, '') })
    } else {
      others.push({ hash, message })
    }
  }

  let bumpType = 'patch'
  if (hasBreaking) {
    bumpType = 'major'
  } else if (hasFeature) {
    bumpType = 'minor'
  }

  return { bumpType, features, fixes, others }
}

function generateChangelogSection(newVersion, features, fixes, others) {
  const today = new Date().toISOString().split('T')[0]
  let content = `## [${newVersion}] - ${today}\n\n`

  if (features.length > 0) {
    content += `### 🚀 Features\n`
    for (const f of features) {
      content += `- ${f.message} (\`${f.hash}\`)\n`
    }
    content += `\n`
  }

  if (fixes.length > 0) {
    content += `### 🐛 Bug Fixes\n`
    for (const f of fixes) {
      content += `- ${f.message} (\`${f.hash}\`)\n`
    }
    content += `\n`
  }

  if (features.length === 0 && fixes.length === 0 && others.length > 0) {
    content += `### 🛠 Other Changes\n`
    for (const o of others.slice(0, 10)) {
      content += `- ${o.message} (\`${o.hash}\`)\n`
    }
    content += `\n`
  }

  return content
}

function main() {
  const args = process.argv.slice(2)
  const isDryRun = args.includes('--dry-run')
  const forceMajor = args.includes('--major')
  const forceMinor = args.includes('--minor')
  const forcePatch = args.includes('--patch')

  // Check git working tree
  const gitStatus = run('git status --porcelain', { ignoreError: true })
  if (gitStatus && !isDryRun) {
    console.error(
      '\x1b[31m✗ Working tree has uncommitted changes. Please commit or stash them first.\x1b[0m'
    )
    process.exit(1)
  }

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  const currentVersion = pkg.version || '1.0.0'

  const { bumpType: autoBump, features, fixes, others } = analyzeCommits()
  const bumpType = forceMajor ? 'major' : forceMinor ? 'minor' : forcePatch ? 'patch' : autoBump
  const newVersion = getNextVersion(currentVersion, bumpType)

  console.log(`\x1b[36mℹ Current version:\x1b[0m ${currentVersion}`)
  console.log(
    `\x1b[35mℹ Recommended bump:\x1b[0m ${bumpType.toUpperCase()} (new version: ${newVersion})`
  )
  console.log(`  - Features: ${features.length}`)
  console.log(`  - Bug Fixes: ${fixes.length}`)
  console.log(`  - Other commits: ${others.length}`)

  const newSection = generateChangelogSection(newVersion, features, fixes, others)

  if (isDryRun) {
    console.log('\n\x1b[33m--- [DRY RUN] Generated Changelog Preview ---\x1b[0m')
    console.log(newSection)
    console.log(
      '\x1b[33m[DRY RUN] Would update package.json, manifest.json & CHANGELOG.md without git tags.\x1b[0m'
    )
    return
  }

  // 1. Update package.json
  pkg.version = newVersion
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
  console.log(`\x1b[32m✓ Updated package.json -> ${newVersion}\x1b[0m`)

  // 2. Update manifest.json
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    manifest.version = newVersion
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    console.log(`\x1b[32m✓ Updated manifest.json -> ${newVersion}\x1b[0m`)
  }

  const distManifestPath = resolve(cwd, 'dist', 'manifest.json')
  if (existsSync(distManifestPath)) {
    const distManifest = JSON.parse(readFileSync(distManifestPath, 'utf-8'))
    distManifest.version = newVersion
    writeFileSync(distManifestPath, `${JSON.stringify(distManifest, null, 2)}\n`)
    console.log(`\x1b[32m✓ Updated dist/manifest.json -> ${newVersion}\x1b[0m`)
  }

  // 3. Update or create CHANGELOG.md
  let currentChangelog = ''
  if (existsSync(changelogPath)) {
    currentChangelog = readFileSync(changelogPath, 'utf-8')
  } else {
    currentChangelog =
      '# Changelog\n\nAll notable changes to Human Boost will be documented in this file.\n\n'
  }

  const updatedChangelog = currentChangelog.startsWith('# Changelog\n\n')
    ? currentChangelog.replace('# Changelog\n\n', `# Changelog\n\n${newSection}`)
    : newSection + currentChangelog

  writeFileSync(changelogPath, updatedChangelog)
  console.log(`\x1b[32m✓ Updated CHANGELOG.md\x1b[0m`)

  // 4. Git stage & commit (NO tags). dist/ is gitignored — do not stage it.
  const filesToStage = ['package.json', 'manifest.json', 'CHANGELOG.md']
  run(`git add ${filesToStage.join(' ')}`)
  run(`git commit -m "chore: bump version to ${newVersion}"`)
  console.log(`\x1b[32m✓ Created commit: chore: bump version to ${newVersion} (no git tags)\x1b[0m`)
  console.log(`\n\x1b[1;32m✓ Version ${newVersion} recorded with CHANGELOG.md successfully!\x1b[0m`)
}

main()
