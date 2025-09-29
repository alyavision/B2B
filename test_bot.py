"""
Скрипт для тестирования основных функций бота Synaplink
Позволяет проверить логику без запуска Telegram API
"""

import os
import sys
from unittest.mock import Mock, patch
from config import Config
from openai_client import OpenAIClient
from application_handler import ApplicationHandler

def test_config():
    """Тестирует загрузку конфигурации"""
    print("🧪 Тестирование конфигурации...")
    
    try:
        # Создаем временные переменные окружения
        test_env = {
            'TELEGRAM_BOT_TOKEN': 'test_token_123',
            'OPENAI_API_KEY': 'test_openai_key_456',
            'OPENAI_ASSISTANT_ID': 'test_assistant_789',
            'TELEGRAM_CHANNEL_LINK': 'https://t.me/test_channel',
            'WORKING_CHAT_ID': '-1001234567890',
            'LOGO_IMAGE_URL': 'https://example.com/logo.png'
        }
        
        # Устанавливаем переменные окружения
        for key, value in test_env.items():
            os.environ[key] = value
        
        # Перезагружаем конфигурацию
        import importlib
        import config
        importlib.reload(config)
        
        # Проверяем загрузку
        assert config.Config.TELEGRAM_BOT_TOKEN == 'test_token_123'
        assert config.Config.OPENAI_API_KEY == 'test_openai_key_456'
        assert config.Config.OPENAI_ASSISTANT_ID == 'test_assistant_789'
        
        print("✅ Конфигурация загружается корректно")
        return True
        
    except Exception as e:
        print(f"❌ Ошибка в конфигурации: {e}")
        return False

def test_application_handler():
    """Тестирует обработчик заявок"""
    print("\n🧪 Тестирование обработчика заявок...")
    
    try:
        handler = ApplicationHandler()
        
        # Тест 1: Корректная заявка
        valid_application = """
        [Заявка в рабочий чат]
        Имя: Иван Иванов
        Телефон: +7 999 123-45-67
        Email: ivan@example.com
        Запрос: Нужна консультация по разработке сайта
        """
        
        is_valid = handler.is_application(valid_application)
        print(f"✅ Корректная заявка определена: {is_valid}")
        
        # Тест 2: Парсинг заявки
        parsed = handler.parse_application(valid_application)
        if parsed:
            print(f"✅ Заявка распарсена: {len(parsed)} полей")
            print(f"   Имя: {parsed.get('name', 'Не найдено')}")
            print(f"   Телефон: {parsed.get('phone', 'Не найден')}")
            print(f"   Email: {parsed.get('email', 'Не найден')}")
            print(f"   Запрос: {parsed.get('request', 'Не найден')}")
        
        # Тест 3: Форматирование для рабочего чата
        formatted = handler.format_application_for_working_chat(valid_application, 12345)
        print(f"✅ Заявка отформатирована для рабочего чата")
        print(f"   Длина: {len(formatted)} символов")
        
        # Тест 4: Валидация заявки
        is_valid, message = handler.validate_application(valid_application)
        print(f"✅ Валидация заявки: {is_valid} - {message}")
        
        return True
        
    except Exception as e:
        print(f"❌ Ошибка в обработчике заявок: {e}")
        return False

def test_openai_client_mock():
    """Тестирует клиент OpenAI с мок-данными"""
    print("\n🧪 Тестирование клиента OpenAI (мок)...")
    
    try:
        # Полностью мокаем OpenAI клиент
        with patch('openai.OpenAI') as mock_openai_class:
            # Создаем мок-клиент
            mock_client = Mock()
            mock_openai_class.return_value = mock_client
            
            # Мокаем создание thread
            mock_thread = Mock()
            mock_thread.id = "test_thread_123"
            mock_client.beta.threads.create.return_value = mock_thread
            
            # Мокаем создание сообщения
            mock_message = Mock()
            mock_client.beta.threads.messages.create.return_value = mock_message
            
            # Мокаем запуск ассистента
            mock_run = Mock()
            mock_run.id = "test_run_456"
            mock_client.beta.threads.runs.create.return_value = mock_run
            
            # Мокаем статус выполнения
            mock_run_status = Mock()
            mock_run_status.status = 'completed'
            mock_client.beta.threads.runs.retrieve.return_value = mock_run_status
            
            # Мокаем получение сообщений
            mock_assistant_message = Mock()
            mock_assistant_message.role = "assistant"
            mock_content = Mock()
            mock_content.text.value = "Привет! Я Саня, ваш ассистент."
            mock_assistant_message.content = [mock_content]
            
            mock_messages = Mock()
            mock_messages.data = [mock_assistant_message]
            mock_client.beta.threads.messages.list.return_value = mock_messages
            
            # Создаем клиент с мок-конфигурацией
            with patch('config.Config.OPENAI_API_KEY', 'test_key'):
                with patch('config.Config.OPENAI_ASSISTANT_ID', 'test_assistant'):
                    client = OpenAIClient()
                    
                    # Тестируем создание thread
                    thread_id = client.create_thread(12345)
                    assert thread_id == "test_thread_123"
                    print("✅ Thread создается корректно")
                    
                    # Тестируем отправку сообщения
                    response = client.send_message(12345, "Привет!")
                    assert "Саня" in response
                    print("✅ Сообщения обрабатываются корректно")
            
            return True
            
    except Exception as e:
        print(f"❌ Ошибка в клиенте OpenAI: {e}")
        return False

def run_all_tests():
    """Запускает все тесты"""
    print("🚀 Запуск тестов для бота Synaplink...\n")
    
    tests = [
        ("Конфигурация", test_config),
        ("Обработчик заявок", test_application_handler),
        ("Клиент OpenAI", test_openai_client_mock)
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        try:
            if test_func():
                passed += 1
        except Exception as e:
            print(f"❌ Критическая ошибка в тесте '{test_name}': {e}")
    
    print(f"\n📊 Результаты тестирования:")
    print(f"   Пройдено: {passed}/{total}")
    print(f"   Успешность: {(passed/total)*100:.1f}%")
    
    if passed == total:
        print("🎉 Все тесты пройдены успешно!")
        return True
    else:
        print("⚠️  Некоторые тесты не пройдены")
        return False

if __name__ == "__main__":
    # Очищаем переменные окружения перед тестами
    for key in ['TELEGRAM_BOT_TOKEN', 'OPENAI_API_KEY', 'OPENAI_ASSISTANT_ID']:
        if key in os.environ:
            del os.environ[key]
    
    success = run_all_tests()
    
    if success:
        print("\n✅ Бот готов к запуску!")
        print("📝 Не забудьте создать файл .env с вашими настройками")
    else:
        print("\n❌ Обнаружены проблемы, которые нужно исправить перед запуском")
        sys.exit(1)
