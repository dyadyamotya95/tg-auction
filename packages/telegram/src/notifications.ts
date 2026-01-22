import { Bot, InlineKeyboard } from 'grammy'

let bot: Bot | null = null
let webappUrl: string = ''

export function initTgNotify(token: string, webapp: string) {
  if (!token) {
    console.warn('[tgNotify] TELEGRAM_BOT_TOKEN not set, notifications disabled')
    return
  }
  if (!webapp) {
    console.warn('[tgNotify] WEBAPP_URL not set, notifications disabled')
    return
  }
  bot = new Bot(token)
  webappUrl = webapp.replace(/\/$/, '')
  console.log('[tgNotify] initialized')
}

type NotifyOptions = {
  buttonText?: string
  buttonPath?: string
}

async function send(userId: number, text: string, options?: NotifyOptions) {
  if (!bot) {
    return
  }

  const keyboard =
    options?.buttonText && options?.buttonPath
      ? new InlineKeyboard().webApp(options.buttonText, {
          url: `${webappUrl}${options.buttonPath}`,
        })
      : undefined

  try {
    await bot.api.sendMessage(userId, text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('bot was blocked') || msg.includes('user is deactivated') || msg.includes('chat not found')) {
      return
    }
    console.error(`[tgNotify] failed to send to ${userId}:`, msg)
  }
}

export const tgNotify = {
  win(userId: number, giftNumber: number, auctionName: string) {
    return send(userId, `Вы выиграли Gift #${giftNumber} в аукционе «${auctionName}»!`, {
      buttonText: 'Открыть профиль',
      buttonPath: '/profile',
    })
  },

  refund(userId: number, amount: string, auctionName: string) {
    return send(userId, `Аукцион «${auctionName}» завершён. Ваша ставка ${amount} ⭐ возвращена.`, {
      buttonText: 'Аукционы',
      buttonPath: '/',
    })
  },

  transferred(userId: number, fromRound: number, toRound: number, auctionId: string, auctionName: string) {
    return send(
      userId,
      `Раунд ${fromRound} завершён! Вы переходите в раунд ${toRound} аукциона «${auctionName}».`,
      {
        buttonText: 'Открыть аукцион',
        buttonPath: `/auction/${auctionId}`,
      },
    )
  },

  outbid(userId: number, amount: string, itemsCount: number, auctionId: string, auctionName: string) {
    return send(userId, `Вас перебили! Вы вне топ-${itemsCount} в «${auctionName}».\nВаша ставка: ${amount} ⭐`, {
      buttonText: 'Поднять ставку',
      buttonPath: `/auction/${auctionId}`,
    })
  },
}
