<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte'
  import { fly, scale, fade } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import { IconChevronLeft, IconGavel, IconClock, IconTrophy } from '@tabler/icons-svelte'
  import type { AuctionDTO, RoundDTO, BidDTO, BidLeaderboardItemDTO } from '@tac/shared'
  import {
    apiGetAuction,
    apiGetAuctionRound,
    apiGetLeaderboard,
    apiPlaceBid,
    apiStartAuction,
  } from '../lib/api'
  import { getInitData } from '../lib/init-data'
  import { triggerHaptic, triggerSliderTick, triggerSuccessPattern, triggerErrorPattern } from '../lib/haptic'
  import { AuctionWebSocket } from '../lib/auction-ws'
  import { parseAnonPhoto, getAnimalIconComponent } from '../lib/anon'
  import { parseAuctionPhoto } from '../lib/auction-avatar'
  import { walletStore, walletView } from '../lib/wallet-store'

  export let auctionId: string
  export let userId: number = 0

  const dispatch = createEventDispatcher<{ back: void }>()

  let auction: AuctionDTO | null = null
  let round: RoundDTO | null = null
  let leaderboard: BidLeaderboardItemDTO[] = []
  let myBid: BidDTO | null = null
  let loading = true
  let error = ''
  let bidError = ''

  let bidAmount = ''
  let sliderValue = 0
  let prevSliderValue = 0
  let bidding = false
  let showCustomInput = false
  let customBidValue = ''

  let timeLeft = ''
  let timer: ReturnType<typeof setInterval> | null = null
  let ws: AuctionWebSocket | null = null
  let startLeft = ''
  let lastRoundPollAt = 0
  let lastStartPollAt = 0

  let balanceAnimating = false
  let balancePressed = false
  let displayBalance = 0
  let lastAvailable: number | null = null
  const MAX_BALANCE = 100000
  const DEPOSIT_AMOUNT = 1000

  $: {
    const next = Math.min($walletView.available, MAX_BALANCE)
    if (lastAvailable === null) {
      displayBalance = next
      lastAvailable = next
    } else if (next !== lastAvailable && !balanceAnimating) {
      animateBalance(displayBalance, next)
      lastAvailable = next
    }
  }

  async function load(opts: { silent?: boolean } = {}) {
    if (!opts.silent) loading = true
    error = ''
    try {
      const initData = getInitData()
      auction = await apiGetAuction(initData, auctionId)
      await walletStore.ensure()

      if (auction.status === 'active') {
        round = await apiGetAuctionRound(initData, auctionId)
        const lb = await apiGetLeaderboard(initData, auctionId)
        leaderboard = lb.leaderboard
        myBid = lb.my_bid || null
        connectWs()
        
        const minBid = Math.ceil(parseFloat(auction.min_bid))
        const currentBid = myBid ? Math.floor(parseFloat(myBid.amount)) : 0
        const startBid = currentBid > 0 ? currentBid + Math.ceil(parseFloat(auction.bid_step)) : minBid
        bidAmount = String(startBid)
        sliderValue = 0
      } else {
        round = null
        leaderboard = []
        myBid = null
        ws?.disconnect()
        ws = null
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Ошибка загрузки'
    } finally {
      if (!opts.silent) loading = false
    }
  }

  async function depositBalance() {
    if ($walletView.available >= MAX_BALANCE || balanceAnimating) return
    
    triggerHaptic('medium')
    balancePressed = true
    setTimeout(() => { balancePressed = false }, 150)

    try {
      await walletStore.deposit(DEPOSIT_AMOUNT)
    } catch {}
  }

  function animateBalance(from: number, to: number) {
    balanceAnimating = true
    const duration = 200
    const steps = 10
    const stepTime = duration / steps
    const increment = (to - from) / steps
    let current = from
    let step = 0

    const interval = setInterval(() => {
      step++
      current += increment
      displayBalance = Math.round(current)
      
      if (step >= steps) {
        clearInterval(interval)
        displayBalance = to
        balanceAnimating = false
      }
    }, stepTime)
  }

  function formatBalance(n: number): string {
    return n.toLocaleString('ru-RU')
  }

  function formatCountdownMs(diff: number): string {
    const h = Math.floor(diff / 3600000)
    const m = Math.floor((diff % 3600000) / 60000)
    const s = Math.floor((diff % 60000) / 1000)
    return h > 0 
      ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
      : `${m}:${s.toString().padStart(2, '0')}`
  }

  function updateTimer() {
    const nowMs = Date.now()

    // Countdown to scheduled start (upcoming -> active)
    if (auction?.status === 'upcoming' && auction.start_at) {
      const startMs = new Date(auction.start_at).getTime()
      const diffStart = startMs - nowMs

      if (Number.isNaN(startMs)) {
        startLeft = ''
      } else if (diffStart <= 0) {
        startLeft = '0:00'
        // Poll until worker flips auction to active
        if (nowMs - lastStartPollAt >= 1000) {
          lastStartPollAt = nowMs
          load({ silent: true })
        }
      } else {
        startLeft = formatCountdownMs(diffStart)
      }
    } else {
      startLeft = ''
    }

    // Countdown to round end
    if (!round) {
      timeLeft = ''
      return
    }

    const endMs = new Date(round.end_at).getTime()
    const diffEnd = endMs - nowMs

    if (diffEnd <= 0) {
      timeLeft = '0:00'
      // Poll until worker creates next round / completes auction
      if (nowMs - lastRoundPollAt >= 1000) {
        lastRoundPollAt = nowMs
        load({ silent: true })
      }
      return
    }

    timeLeft = formatCountdownMs(diffEnd)
  }

  function connectWs() {
    if (ws) return
    ws = new AuctionWebSocket(auctionId, getInitData())
    ws.subscribe((event) => {
      if (event.type === 'bid') {
        if (event.leaderboard && Array.isArray(event.leaderboard)) {
          leaderboard = event.leaderboard
        }
        triggerHaptic('light')
      } else if (event.type === 'round_extended' && round) {
        round = { ...round, end_at: event.round.end_at, extensions_count: event.round.extensions_count }
        triggerHaptic('medium')
      }
    })
    ws.connect()
  }

  onMount(async () => {
    await load()
    timer = setInterval(updateTimer, 1000)
    updateTimer()
    if (auction?.status === 'active') connectWs()
  })

  onDestroy(() => {
    if (timer) clearInterval(timer)
    ws?.disconnect()
  })

  const SLIDER_STEPS = 50
  
  function clamp(n: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, n))
  }

  function quantizeToStep(value: number, base: number, step: number): number {
    if (!Number.isFinite(value)) return base
    if (step <= 0) return Math.floor(value)
    const diff = value - base
    const steps = Math.round(diff / step)
    return base + steps * step
  }

  function calcBidAmount(slider: number, start: number, max: number): string {
    const range = max - start
    if (range <= 0) return String(start)
    const raw = start + (range * slider) / SLIDER_STEPS
    const quantized = quantizeToStep(raw, minBidValue, bidStepValue)
    return String(clamp(quantized, start, max))
  }

  $: minBidValue = auction ? Math.ceil(parseFloat(auction.min_bid)) : 1
  $: bidStepValue = auction ? Math.ceil(parseFloat(auction.bid_step)) : 1
  $: currentBidValue = myBid ? Math.floor(parseFloat(myBid.amount)) : 0
  $: startBidValue = currentBidValue > 0 ? currentBidValue + bidStepValue : minBidValue
  // Max you can bid now = liquid funds + already held amount in this auction (my current bid).
  $: maxBidValue = $walletView.wallet ? Math.max(startBidValue, $walletView.available + currentBidValue) : 10000

  $: sliderProgress = (sliderValue / SLIDER_STEPS) * 100

  function onSliderInput(e: Event) {
    const target = e.target as HTMLInputElement
    const newValue = parseInt(target.value)
    
    if (Math.abs(newValue - prevSliderValue) >= 2) {
      triggerSliderTick()
      prevSliderValue = newValue
    }
    
    sliderValue = newValue
    bidAmount = calcBidAmount(sliderValue, startBidValue, maxBidValue)
    
    if (sliderValue >= SLIDER_STEPS) {
      showCustomInput = true
      customBidValue = bidAmount
    } else {
      showCustomInput = false
    }
  }

  function submitCustomBid() {
    const raw = Math.floor(parseFloat(customBidValue))
    if (Number.isNaN(raw) || raw <= 0) return

    const quantized = quantizeToStep(raw, minBidValue, bidStepValue)
    bidAmount = String(clamp(quantized, startBidValue, maxBidValue))
    showCustomInput = false
    placeBid()
  }

  async function placeBid() {
    if (!auction || bidding) return
    const amount = bidAmount.trim()
    if (!amount || isNaN(parseFloat(amount))) return

    bidding = true
    bidError = ''
    triggerHaptic('medium')

    try {
      const initData = getInitData()
      const result = await apiPlaceBid(initData, auctionId, amount)
      myBid = result.bid
      round = result.round
      leaderboard = result.leaderboard
      
      await walletStore.refresh()

      const newCurrentBid = myBid ? Math.floor(parseFloat(myBid.amount)) : 0
      const newStartBid = newCurrentBid + (auction ? Math.ceil(parseFloat(auction.bid_step)) : 1)
      bidAmount = String(newStartBid)
      sliderValue = 0
      
      triggerSuccessPattern()
    } catch (e) {
      bidError = e instanceof Error ? e.message : 'Ошибка ставки'
      triggerErrorPattern()
    } finally {
      bidding = false
    }
  }

  async function startAuction() {
    if (!auction) return
    triggerHaptic('medium')
    try {
      const initData = getInitData()
      const result = await apiStartAuction(initData, auctionId)
      auction = result.auction
      round = result.round
      const lb = await apiGetLeaderboard(initData, auctionId)
      leaderboard = lb.leaderboard
      connectWs()
      triggerSuccessPattern()
    } catch (e) {
      error = e instanceof Error ? e.message : 'Ошибка'
    }
  }

  function handleBack() {
    triggerHaptic('light')
    dispatch('back')
  }

  $: myEntry = leaderboard.find((b) => b.user_id === userId)
  $: myRank = myEntry ? leaderboard.indexOf(myEntry) + 1 : 0
  $: isWinning = round && myRank > 0 && myRank <= round.items_count
  $: giftsProgress = auction ? `${auction.distributed_items} из ${auction.total_items}` : '0 из 0'

  function formatAmount(amount: string): string {
    const n = parseFloat(amount)
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + 'M'
    if (n >= 1000) return Math.floor(n).toLocaleString('ru-RU')
    return amount
  }
</script>

<div class="detail">
  <header>
    <button class="back-btn" on:click={handleBack}>
      <IconChevronLeft size={24} stroke={2} />
    </button>
    <button 
      class="balance-btn" 
      class:pressed={balancePressed}
            class:maxed={$walletView.available >= MAX_BALANCE}
      on:click={depositBalance}
    >
      <span class="star">⭐</span>
      <span class="balance-value">{formatBalance(displayBalance)}</span>
    </button>
  </header>

  {#if loading}
    <div class="loading-state">
      <div class="skeleton-circle"></div>
      <div class="skeleton-line w-40"></div>
      <div class="skeleton-line w-60"></div>
    </div>
  {:else if error}
    <div class="error-state">
      <p>{error}</p>
      <button on:click={() => load()}>Повторить</button>
    </div>
  {:else if auction}
    {@const auctionPhoto = parseAuctionPhoto(auction.auction_photo)}
    
    {#if auction.status === 'active' && round}
      <div class="content">
        <div class="slider-section" in:scale={{ duration: 300 }}>
          <div class="auction-icon" style="background: {auctionPhoto.gradientCss}">
            <IconGavel size={40} stroke={1.5} color="white" />
          </div>
          
          <div class="bid-amount">
            <span class="star">⭐</span>
            <span class="value">{formatAmount(bidAmount)}</span>
          </div>

          <div class="slider-wrap">
            <div class="slider-track">
              <div class="slider-fill" style="width: {sliderProgress}%"></div>
            </div>
            <input 
              type="range" 
              min="0" 
              max={SLIDER_STEPS} 
              value={sliderValue}
              on:input={onSliderInput}
            />
          </div>
          
          <div class="slider-labels">
            <span>{formatAmount(String(startBidValue))}</span>
            <span>{formatAmount(String(maxBidValue))}</span>
          </div>
        </div>

        {#if showCustomInput}
          <div class="modal" transition:fade={{ duration: 150 }}>
            <div class="modal-content" in:scale={{ duration: 200 }}>
              <h3>Введите сумму</h3>
              <input 
                type="text" 
                inputmode="numeric"
                bind:value={customBidValue}
                placeholder="0"
              />
              <div class="modal-actions">
                <button class="btn-secondary" on:click={() => { showCustomInput = false; sliderValue = SLIDER_STEPS - 1 }}>
                  Отмена
                </button>
                <button class="btn-primary" on:click={submitCustomBid}>
                  Подтвердить
                </button>
              </div>
            </div>
          </div>
        {/if}

        <div class="info" in:fly={{ y: 20, duration: 250, delay: 50 }}>
          <h2>Размещение ставки</h2>
          <p>Выигрывают {round.items_count} наибольших ставок</p>
        </div>

        <div class="stats" in:fly={{ y: 20, duration: 250, delay: 100 }}>
          <div class="stat">
            <span class="stat-value">⭐ {formatAmount(auction.min_bid)}</span>
            <span class="stat-label">минимум</span>
          </div>
          <div class="stat">
            <span class="stat-value timer">{timeLeft || '—'}</span>
            <span class="stat-label">до конца</span>
          </div>
          <div class="stat">
            <span class="stat-value">{giftsProgress}</span>
            <span class="stat-label">раздано</span>
          </div>
        </div>

        {#if myEntry}
          <div class="my-position" class:winning={isWinning} in:fly={{ y: 20, duration: 250, delay: 150 }}>
            <div class="position-rank" class:winner={isWinning}>{myRank}</div>
            <span class="position-name">{myEntry.display_name}</span>
            <span class="position-amount">⭐ {formatAmount(myEntry.amount)}</span>
          </div>
        {/if}

        <div class="leaderboard" in:fly={{ y: 20, duration: 250, delay: 200 }}>
          <h3>Топ участников</h3>
          {#each leaderboard.slice(0, 10) as entry, idx}
            <div class="leader-row" class:me={entry.user_id === userId}>
              <span class="leader-rank" class:gold={idx === 0} class:silver={idx === 1} class:bronze={idx === 2}>
                {idx + 1}
              </span>
              <div class="leader-avatar">
                {#if entry.is_anonymous}
                  {@const parsed = parseAnonPhoto(entry.display_photo)}
                  <div class="anon" style="background: {parsed.gradientCss}">
                    <svelte:component this={getAnimalIconComponent(parsed.animalId)} size={16} color="white" />
                  </div>
                {:else if entry.display_photo?.startsWith('http')}
                  <img src={entry.display_photo} alt="" />
                {:else}
                  <div class="initial">{entry.display_name.charAt(0)}</div>
                {/if}
              </div>
              <span class="leader-name">{entry.display_name}</span>
              <span class="leader-amount">⭐ {formatAmount(entry.amount)}</span>
            </div>
          {/each}
        </div>

        {#if bidError}
          <div class="bid-error" in:fly={{ y: 10, duration: 150 }}>{bidError}</div>
        {/if}

        <button class="bid-btn" on:click={placeBid} disabled={bidding}>
          {#if bidding}
            <span class="dots"><span></span><span></span><span></span></span>
          {:else}
            Сделать ставку · ⭐ {formatAmount(bidAmount)}
          {/if}
        </button>
      </div>

    {:else if auction.status === 'draft'}
      <div class="placeholder">
        <IconClock size={48} stroke={1.5} />
        <p>Аукцион ещё не начался</p>
        <button class="btn-primary" on:click={startAuction}>Начать</button>
      </div>

    {:else if auction.status === 'upcoming'}
      <div class="placeholder">
        <IconClock size={48} stroke={1.5} />
        <p>Старт через {startLeft || '—'}</p>
        <p class="sub">Ожидайте — аукцион запустится автоматически</p>
      </div>

    {:else if auction.status === 'completed'}
      <div class="placeholder">
        <IconTrophy size={48} stroke={1.5} />
        <p>Аукцион завершён</p>
        <p class="sub">Подарков раздано: {auction.distributed_items} из {auction.total_items}</p>
        <div class="final-bid">⭐ {formatAmount(auction.highest_bid)}</div>
        <span class="final-label">Топ ставка</span>
      </div>
    {/if}
  {/if}
</div>

<style>
  .detail {
    min-height: 100vh;
    background: var(--ios-bg);
    padding-bottom: 100px;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 16px;
    position: sticky;
    top: 0;
    background: var(--ios-bg);
    z-index: 10;
  }

  .back-btn {
    width: 40px;
    height: 40px;
    border: none;
    border-radius: 20px;
    background: transparent;
    color: var(--ios-blue);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: opacity 0.15s ease;
  }

  .back-btn:active {
    opacity: 0.5;
  }

  .balance-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 7px 12px;
    border: none;
    border-radius: 8px;
    background: var(--ios-fill-secondary);
    color: var(--ios-label);
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease, transform 0.15s ease;
    -webkit-tap-highlight-color: transparent;
  }

  .balance-btn:active,
  .balance-btn.pressed {
    background: var(--ios-fill);
    transform: scale(0.97);
  }

  .balance-btn.maxed {
    opacity: 0.5;
    pointer-events: none;
  }

  .star {
    font-size: 13px;
  }

  .balance-value {
    font-variant-numeric: tabular-nums;
  }

  .content {
    padding: 0 16px;
  }

  .slider-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20px 0 24px;
    gap: 16px;
  }

  .auction-icon {
    width: 72px;
    height: 72px;
    border-radius: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .bid-amount {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .bid-amount .star {
    font-size: 28px;
  }

  .bid-amount .value {
    font-size: 44px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: -1px;
  }

  .slider-wrap {
    position: relative;
    width: 100%;
    height: 36px;
    padding: 0 4px;
  }

  .slider-track {
    position: absolute;
    top: 50%;
    left: 4px;
    right: 4px;
    height: 4px;
    border-radius: 2px;
    background: var(--ios-fill);
    transform: translateY(-50%);
  }

  .slider-fill {
    height: 100%;
    background: var(--ios-blue);
    border-radius: 2px;
    transition: width 0.05s ease;
  }

  .slider-wrap input {
    position: relative;
    width: 100%;
    height: 100%;
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    cursor: pointer;
  }

  .slider-wrap input::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 28px;
    height: 28px;
    border-radius: 14px;
    background: #fff;
    border: none;
    box-shadow: 0 0.5px 4px rgba(0, 0, 0, 0.12), 0 6px 13px rgba(0, 0, 0, 0.12);
  }

  .slider-labels {
    display: flex;
    justify-content: space-between;
    width: 100%;
    font-size: 13px;
    color: var(--ios-gray);
    padding: 0 4px;
  }

  .modal {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 20px;
  }

  :global(:root.dark) .modal {
    background: rgba(0, 0, 0, 0.6);
  }

  .modal-content {
    background: var(--ios-bg-elevated);
    padding: 20px;
    border-radius: 14px;
    width: 100%;
    max-width: 270px;
  }

  .modal-content h3 {
    margin: 0 0 16px;
    font-size: 17px;
    font-weight: 600;
    text-align: center;
    color: var(--ios-label);
  }

  .modal-content input {
    width: 100%;
    padding: 12px;
    border: none;
    border-radius: 10px;
    background: var(--ios-fill-tertiary);
    color: var(--ios-label);
    font-size: 22px;
    font-weight: 500;
    text-align: center;
    margin-bottom: 16px;
  }

  .modal-actions {
    display: flex;
    gap: 8px;
  }

  .btn-secondary, .btn-primary {
    flex: 1;
    padding: 12px;
    border: none;
    border-radius: 10px;
    font-size: 17px;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.15s ease;
    -webkit-tap-highlight-color: transparent;
  }

  .btn-secondary {
    background: var(--ios-fill-secondary);
    color: var(--ios-blue);
  }

  .btn-primary {
    background: var(--ios-blue);
    color: #fff;
  }

  .btn-secondary:active, .btn-primary:active {
    opacity: 0.7;
  }

  .info {
    text-align: center;
    margin-bottom: 24px;
  }

  .info h2 {
    margin: 0 0 6px;
    font-size: 22px;
    font-weight: 700;
    color: var(--ios-label);
  }

  .info p {
    margin: 0;
    color: var(--ios-gray);
    font-size: 15px;
  }

  .stats {
    display: flex;
    gap: 8px;
    margin-bottom: 20px;
  }

  .stat {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 14px 8px;
    background: var(--ios-bg-secondary);
    border-radius: 12px;
  }

  .stat-value {
    font-size: 17px;
    font-weight: 600;
    color: var(--ios-label);
  }

  .stat-value.timer {
    color: var(--ios-red);
  }

  .stat-label {
    font-size: 12px;
    color: var(--ios-gray);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .my-position {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    background: var(--ios-bg-secondary);
    border-radius: 12px;
    margin-bottom: 20px;
  }

  .my-position.winning {
    background: rgba(48, 209, 88, 0.15);
  }

  :global(:root:not(.dark)) .my-position.winning {
    background: rgba(52, 199, 89, 0.15);
  }

  .position-rank {
    width: 28px;
    height: 28px;
    background: var(--ios-orange);
    color: #fff;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 13px;
  }

  .position-rank.winner {
    background: var(--ios-green);
  }

  .position-name {
    flex: 1;
    font-weight: 500;
    font-size: 17px;
    color: var(--ios-label);
  }

  .position-amount {
    font-weight: 600;
    color: var(--ios-gray);
    font-size: 15px;
  }

  .leaderboard {
    margin-bottom: 24px;
  }

  .leaderboard h3 {
    margin: 0 0 12px;
    font-size: 13px;
    font-weight: 600;
    color: var(--ios-gray);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .leader-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 0;
    border-bottom: 0.5px solid var(--ios-separator);
  }

  .leader-row:last-child {
    border-bottom: none;
  }

  .leader-row.me {
    background: rgba(10, 132, 255, 0.1);
    margin: 0 -16px;
    padding: 12px 16px;
    border-radius: 10px;
    border-bottom: none;
  }

  :global(:root:not(.dark)) .leader-row.me {
    background: rgba(0, 122, 255, 0.1);
  }

  .leader-rank {
    width: 24px;
    height: 24px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 13px;
    background: var(--ios-fill-secondary);
    color: var(--ios-gray);
  }

  .leader-rank.gold {
    background: #FFD60A;
    color: #000;
  }

  .leader-rank.silver {
    background: #A8A8A8;
    color: #fff;
  }

  .leader-rank.bronze {
    background: #CD7F32;
    color: #fff;
  }

  .leader-avatar {
    width: 40px;
    height: 40px;
    border-radius: 20px;
    overflow: hidden;
  }

  .leader-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .anon, .initial {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .initial {
    background: var(--ios-blue);
    color: #fff;
    font-weight: 600;
    font-size: 15px;
  }

  .leader-name {
    flex: 1;
    font-weight: 400;
    font-size: 17px;
    color: var(--ios-label);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .leader-amount {
    font-weight: 500;
    color: var(--ios-gray);
    font-size: 15px;
  }

  .bid-error {
    padding: 12px 16px;
    background: rgba(255, 69, 58, 0.12);
    color: var(--ios-red);
    border-radius: 10px;
    font-size: 15px;
    text-align: center;
    margin-bottom: 16px;
  }

  :global(:root:not(.dark)) .bid-error {
    background: rgba(255, 59, 48, 0.12);
  }

  .bid-btn {
    position: fixed;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
    left: 16px;
    right: 16px;
    padding: 16px;
    border: none;
    border-radius: 14px;
    background: var(--ios-blue);
    color: #fff;
    font-size: 17px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s ease;
    -webkit-tap-highlight-color: transparent;
    z-index: 50;
  }

  .bid-btn:active:not(:disabled) {
    opacity: 0.7;
  }

  .bid-btn:disabled {
    opacity: 0.5;
  }

  .dots {
    display: flex;
    gap: 4px;
    justify-content: center;
  }

  .dots span {
    width: 6px;
    height: 6px;
    border-radius: 3px;
    background: currentColor;
    animation: bounce 1.4s infinite ease-in-out both;
  }

  .dots span:nth-child(1) { animation-delay: -0.32s; }
  .dots span:nth-child(2) { animation-delay: -0.16s; }

  @keyframes bounce {
    0%, 80%, 100% { transform: scale(0); }
    40% { transform: scale(1); }
  }

  .placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 80px 20px;
    color: var(--ios-gray);
    text-align: center;
  }

  .placeholder p {
    margin: 20px 0 6px;
    font-size: 20px;
    font-weight: 600;
    color: var(--ios-label);
  }

  .placeholder .sub {
    margin: 0 0 24px;
    font-size: 15px;
    color: var(--ios-gray);
  }

  .placeholder .btn-primary {
    padding: 14px 32px;
  }

  .final-bid {
    font-size: 34px;
    font-weight: 700;
    color: var(--ios-label);
    margin-top: 24px;
    letter-spacing: -0.5px;
  }

  .final-label {
    font-size: 13px;
    color: var(--ios-gray);
    margin-top: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 60px;
  }

  .skeleton-circle {
    width: 72px;
    height: 72px;
    border-radius: 36px;
    background: var(--ios-fill);
    animation: pulse 1.2s ease-in-out infinite;
  }

  .skeleton-line {
    height: 20px;
    border-radius: 4px;
    background: var(--ios-fill);
    animation: pulse 1.2s ease-in-out infinite;
  }

  .w-40 { width: 40%; }
  .w-60 { width: 60%; }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 80px 20px;
    color: var(--ios-gray);
  }

  .error-state button {
    margin-top: 20px;
    padding: 12px 28px;
    border: none;
    border-radius: 10px;
    background: var(--ios-fill-secondary);
    color: var(--ios-blue);
    font-size: 17px;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.15s ease;
  }

  .error-state button:active {
    opacity: 0.7;
  }
</style>
