import { createHash } from 'node:crypto'
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '..')
const publicDirectory = resolve(repositoryRoot, 'apps', 'web', 'public')
const outputDirectory = resolve(publicDirectory, 'ocr')

function assertSafeOutputDirectory() {
  const relativeOutput = relative(publicDirectory, outputDirectory)
  const expected = 'ocr'

  if (relativeOutput !== expected || relativeOutput.startsWith(`..${sep}`) || resolve(outputDirectory) !== join(publicDirectory, expected)) {
    throw new Error(`Refusing to clean unexpected OCR output directory: ${outputDirectory}`)
  }
}

function packageDirectory(packageName) {
  return dirname(require.resolve(`${packageName}/package.json`))
}

async function readPackageVersion(packageName) {
  const packageJson = JSON.parse(await readFile(join(packageDirectory(packageName), 'package.json'), 'utf8'))
  return String(packageJson.version || '')
}

async function sha256(filePath) {
  const contents = await readFile(filePath)
  return createHash('sha256').update(contents).digest('hex')
}

async function copyAsset(source, destinationRelativePath, files) {
  const destination = join(outputDirectory, ...destinationRelativePath.split('/'))
  await mkdir(dirname(destination), { recursive: true })
  await copyFile(source, destination)

  const metadata = await stat(destination)
  files.push({
    path: destinationRelativePath,
    bytes: metadata.size,
    sha256: await sha256(destination)
  })
}

async function main() {
  assertSafeOutputDirectory()

  const tesseractDirectory = packageDirectory('tesseract.js')
  const coreDirectory = packageDirectory('tesseract.js-core')
  const englishDirectory = packageDirectory('@tesseract.js-data/eng')
  const simplifiedChineseDirectory = packageDirectory('@tesseract.js-data/chi_sim')

  const versions = {
    tesseract: await readPackageVersion('tesseract.js'),
    core: await readPackageVersion('tesseract.js-core'),
    english: await readPackageVersion('@tesseract.js-data/eng'),
    simplifiedChinese: await readPackageVersion('@tesseract.js-data/chi_sim')
  }

  if (versions.tesseract.split('.')[0] !== versions.core.split('.')[0]) {
    throw new Error(`Tesseract.js ${versions.tesseract} and tesseract.js-core ${versions.core} must have the same major version`)
  }

  const coreFiles = (await readdir(coreDirectory))
    .filter(fileName => fileName.endsWith('.wasm.js'))
    .sort()

  const requiredCoreFiles = [
    'tesseract-core.wasm.js',
    'tesseract-core-lstm.wasm.js',
    'tesseract-core-simd.wasm.js',
    'tesseract-core-simd-lstm.wasm.js'
  ]
  const missingCoreFiles = requiredCoreFiles.filter(fileName => !coreFiles.includes(fileName))
  if (missingCoreFiles.length) {
    throw new Error(`Missing required Tesseract core assets: ${missingCoreFiles.join(', ')}`)
  }

  // This is the sole generated directory this script is allowed to replace.
  await rm(outputDirectory, { recursive: true, force: true })
  await mkdir(outputDirectory, { recursive: true })

  const files = []
  await copyAsset(join(tesseractDirectory, 'dist', 'worker.min.js'), 'worker.min.js', files)

  for (const fileName of coreFiles) {
    await copyAsset(join(coreDirectory, fileName), `core/${fileName}`, files)
  }

  await copyAsset(
    join(englishDirectory, '4.0.0_best_int', 'eng.traineddata.gz'),
    'lang/eng.traineddata.gz',
    files
  )
  await copyAsset(
    join(simplifiedChineseDirectory, '4.0.0_best_int', 'chi_sim.traineddata.gz'),
    'lang/chi_sim.traineddata.gz',
    files
  )

  files.sort((left, right) => left.path.localeCompare(right.path))
  const manifest = {
    schemaVersion: 1,
    generatedBy: 'scripts/prepare-ocr-assets.mjs',
    sources: versions,
    totalBytes: files.reduce((total, file) => total + file.bytes, 0),
    files
  }

  await writeFile(join(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  console.log(`Prepared ${files.length} local OCR assets (${manifest.totalBytes} bytes) in apps/web/public/ocr`)
}

await main()
