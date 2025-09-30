"""
Модуль конфигурации для Telegram-бота Synaplink
Загружает все необходимые переменные окружения
"""

import os
from dotenv import load_dotenv

# Загружаем переменные окружения из .env файла
load_dotenv()

class Config:
	"""Класс конфигурации с настройками бота"""
	
	# Telegram Bot Token
	TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
	
	# OpenAI API Key
	OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')

	# OpenAI Organization ID (опционально)
	OPENAI_ORG_ID = os.getenv('OPENAI_ORG_ID')

	# OpenAI Project ID (опционально)
	OPENAI_PROJECT_ID = os.getenv('OPENAI_PROJECT_ID')
	
	# OpenAI Assistant ID
	OPENAI_ASSISTANT_ID = os.getenv('OPENAI_ASSISTANT_ID')
	
	# Telegram Channel Link
	TELEGRAM_CHANNEL_LINK = os.getenv('TELEGRAM_CHANNEL_LINK')
	
	# Telegram Working Chat ID (для отправки заявок)
	WORKING_CHAT_ID = os.getenv('WORKING_CHAT_ID')
	
	# Logo Image URL или путь к файлу
	LOGO_IMAGE_URL = os.getenv('LOGO_IMAGE_URL')

	# Checklist file URL (PDF)
	CHECKLIST_URL = os.getenv('CHECKLIST_URL')

	# Секрет для Telegram Webhook (опционально, для проверки заголовка X-Telegram-Bot-Api-Secret-Token)
	TELEGRAM_WEBHOOK_SECRET = os.getenv('TELEGRAM_WEBHOOK_SECRET')

	# Redis URL для сохранения thread_id (опционально, рекомендуется для serverless)
	REDIS_URL = os.getenv('REDIS_URL')
	REDIS_PREFIX = os.getenv('REDIS_PREFIX', 'b2bbot:thread:')

	# Ключ множества подписчиков для рассылки
	SUBS_SET_KEY = os.getenv('SUBS_SET_KEY', 'b2bbot:subs')

	# Секрет для ручного вызова рассылки через HTTP (защита эндпоинта)
	BROADCAST_SECRET = os.getenv('BROADCAST_SECRET')
	
	@classmethod
	def validate(cls):
		"""Проверяет, что все необходимые переменные окружения установлены"""
		required_vars = [
			'TELEGRAM_BOT_TOKEN',
			'OPENAI_API_KEY', 
			'OPENAI_ASSISTANT_ID',
			'WORKING_CHAT_ID',
			'LOGO_IMAGE_URL'
		]
		
		missing_vars = []
		for var in required_vars:
			if not getattr(cls, var):
				missing_vars.append(var)
		
		if missing_vars:
			raise ValueError(f"Отсутствуют обязательные переменные окружения: {', '.join(missing_vars)}")
		
		return True
