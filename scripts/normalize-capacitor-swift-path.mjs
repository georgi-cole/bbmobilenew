import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const packageFile = resolve('ios/App/CapApp-SPM/Package.swift')
const current = readFileSync(packageFile, 'utf8')
const normalized = current.replaceAll(
  '..\\..\\..\\node_modules\\@capgo\\native-purchases',
  '../../../node_modules/@capgo/native-purchases'
)

if (normalized !== current) {
  writeFileSync(packageFile, normalized)
  console.log('Normalized the local Swift package path for cross-platform builds.')
}
