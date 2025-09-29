"""
Модуль для обработки и форматирования заявок от пользователей
Автоматически определяет заявки и отправляет их в рабочий чат
"""

import re
import logging
from typing import Dict, Optional, Tuple

logger = logging.getLogger(__name__)

class ApplicationHandler:
    """Класс для обработки заявок от пользователей"""
    
    def __init__(self):
        """Инициализация обработчика заявок"""
        # Паттерны для определения заявок
        self.application_patterns = {
            'header': r'\[Заявка в рабочий чат\]',
            'name': r'Имя:\s*(.+)',
            'phone': r'Телефон:\s*(.+)',
            'email': r'Email:\s*(.+)',
            'request': r'Запрос:\s*(.+)',
        }
        
        # Дополнительные индикаторы заявки
        self.application_indicators = [
            'заявка',
            'заказ',
            'консультация',
            'сотрудничество',
            'услуга',
            'проект'
        ]
    
    def is_application(self, text: str) -> bool:
        """
        Проверяет, является ли текст заявкой
        
        Args:
            text: Текст для проверки
            
        Returns:
            bool: True если это заявка, False в противном случае
        """
        if not text:
            return False
        
        text_lower = text.lower()
        
        # Проверяем основные паттерны заявки
        if self._check_main_patterns(text):
            return True
        
        # Проверяем дополнительные индикаторы
        if self._check_indicators(text_lower):
            return True
        
        return False
    
    def _check_main_patterns(self, text: str) -> bool:
        """Проверяет основные паттерны заявки"""
        # Проверяем наличие заголовка
        if not re.search(self.application_patterns['header'], text):
            return False
        
        # Проверяем наличие основных полей
        required_fields = ['name', 'phone', 'email', 'request']
        found_fields = 0
        
        for field in required_fields:
            if re.search(self.application_patterns[field], text):
                found_fields += 1
        
        # Должно быть найдено минимум 3 поля из 4
        return found_fields >= 3
    
    def _check_indicators(self, text_lower: str) -> bool:
        """Проверяет дополнительные индикаторы заявки"""
        # Ищем ключевые слова, указывающие на заявку
        indicator_count = 0
        
        for indicator in self.application_indicators:
            if indicator in text_lower:
                indicator_count += 1
        
        # Если найдено несколько индикаторов, это может быть заявка
        return indicator_count >= 2
    
    def parse_application(self, text: str) -> Optional[Dict[str, str]]:
        """
        Парсит заявку и извлекает структурированные данные
        
        Args:
            text: Текст заявки
            
        Returns:
            Dict[str, str]: Словарь с полями заявки или None если парсинг не удался
        """
        try:
            application_data = {}
            
            # Извлекаем данные по паттернам
            for field, pattern in self.application_patterns.items():
                match = re.search(pattern, text)
                if match:
                    if field == 'header':
                        application_data[field] = match.group(0)
                    else:
                        application_data[field] = match.group(1).strip()
            
            # Проверяем, что получили достаточно данных
            if len(application_data) >= 4:  # header + 3 поля
                return application_data
            
            return None
            
        except Exception as e:
            logger.error(f"Ошибка при парсинге заявки: {e}")
            return None
    
    def format_application_for_working_chat(self, application_text: str, user_id: int) -> str:
        """
        Форматирует заявку для отправки в рабочий чат
        
        Args:
            application_text: Текст заявки
            user_id: ID пользователя Telegram
            
        Returns:
            str: Отформатированная заявка для рабочего чата
        """
        try:
            # Парсим заявку
            app_data = self.parse_application(application_text)
            
            if app_data:
                # Форматируем структурированную заявку
                formatted = (
                    f"🚨 НОВАЯ ЗАЯВКА ОТ ПОЛЬЗОВАТЕЛЯ {user_id}\n\n"
                    f"📋 {app_data.get('header', '[Заявка]')}\n\n"
                    f"👤 Имя: {app_data.get('name', 'Не указано')}\n"
                    f"📱 Телефон: {app_data.get('phone', 'Не указано')}\n"
                    f"📧 Email: {app_data.get('email', 'Не указано')}\n"
                    f"💬 Запрос: {app_data.get('request', 'Не указано')}\n\n"
                    f"🆔 ID пользователя: {user_id}\n"
                    f"⏰ Время: {self._get_current_time()}"
                )
            else:
                # Если парсинг не удался, отправляем как есть
                formatted = (
                    f"🚨 НОВАЯ ЗАЯВКА ОТ ПОЛЬЗОВАТЕЛЯ {user_id}\n\n"
                    f"📋 Содержание заявки:\n{application_text}\n\n"
                    f"🆔 ID пользователя: {user_id}\n"
                    f"⏰ Время: {self._get_current_time()}"
                )
            
            return formatted
            
        except Exception as e:
            logger.error(f"Ошибка при форматировании заявки: {e}")
            # Возвращаем простой формат в случае ошибки
            return (
                f"🚨 НОВАЯ ЗАЯВКА ОТ ПОЛЬЗОВАТЕЛЯ {user_id}\n\n"
                f"📋 Содержание:\n{application_text}\n\n"
                f"🆔 ID пользователя: {user_id}"
            )
    
    def _get_current_time(self) -> str:
        """Возвращает текущее время в читаемом формате"""
        from datetime import datetime
        return datetime.now().strftime("%d.%m.%Y %H:%M:%S")
    
    def validate_application(self, application_text: str) -> Tuple[bool, str]:
        """
        Валидирует заявку и возвращает результат проверки
        
        Args:
            application_text: Текст заявки для валидации
            
        Returns:
            Tuple[bool, str]: (результат валидации, сообщение об ошибке)
        """
        if not application_text:
            return False, "Заявка пустая"
        
        # Проверяем минимальную длину
        if len(application_text.strip()) < 50:
            return False, "Заявка слишком короткая"
        
        # Проверяем наличие контактной информации
        if not re.search(r'@|телефон|phone|\+7|\d{10,}', application_text.lower()):
            return False, "Отсутствует контактная информация"
        
        # Проверяем наличие запроса
        if not re.search(r'запрос|вопрос|интерес|нужно|хочу', application_text.lower()):
            return False, "Не указан запрос или вопрос"
        
        return True, "Заявка валидна"
