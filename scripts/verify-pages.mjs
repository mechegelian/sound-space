import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'

// Fail before upload if a source directory or incorrectly based build is supplied.
const output = resolve(process.argv[2] || 'dist')
const base = '/sound-space/'
const html = readFileSync(resolve(output, 'index.html'), 'utf8')
assert.doesNotMatch(html, /src\/main\.jsx/, 'Pages must publish the built dist directory, not the source index.html.')

const urls = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(match => match[1])
assert.ok(urls.some(url => /^\/sound-space\/assets\/[^/]+-[\w-]+\.js$/.test(url)), 'Missing hashed JavaScript entry.')
assert.ok(urls.some(url => /^\/sound-space\/assets\/[^/]+-[\w-]+\.css$/.test(url)), 'Missing hashed stylesheet.')
for (const url of urls) {
  assert.ok(url.startsWith(base), `Incorrect production asset base: ${url}`)
  const file = resolve(output, url.slice(base.length))
  assert.ok(file.startsWith(output + sep), `Asset escapes the build directory: ${url}`)
  assert.ok(statSync(file).isFile(), `Missing production asset: ${url}`)
  console.log(`Verified ${url}`)
}
console.log('Pages artifact verified: built assets only; no src/main.jsx reference.')
