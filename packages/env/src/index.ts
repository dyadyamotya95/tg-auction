import { config as dotenvConfig } from 'dotenv'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export type EnvLike = Record<string, string | undefined>

let loaded = false

export function loadRootDotenv(): void {
  if (loaded) {
    return
  }

  loaded = true

  const startDir = process.env.INIT_CWD ?? process.cwd()

  let dir = startDir
  for (let i = 0; i < 10; i += 1) {
    const candidate = resolve(dir, '.env')
    if (existsSync(candidate)) {
      dotenvConfig({ path: candidate })
      return
    }
    const parent = dirname(dir)
    if (parent === dir) {
      break
    }
    dir = parent
  }

  dotenvConfig()
}

export function readEnv(env: EnvLike, name: string): string | undefined {
  const v = env[name]
  if (typeof v !== 'string') {
    return undefined
  }
  const trimmed = v.trim()
  if (!trimmed) {
    return undefined
  }
  return trimmed
}

export function readEnvRequired(env: EnvLike, name: string): string {
  const v = readEnv(env, name)
  if (!v) {
    throw new Error(`${name} is required`)
  }
  return v
}

export function readEnvNumber(env: EnvLike, name: string, fallback: number): number {
  const raw = readEnv(env, name)
  if (!raw) {
    return fallback
  }
  const n = Number(raw)
  if (!Number.isFinite(n)) {
    return fallback
  }
  return n
}
