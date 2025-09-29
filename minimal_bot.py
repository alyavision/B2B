#!/usr/bin/env python3
"""
Минимальная версия бота для тестирования
"""

import logging
from telegram.ext import Application, CommandHandler
from config import Config

# Настраиваем логирование
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def start_command(update, context):
    """Простая команда start"""
    await update.message.reply_text("Привет! Я работаю!")

def main():
    """Основная функция"""
    try:
        logger.info("Создание бота...")
        logger.info(f"Токен: {Config.TELEGRAM_BOT_TOKEN}")
        
        # Создаем приложение
        app = Application.builder().token(Config.TELEGRAM_BOT_TOKEN).build()
        
        # Добавляем обработчик
        app.add_handler(CommandHandler("start", start_command))
        
        logger.info("Запуск бота...")
        app.run_polling()
        
    except Exception as e:
        logger.error(f"Ошибка: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
