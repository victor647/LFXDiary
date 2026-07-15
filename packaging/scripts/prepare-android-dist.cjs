const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..', '..')
const distDir = path.join(projectRoot, 'dist')
const androidWebDir = path.join(projectRoot, 'android-web')

if (!fs.existsSync(distDir))
  throw new Error('dist was not found. Run npm run build before preparing the Android package.')

copyFile('runtime-config.js')

console.log('Android runtime config copied into dist.')

function copyFile(fileName) {
  fs.copyFileSync(path.join(androidWebDir, fileName), path.join(distDir, fileName))
}
