import { hapticFeedback } from '@tma.js/sdk-svelte'

const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true'

export type ImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'

export function triggerHaptic(type: ImpactStyle = 'light') {
  if (DEV_MODE) {
    return
  }

  try {
    hapticFeedback.impactOccurred(type)
  } catch {
    // ignore
  }
}

export function triggerSelectionChanged() {
  if (DEV_MODE) {
    return
  }

  try {
    hapticFeedback.selectionChanged()
  } catch {
    // ignore
  }
}

export function triggerNotification(type: 'error' | 'success' | 'warning' = 'success') {
  if (DEV_MODE) {
    return
  }

  try {
    hapticFeedback.notificationOccurred(type)
  } catch {
    // ignore
  }
}

export function triggerSuccessPattern() {
  if (DEV_MODE) {
    return
  }

  try {
    hapticFeedback.impactOccurred('light')
    setTimeout(() => hapticFeedback.impactOccurred('medium'), 80)
    setTimeout(() => hapticFeedback.notificationOccurred('success'), 160)
  } catch {
    // ignore
  }
}

export function triggerErrorPattern() {
  if (DEV_MODE) {
    return
  }

  try {
    hapticFeedback.impactOccurred('rigid')
    setTimeout(() => hapticFeedback.impactOccurred('rigid'), 100)
    setTimeout(() => hapticFeedback.notificationOccurred('error'), 200)
  } catch {
    // ignore
  }
}

export function triggerCelebrationPattern() {
  if (DEV_MODE) {
    return
  }

  try {
    hapticFeedback.impactOccurred('light')
    setTimeout(() => hapticFeedback.impactOccurred('medium'), 50)
    setTimeout(() => hapticFeedback.impactOccurred('heavy'), 100)
    setTimeout(() => hapticFeedback.notificationOccurred('success'), 180)
  } catch {
    // ignore
  }
}

export function triggerCountPattern(count: number) {
  if (DEV_MODE) {
    return
  }

  const maxTicks = Math.min(count, 10)
  const interval = 50
  
  for (let i = 0; i < maxTicks; i++) {
    setTimeout(() => {
      try {
        hapticFeedback.impactOccurred('light')
      } catch {
        // ignore
      }
    }, i * interval)
  }
}

export function triggerSliderTick() {
  if (DEV_MODE) {
    return
  }

  try {
    hapticFeedback.impactOccurred('soft')
  } catch {
    // ignore
  }
}

export function triggerConfirm() {
  if (DEV_MODE) {
    return
  }

  try {
    hapticFeedback.impactOccurred('medium')
    setTimeout(() => hapticFeedback.impactOccurred('heavy'), 100)
  } catch {
    // ignore
  }
}
