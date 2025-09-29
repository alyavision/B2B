import asyncio
from telegram import Bot
from config import Config

async def main():
    bot = Bot(token=Config.TELEGRAM_BOT_TOKEN)
    print('Пробую получить последние обновления...')
    updates = await bot.get_updates(limit=5)
    print(f'Получено обновлений: {len(updates)}')
    for u in updates:
        print(u)

if __name__ == '__main__':
    asyncio.run(main())
