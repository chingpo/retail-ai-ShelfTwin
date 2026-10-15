import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve, sep, extname } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp4': 'video/mp4', '.glb': 'model/gltf-binary', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' }
export async function serveStatic(request: IncomingMessage, response: ServerResponse, root: string) {
  if (!['GET', 'HEAD'].includes(request.method ?? '')) { response.writeHead(405); response.end(); return }
  let pathname: string
  try { pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname) } catch { response.writeHead(400); response.end(); return }
  let path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`)
  if (!path.startsWith(resolve(root) + sep)) { response.writeHead(403); response.end(); return }
  let info
  try { info = await stat(path); if (!info.isFile()) throw new Error('Not a file') }
  catch {
    if (extname(pathname)) { response.writeHead(404); response.end(); return }
    path = resolve(root, 'index.html'); info = await stat(path)
  }
  const headers: Record<string, string | number> = { 'Content-Type': types[extname(path)] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': extname(path) === '.html' ? 'no-cache' : 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' }
  let start = 0, end = info.size - 1, status = 200
  if (request.headers.range) {
    const match = request.headers.range.match(/^bytes=(\d*)-(\d*)$/)
    if (!match || (!match[1] && !match[2])) { response.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); response.end(); return }
    start = match[1] ? Number(match[1]) : Math.max(0, info.size - Number(match[2]))
    end = match[1] && match[2] ? Math.min(Number(match[2]), info.size - 1) : info.size - 1
    if (start > end || start >= info.size) { response.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); response.end(); return }
    status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`
  }
  headers['Content-Length'] = info.size ? end - start + 1 : 0
  response.writeHead(status, headers)
  if (request.method === 'HEAD' || !info.size) { response.end(); return }
  const stream = createReadStream(path, { start, end })
  stream.on('error', () => response.destroy())
  response.on('close', () => stream.destroy())
  stream.pipe(response)
}
