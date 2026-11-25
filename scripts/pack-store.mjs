import { execSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const cwd = process.cwd()
const distDir = resolve(cwd, 'dist')
const manifestPath = join(distDir, 'manifest.json')

if (!existsSync(manifestPath)) {
  console.error('dist/manifest.json not found. Run npm run build first.')
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
const version = manifest.version || '0.0.0'

// Chrome Web Store rejects packages that include the development "key" field.
if ('key' in manifest) {
  delete manifest.key
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log('Removed "key" from dist/manifest.json for store package')
}

const zipName = `human-boost-${version}.zip`
const zipPath = resolve(cwd, zipName)
if (existsSync(zipPath)) {
  unlinkSync(zipPath)
}

execSync(`zip -r ${JSON.stringify(zipPath)} . -x '*.DS_Store'`, {
  cwd: distDir,
  stdio: 'inherit',
})

const zipped = JSON.parse(
  execSync(`unzip -p ${JSON.stringify(zipPath)} manifest.json`, {
    encoding: 'utf-8',
  })
)

if ('key' in zipped) {
  console.error('ZIP still contains "key" — aborting')
  process.exit(1)
}

console.log(`✓ Store package ready: ${zipName}`)
console.log(`  version: ${zipped.version}`)
console.log(`  has key: false`)
