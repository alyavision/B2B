#!/usr/bin/env python3
"""
Отладочный скрипт для поиска проблемы с ботом
"""

import os
import sys
from dotenv import load_dotenv

# Загружаем переменные окружения
load_dotenv()

print("=== ОТЛАДКА БОТА ===")
print(f"1. TELEGRAM_BOT_TOKEN из os.getenv: {os.getenv('TELEGRAM_BOT_TOKEN')}")
print(f"2. Длина токена: {len(os.getenv('TELEGRAM_BOT_TOKEN', ''))}")
print(f"3. Последние символы: {os.getenv('TELEGRAM_BOT_TOKEN', '')[-5:] if os.getenv('TELEGRAM_BOT_TOKEN') else 'None'}")

# Тестируем импорт конфигурации
try:
    from config import Config
    print(f"4. Config.TELEGRAM_BOT_TOKEN: {Config.TELEGRAM_BOT_TOKEN}")
    print(f"5. Длина Config токена: {len(Config.TELEGRAM_BOT_TOKEN)}")
    print(f"6. Последние символы Config: {Config.TELEGRAM_BOT_TOKEN[-5:]}")
except Exception as e:
    print(f"❌ Ошибка импорта config: {e}")

# Тестируем создание приложения
try:
    from telegram.ext import Application
    print("\n7. Тестируем создание Application...")
    app = Application.builder().token(os.getenv('TELEGRAM_BOT_TOKEN')).build()
    print("✅ Application создан успешно")
except Exception as e:
    print(f"❌ Ошибка создания Application: {e}")

print("\n=== КОНЕЦ ОТЛАДКИ ===")
