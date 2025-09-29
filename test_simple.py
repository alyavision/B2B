#!/usr/bin/env python3
import sys
import traceback

try:
    print("1. Импортируем config...")
    from config import Config
    print(f"   Токен: {Config.TELEGRAM_BOT_TOKEN}")
    
    print("2. Импортируем telegram...")
    from telegram.ext import Application
    print("   ✅ Telegram импортирован")
    
    print("3. Создаем приложение...")
    app = Application.builder().token(Config.TELEGRAM_BOT_TOKEN).build()
    print("   ✅ Приложение создано")
    
    print("4. Проверяем токен в приложении...")
    print(f"   Токен в приложении: {app.bot.token}")
    
    print("5. Тестируем подключение...")
    import asyncio
    async def test():
        try:
            me = await app.bot.get_me()
            print(f"   ✅ Бот подключен: {me.first_name} (@{me.username})")
        except Exception as e:
            print(f"   ❌ Ошибка подключения: {e}")
    
    asyncio.run(test())
    
except Exception as e:
    print(f"❌ КРИТИЧЕСКАЯ ОШИБКА: {e}")
    traceback.print_exc()
    sys.exit(1)
