// Gera assets/icon.png (1024x1024) e assets/icon.ico a partir do favicon do
// site (app/favicon.svg, vetorial — renderiza nítido em qualquer tamanho).
// Para usar outra arte, coloque um `assets/icon.source.png` quadrado
// (>=1024px): ele tem prioridade sobre o favicon.

import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(dir, '..')
const assets = path.join(root, 'assets')
const custom = path.join(assets, 'icon.source.png')
const favicon = path.join(root, '..', 'app', 'favicon.svg')
const outPng = path.join(assets, 'icon.png')
const outIco = path.join(assets, 'icon.ico')

const SIZE = 1024

await mkdir(assets, { recursive: true })

const hasCustom = await access(custom).then(() => true).catch(() => false)

// SVG 32x32 → density alta pra rasterizar já em 1024 sem serrilhado.
const square = await (hasCustom
  ? sharp(await readFile(custom)).resize(SIZE, SIZE, { fit: 'cover' })
  : sharp(await readFile(favicon), { density: 72 * (SIZE / 32) }).resize(SIZE, SIZE)
)
  .png()
  .toBuffer()

await writeFile(outPng, square)

const sizes = [16, 24, 32, 48, 64, 128, 256]
const frames = await Promise.all(
  sizes.map((s) => sharp(square).resize(s, s).png().toBuffer()),
)
await writeFile(outIco, await pngToIco(frames))

console.log(`ícone ${hasCustom ? '(custom)' : '(favicon.svg)'} gerado:`)
console.log(' ', outPng)
console.log(' ', outIco)
