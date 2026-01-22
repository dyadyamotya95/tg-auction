import { initData } from '@tma.js/sdk-svelte'

const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true'
const DEV_INIT_DATA = 'dev'

export function getInitData(): string {
  if (DEV_MODE) {
    return DEV_INIT_DATA
  }
  try {
    const raw = initData.raw() ?? ''
    if (!raw) {
      console.warn('[initData] raw() returned empty')
    }
    return raw
  } catch (e) {
    console.warn('[initData] error:', e)
    return ''
  }
}
