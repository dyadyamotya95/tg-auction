import { Bot, InlineKeyboard } from 'grammy'
import { config } from './config.js'

async function main(): Promise<void> {
  if (!config.telegram.bot_token) {
    throw new Error('TELEGRAM_BOT_TOKEN is required')
  }

  const bot = new Bot(config.telegram.bot_token)

  bot.command('start', async (ctx) => {
    const keyboard = new InlineKeyboard().webApp('Открыть аукцион', { url: config.webapp.url })

    await ctx.reply(
      ['Добро пожаловать', 'Нажми кнопку ниже, чтобы открыть Mini App.'].join('\n'),
      { reply_markup: keyboard },
    )
  })

  bot.catch((err) => {
    console.error('BOT_ERROR', err)
  })

  console.log('Bot started')
  await bot.start()
}

main().catch((err) => {
  console.error('BOT_FATAL', err)
  process.exitCode = 1
})
