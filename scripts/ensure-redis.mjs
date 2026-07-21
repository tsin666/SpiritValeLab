import { spawn } from 'node:child_process'

const wsl = 'C:\\Windows\\System32\\wsl.exe'
const distro = process.env.SPIRITVALE_WSL_DISTRO || 'Ubuntu'
const command = [
  'redis-cli ping >/dev/null 2>&1 || redis-server --daemonize yes',
  'redis-cli ping',
  'while redis-cli ping >/dev/null 2>&1; do sleep 15; done'
].join('; ')

let child
let stopping = false

function launch() {
  child = spawn(wsl, ['-d', distro, '--', 'sh', '-lc', command], {
    stdio: 'inherit',
    windowsHide: true
  })
  child.once('exit', (code) => {
    if (stopping) return
    console.error(`SpiritVale Redis bridge exited (${code ?? 'unknown'}); restarting`)
    setTimeout(launch, 1_000)
  })
  child.once('error', (error) => {
    console.error(`SpiritVale Redis bridge failed: ${error.message}`)
  })
}

function stop() {
  stopping = true
  child?.kill()
  setTimeout(() => process.exit(0), 250).unref()
}

process.once('SIGINT', stop)
process.once('SIGTERM', stop)
launch()
