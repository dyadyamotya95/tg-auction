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
    width: 50px;
    height: 30px;
    border-radius: 15px;
    padding: 2px;
    border: none;
    background: rgba(0, 0, 0, 0.15);
    display: flex;
    align-items: center;
    cursor: pointer;
    transition: background 200ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .toggle.on {
    background: #34c759;
  }

  .toggle:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .knob {
    width: 26px;
    height: 26px;
    border-radius: 13px;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
    transition: transform 200ms ease;
  }

  .toggle.on .knob {
    transform: translateX(20px);
  }
</style>
