<script lang="ts">
  import { getAnimalIconComponent, parseAnonPhoto } from '../lib/anon'
  import type { UserPublicDTO } from '../lib/api'

  export let user: UserPublicDTO | null = null
  export let isAnonymous: boolean = false
  export let size: 'sm' | 'md' | 'lg' | 'xl' = 'lg'
  export let transitioning: boolean = false

  const sizeMap = {
    sm: { avatar: 40, icon: 18, mark: 24 },
    md: { avatar: 72, icon: 28, mark: 36 },
    lg: { avatar: 96, icon: 36, mark: 48 },
    xl: { avatar: 120, icon: 44, mark: 56 },
  }

  $: dimensions = sizeMap[size]

  $: avatarStyle = (() => {
    if (isAnonymous) {
      const { gradientCss } = parseAnonPhoto(user?.anon_photo)
      return `background-image: ${gradientCss};`
    }
    if (user?.public_photo) {
      return `background-image: url(${user.public_photo}); background-size: cover; background-position: center;`
    }
    return 'background: var(--tg-theme-secondary-bg-color, rgba(0,0,0,0.08));'
  })()

  $: hasRealPhoto = !isAnonymous && Boolean(user?.public_photo)
  $: animalId = parseAnonPhoto(user?.anon_photo).animalId
</script>

<div
  class="avatar"
  class:transitioning
  style="{avatarStyle} width: {dimensions.avatar}px; height: {dimensions.avatar}px;"
>
  {#if !hasRealPhoto}
    <div
      class="mark"
      style="width: {dimensions.mark}px; height: {dimensions.mark}px;"
    >
      {#if isAnonymous}
        <svelte:component this={getAnimalIconComponent(animalId)} size={dimensions.icon} stroke={2} />
      {:else}
        <svelte:component this={getAnimalIconComponent('user')} size={dimensions.icon} stroke={2} />
      {/if}
    </div>
  {/if}
</div>

<style>
  .avatar {
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 200ms ease, opacity 200ms ease;
  }

  .avatar.transitioning {
    opacity: 0;
    transform: scale(0.95);
  }

  .mark {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: rgba(255, 255, 255, 0.9);
    background: rgba(0, 0, 0, 0.15);
  }
</style>
