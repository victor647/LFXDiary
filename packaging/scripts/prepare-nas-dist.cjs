const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..', '..')
const distDir = path.join(projectRoot, 'dist')
const nasWebDir = path.join(projectRoot, 'nas-web')

if (!fs.existsSync(distDir))
  throw new Error('dist was not found. Run npm run build before preparing the NAS package.')

copyFile('.htaccess')
copyFile('nas-proxy.php')
copyFile('nas-proxy.config.php')
copyFile('runtime-config.js')

console.log('NAS Web Station files copied into dist.')

function copyFile(fileName) {
  fs.copyFileSync(path.join(nasWebDir, fileName), path.join(distDir, fileName))
}
