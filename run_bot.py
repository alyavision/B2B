#!/usr/bin/env python3
"""
Скрипт для запуска Telegram-бота Synaplink
Включает проверки конфигурации, логирование и обработку ошибок
"""

import os
import sys
import logging
import signal
import time
from pathlib import Path

# Добавляем текущую директорию в путь для импортов
sys.path.insert(0, str(Path(__file__).parent))

def setup_logging():
    """Настраивает логирование для бота"""
    # Создаем директорию для логов если её нет
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)
    
    # Настраиваем форматирование
    log_format = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    date_format = '%Y-%m-%d %H:%M:%S'
    
    # Настраиваем логирование в файл
    file_handler = logging.FileHandler(log_dir / "bot.log", encoding='utf-8')
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(logging.Formatter(log_format, date_format))
    
    # Настраиваем логирование в консоль
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(logging.Formatter(log_format, date_format))
    
    # Настраиваем корневой логгер
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)
    
    # Устанавливаем уровень для сторонних библиотек
    logging.getLogger('telegram').setLevel(logging.WARNING)
    logging.getLogger('openai').setLevel(logging.WARNING)
    logging.getLogger('httpx').setLevel(logging.WARNING)
    
    return root_logger

def check_environment():
    """Проверяет наличие необходимых переменных окружения (Railway: только лог)"""
    logger = logging.getLogger(__name__)
    logger.info("ℹ️ Railway: переменные окружения должны быть заданы через панель Railway, файл .env не требуется.")
    return True

def check_dependencies():
    """Проверяет установленные зависимости"""
    logger = logging.getLogger(__name__)
    
    required_packages = [
        'telegram',
        'openai',
        'python-dotenv',
        'requests',
        'PIL'
    ]
    
    missing_packages = []
    
    for package in required_packages:
        try:
            if package == 'PIL':
                import PIL
            elif package == 'telegram':
                import telegram
            elif package == 'openai':
                import openai
            elif package == 'python-dotenv':
                import dotenv
            elif package == 'requests':
                import requests
        except ImportError:
            missing_packages.append(package)
    
    if missing_packages:
        logger.error(f"❌ Отсутствуют пакеты: {', '.join(missing_packages)}")
        logger.error("📦 Установите зависимости: pip install -r requirements.txt")
        return False
    
    logger.info("✅ Все зависимости установлены")
    return True

def signal_handler(signum, frame):
    """Обработчик сигналов для корректного завершения работы"""
    logger = logging.getLogger(__name__)
    logger.info(f"📡 Получен сигнал {signum}, завершение работы...")
    
    # Здесь можно добавить логику для корректного завершения
    # например, закрытие соединений, сохранение состояния и т.д.
    
    sys.exit(0)

def main():
    """Основная функция запуска бота"""
    # Настраиваем логирование
    logger = setup_logging()
    
    logger.info("🚀 Запуск Telegram-бота Synaplink...")
    
    # Проверяем окружение
    if not check_environment():
        logger.error("❌ Проверка окружения не пройдена")
        sys.exit(1)
    
    # Проверяем зависимости
    if not check_dependencies():
        logger.error("❌ Проверка зависимостей не пройдена")
        sys.exit(1)
    
    # Настраиваем обработчики сигналов
    signal.signal(signal.SIGINT, signal_handler)   # Ctrl+C
    signal.signal(signal.SIGTERM, signal_handler)  # Завершение процесса
    
    try:
        # Импортируем и запускаем бота
        logger.info("📥 Импорт модулей бота...")
        
        from bot import SynaplinkBot
        
        logger.info("🤖 Создание экземпляра бота...")
        bot = SynaplinkBot()
        
        logger.info("🚀 Запуск бота...")
        logger.info("📱 Бот готов к работе!")
        logger.info("💡 Для остановки нажмите Ctrl+C")
        
        # Запускаем бота
        bot.run()
        
    except ImportError as e:
        logger.error(f"❌ Ошибка импорта: {e}")
        logger.error("🔧 Проверьте корректность установки зависимостей")
        sys.exit(1)
        
    except Exception as e:
        logger.error(f"❌ Критическая ошибка: {e}")
        logger.error("🔧 Проверьте конфигурацию и логи")
        sys.exit(1)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n👋 Бот остановлен пользователем")
        sys.exit(0)
    except Exception as e:
        print(f"❌ Неожиданная ошибка: {e}")
        sys.exit(1)
