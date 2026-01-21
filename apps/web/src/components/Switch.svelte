<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { triggerHaptic } from '../lib/haptic'

  export let checked = false
  export let disabled = false

  const dispatch = createEventDispatcher<{ change: { checked: boolean } }>()

  function toggle(): void {
    if (disabled) return
    triggerHaptic('light')
    dispatch('change', { checked: !checked })
  }
</script>

<button
  class="toggle"
  type="button"
  role="switch"
  aria-checked={checked}
  aria-label={checked ? 'Включено' : 'Выключено'}
  {disabled}
  class:on={checked}
  on:click={toggle}
>
  <span class="knob"></span>
</button>

<style>
  .toggle {
    width: 51px;
    height: 31px;
    border-radius: 16px;
    padding: 2px;
    border: none;
    background: var(--ios-fill);
    display: flex;
    align-items: center;
    cursor: pointer;
    transition: background 0.25s ease;
    -webkit-tap-highlight-color: transparent;
  }

  .toggle.on {
    background: var(--ios-green);
  }

  .toggle:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .knob {
    width: 27px;
    height: 27px;
    border-radius: 14px;
    background: #fff;
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.15), 0 1px 1px rgba(0, 0, 0, 0.06);
    transition: transform 0.25s ease;
  }

  .toggle.on .knob {
    transform: translateX(20px);
  }
</style>
