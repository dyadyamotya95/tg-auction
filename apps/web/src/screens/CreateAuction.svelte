<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte'
  import { fly } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import { IconGavel, IconRefresh, IconChevronLeft } from '@tabler/icons-svelte'
  import { apiCreateAuction } from '../lib/api'
  import { getInitData } from '../lib/init-data'
  import { triggerHaptic } from '../lib/haptic'
  import {
    generateRandomAuctionName,
    createRandomAuctionPhotoId,
    parseAuctionPhoto,
  } from '../lib/auction-avatar'

  const dispatch = createEventDispatcher<{ back: void; created: string }>()

  let auctionName = ''
  let auctionPhoto = ''

  let roundsCount = 3
  let itemsPerRound = 3
  let firstRoundMinutes = 60
  let otherRoundsMinutes = 10

  let minBid = '1'
  let bidStep = '1'
  
  $: totalItems = roundsCount * itemsPerRound
  let startNow = true
  let startAt = ''

  let antiSniping = {
    threshold_seconds: 30,
    extension_seconds: 30,
    // 0 = без лимита (бесконечно)
    max_extensions: 0,
  }

  let submitting = false
  let error = ''
  let isRandomizing = false

  onMount(randomize)

  function randomize() {
    triggerHaptic('light')
    isRandomizing = true
    auctionName = generateRandomAuctionName()
    auctionPhoto = createRandomAuctionPhotoId()
    setTimeout(() => { isRandomizing = false }, 300)
  }

  function handleBack() {
    triggerHaptic('light')
    dispatch('back')
  }

  $: gradientStyle = parseAuctionPhoto(auctionPhoto).gradientCss

  function increment(field: string) {
    triggerHaptic('light')
    if (field === 'rounds') roundsCount = Math.min(100, roundsCount + 1)
    else if (field === 'itemsPerRound') itemsPerRound = Math.min(1000, itemsPerRound + 1)
    else if (field === 'firstRound') {
      const step = firstRoundMinutes < 5 ? 1 : 5
      firstRoundMinutes = Math.min(180, firstRoundMinutes + step)
    } else if (field === 'otherRounds') {
      const step = otherRoundsMinutes < 5 ? 1 : 5
      otherRoundsMinutes = Math.min(60, otherRoundsMinutes + step)
    }
  }

  function decrement(field: string) {
    triggerHaptic('light')
    if (field === 'rounds') roundsCount = Math.max(1, roundsCount - 1)
    else if (field === 'itemsPerRound') itemsPerRound = Math.max(1, itemsPerRound - 1)
    else if (field === 'firstRound') {
      const step = firstRoundMinutes <= 5 ? 1 : 5
      firstRoundMinutes = Math.max(1, firstRoundMinutes - step)
    } else if (field === 'otherRounds') {
      const step = otherRoundsMinutes <= 5 ? 1 : 5
      otherRoundsMinutes = Math.max(1, otherRoundsMinutes - step)
    }
  }

  function setStartOption(now: boolean) {
    triggerHaptic('light')
    startNow = now
  }

  async function submit() {
    if (!auctionName.trim()) {
      error = 'Введите название'
      triggerHaptic('rigid')
      return
    }

    error = ''
    submitting = true
    triggerHaptic('medium')

    try {
      const initData = getInitData()
      let startAtIso: string | undefined
      if (!startNow) {
        if (!startAt) {
          error = 'Выберите дату запуска'
          triggerHaptic('rigid')
          return
        }

        const d = new Date(startAt)
        if (Number.isNaN(d.getTime())) {
          error = 'Некорректная дата запуска'
          triggerHaptic('rigid')
          return
        }

        // `datetime-local` has no timezone → interpret as local time, send ISO with TZ.
        startAtIso = d.toISOString()
      }

      const auction = await apiCreateAuction(initData, {
        auction_name: auctionName.trim(),
        auction_photo: auctionPhoto,
        rounds_count: roundsCount,
        items_per_round: itemsPerRound,
        first_round_minutes: firstRoundMinutes,
        other_rounds_minutes: otherRoundsMinutes,
        min_bid: minBid,
        bid_step: bidStep,
        anti_sniping: { enabled: true, ...antiSniping },
        start_at: startNow ? new Date().toISOString() : startAtIso,
      })
      dispatch('created', auction.id)
    } catch (e) {
      error = e instanceof Error ? e.message : 'Ошибка'
      triggerHaptic('rigid')
    } finally {
      submitting = false
    }
  }
</script>

<div class="create">
  <header>
    <button class="back-btn" on:click={handleBack}>
      <IconChevronLeft size={24} stroke={2} />
    </button>
    <h1>Новый аукцион</h1>
    <div class="spacer"></div>
  </header>

  <div class="form">
    <section class="identity" in:fly={{ y: 20, duration: 250, delay: 50 }}>
      <button class="randomize-btn" class:spinning={isRandomizing} on:click={randomize}>
        <IconRefresh size={18} stroke={2} />
      </button>
      
      <div class="avatar" class:transitioning={isRandomizing} style="background: {gradientStyle}">
        <IconGavel size={40} stroke={1.5} color="white" />
      </div>
      
      <span class="name" class:transitioning={isRandomizing}>{auctionName}</span>
    </section>

    <section class="card" in:fly={{ y: 20, duration: 250, delay: 100 }}>
      <div class="card-title">Раунды</div>
      
      <div class="row">
        <span>Количество раундов</span>
        <div class="stepper">
          <button on:click={() => decrement('rounds')}>−</button>
          <input 
            type="text" 
            inputmode="numeric" 
            bind:value={roundsCount} 
            on:blur={() => roundsCount = Math.max(1, Math.min(100, roundsCount || 1))}
          />
          <button on:click={() => increment('rounds')}>+</button>
        </div>
      </div>

      <div class="row">
        <span>Подарков на раунд</span>
        <div class="stepper">
          <button on:click={() => decrement('itemsPerRound')}>−</button>
          <input 
            type="text" 
            inputmode="numeric" 
            bind:value={itemsPerRound}
            on:blur={() => itemsPerRound = Math.max(1, Math.min(1000, itemsPerRound || 1))}
          />
          <button on:click={() => increment('itemsPerRound')}>+</button>
        </div>
      </div>

      <div class="row total">
        <span>Всего подарков</span>
        <span class="total-value">{totalItems}</span>
      </div>

      <div class="divider"></div>

      <div class="row">
        <span>Первый раунд</span>
        <div class="stepper">
          <button on:click={() => decrement('firstRound')}>−</button>
          <span>{firstRoundMinutes} мин</span>
          <button on:click={() => increment('firstRound')}>+</button>
        </div>
      </div>

      {#if roundsCount > 1}
        <div class="row">
          <span>Остальные раунды</span>
          <div class="stepper">
            <button on:click={() => decrement('otherRounds')}>−</button>
            <span>{otherRoundsMinutes} мин</span>
            <button on:click={() => increment('otherRounds')}>+</button>
          </div>
        </div>
      {/if}
    </section>

    <section class="card" in:fly={{ y: 20, duration: 250, delay: 150 }}>
      <div class="card-title">Ставки</div>
      
      <div class="row">
        <span>Минимальная</span>
        <div class="input-wrap">
          <input type="text" inputmode="numeric" bind:value={minBid} />
          <span class="unit">⭐</span>
        </div>
      </div>

      <div class="row">
        <span>Шаг</span>
        <div class="input-wrap">
          <input type="text" inputmode="numeric" bind:value={bidStep} />
          <span class="unit">⭐</span>
        </div>
      </div>
    </section>

    <section class="card" in:fly={{ y: 20, duration: 250, delay: 200 }}>
      <div class="card-title">Анти-снайпинг</div>
      
      <div class="row">
        <span>Порог</span>
        <div class="input-wrap">
          <input type="text" inputmode="numeric" bind:value={antiSniping.threshold_seconds} />
          <span class="unit">сек</span>
        </div>
      </div>
      <div class="row">
        <span>Продление</span>
        <div class="input-wrap">
          <input type="text" inputmode="numeric" bind:value={antiSniping.extension_seconds} />
          <span class="unit">сек</span>
        </div>
      </div>
      <div class="row">
        <span>Макс. продлений</span>
        <span class="value-muted">без лимита</span>
      </div>
    </section>

    <section class="card" in:fly={{ y: 20, duration: 250, delay: 250 }}>
      <div class="card-title">Запуск</div>
      
      <div class="options">
        <button class="option" class:active={startNow} on:click={() => setStartOption(true)}>
          Сейчас
        </button>
        <button class="option" class:active={!startNow} on:click={() => setStartOption(false)}>
          Позже
        </button>
      </div>
      
      {#if !startNow}
        <input type="datetime-local" bind:value={startAt} class="datetime" />
      {/if}
    </section>

    {#if error}
      <div class="error">{error}</div>
    {/if}

    <button class="submit-btn" on:click={submit} disabled={submitting}>
      {#if submitting}
        <span class="dots"><span></span><span></span><span></span></span>
      {:else}
        Создать
      {/if}
    </button>
  </div>
</div>

<style>
  .create {
    min-height: 100vh;
    background: var(--tg-theme-bg-color, #fff);
    padding-bottom: 40px;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    position: sticky;
    top: 0;
    background: var(--tg-theme-bg-color, #fff);
    z-index: 10;
  }

  header h1 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  .back-btn {
    width: 40px;
    height: 40px;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: var(--tg-theme-text-color, #000);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .back-btn:active {
    background: var(--tg-theme-secondary-bg-color, rgba(0, 0, 0, 0.05));
  }

  .spacer {
    width: 40px;
  }

  .form {
    padding: 0 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .identity {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px;
    background: var(--tg-theme-secondary-bg-color, rgba(0, 0, 0, 0.04));
    border-radius: 12px;
  }

  .avatar {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
    transition: transform 200ms ease, opacity 200ms ease;
  }

  .avatar.transitioning {
    transform: scale(0.9);
    opacity: 0.5;
  }

  .name {
    font-size: 18px;
    font-weight: 600;
    color: var(--tg-theme-text-color, #000);
    transition: opacity 200ms ease;
  }

  .name.transitioning {
    opacity: 0;
  }

  .randomize-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 8px;
    background: var(--tg-theme-bg-color, #fff);
    color: var(--tg-theme-hint-color, #999);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-tap-highlight-color: transparent;
  }

  .randomize-btn:active {
    color: var(--tg-theme-button-color, #007aff);
  }

  .randomize-btn.spinning {
    animation: spin 300ms ease;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .card {
    background: var(--tg-theme-secondary-bg-color, rgba(0, 0, 0, 0.04));
    border-radius: 12px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .card-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--tg-theme-hint-color, #999);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .row > span {
    font-size: 15px;
    color: var(--tg-theme-text-color, #000);
  }

  .row.total {
    padding: 8px 0;
    border-radius: 8px;
  }

  .total-value {
    font-size: 17px;
    font-weight: 700;
    color: var(--tg-theme-button-color, #007aff);
  }

  .divider {
    height: 1px;
    background: var(--tg-theme-section-separator-color, rgba(0, 0, 0, 0.1));
    margin: 4px 0;
  }

  .stepper {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .stepper button {
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 8px;
    background: var(--tg-theme-button-color, #007aff);
    color: #fff;
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-tap-highlight-color: transparent;
  }

  .stepper button:active {
    opacity: 0.8;
  }

  .stepper span {
    min-width: 60px;
    text-align: center;
    font-size: 15px;
    font-weight: 600;
  }

  .stepper input {
    width: 60px;
    text-align: center;
    font-size: 15px;
    font-weight: 600;
    border: none;
    background: var(--tg-theme-bg-color, #fff);
    color: var(--tg-theme-text-color, #000);
    border-radius: 6px;
    padding: 4px 8px;
  }

  .input-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--tg-theme-bg-color, #fff);
    padding: 8px 12px;
    border-radius: 8px;
  }

  .input-wrap input {
    width: 60px;
    border: none;
    background: transparent;
    font-size: 15px;
    font-weight: 600;
    text-align: right;
    color: var(--tg-theme-text-color, #000);
  }

  .unit {
    font-size: 13px;
    color: var(--tg-theme-hint-color, #999);
  }

  .value-muted {
    font-size: 14px;
    font-weight: 500;
    color: var(--tg-theme-hint-color, #999);
  }

  .options {
    display: flex;
    gap: 8px;
  }

  .option {
    flex: 1;
    padding: 10px;
    border: none;
    border-radius: 8px;
    background: var(--tg-theme-bg-color, #fff);
    color: var(--tg-theme-hint-color, #999);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background 150ms ease, color 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .option.active {
    background: var(--tg-theme-button-color, #007aff);
    color: #fff;
  }

  .datetime {
    width: 100%;
    padding: 12px;
    border: none;
    border-radius: 8px;
    background: var(--tg-theme-bg-color, #fff);
    font-size: 15px;
    color: var(--tg-theme-text-color, #000);
  }

  .error {
    padding: 12px;
    background: rgba(255, 59, 48, 0.1);
    color: #ff3b30;
    border-radius: 10px;
    font-size: 14px;
    text-align: center;
  }

  .submit-btn {
    padding: 16px;
    border: none;
    border-radius: 12px;
    background: var(--tg-theme-button-color, #007aff);
    color: #fff;
    font-size: 17px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 150ms ease, opacity 150ms ease;
    -webkit-tap-highlight-color: transparent;
  }

  .submit-btn:active:not(:disabled) {
    transform: scale(0.98);
    opacity: 0.9;
  }

  .submit-btn:disabled {
    opacity: 0.6;
  }

  .dots {
    display: flex;
    gap: 4px;
    justify-content: center;
  }

  .dots span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    animation: bounce 1.4s infinite ease-in-out both;
  }

  .dots span:nth-child(1) { animation-delay: -0.32s; }
  .dots span:nth-child(2) { animation-delay: -0.16s; }

  @keyframes bounce {
    0%, 80%, 100% { transform: scale(0); }
    40% { transform: scale(1); }
  }
</style>
