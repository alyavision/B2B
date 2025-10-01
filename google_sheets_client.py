import json
import base64
import logging
from typing import Optional, List

import gspread  # type: ignore[reportMissingImports]
from google.oauth2.service_account import Credentials  # type: ignore[reportMissingImports]

from config import Config

logger = logging.getLogger(__name__)


def _load_credentials_from_env() -> Optional[Credentials]:
    data = Config.GOOGLE_SHEETS_CREDENTIALS
    if not data:
        return None
    try:
        # Поддержка base64 и сырой JSON строки
        try:
            decoded = base64.b64decode(data).decode('utf-8')
            info = json.loads(decoded)
        except Exception:
            info = json.loads(data)
        scopes = [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive.readonly'
        ]
        return Credentials.from_service_account_info(info, scopes=scopes)
    except Exception as e:
        logger.error(f"Sheets: не удалось распарсить креды: {e}")
        return None


def append_lead_row(values: List[str]) -> bool:
    """Добавляет строку лида в лист. values должны соответствовать порядку колонок.
    Возвращает True при успехе.
    """
    try:
        creds = _load_credentials_from_env()
        if not creds:
            logger.warning("Sheets: креды не заданы — пропускаем запись")
            return False
        client = gspread.authorize(creds)
        sh = client.open_by_key(Config.GOOGLE_SHEETS_SPREADSHEET_ID)
        ws = sh.worksheet(Config.GOOGLE_SHEETS_SHEET_NAME)
        ws.append_row(values, value_input_option='USER_ENTERED')
        logger.info("Sheets: строка добавлена")
        return True
    except Exception as e:
        logger.error(f"Sheets: ошибка записи: {e}")
        return False


