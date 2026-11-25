# Backend Sync — Human Boost

Опційна синхронізація налаштувань і статусів учнів між пристроями вчителя (різні Google-профілі Chrome). Клієнт: `src/utils/serverSync.ts` + `src/utils/syncStorage.ts` (`StoredExtensionData`).

## Дані

JSON під ключем Human `userId` (числовий id з human.ua):

```ts
{
  studentStatuses?: Record<classId, Record<studentId, 'standard' | 'withdrawn' | 'family' | 'abroad'>>
  settings?: {
    showStudentStatuses?: boolean
    highlightAbsentForInactive?: boolean
    highlightMandatoryWorks?: boolean
    highlightGradeMismatch?: boolean
    highlightVideoConference?: boolean
    highlightUnpublishedLessons?: boolean
  }
  // інші поля chrome.storage (наприклад isPanelOpen) можуть потрапляти в payload
}
```

Паролі та облікові дані human.ua **не** синхронізуються.

## API

Базовий шлях: `{VITE_SYNC_API_URL}/:userId`  
Прод-приклад URL у `.env.example`: `https://api.vdovareize.me/human`

| Метод | Призначення | Тіло |
| --- | --- | --- |
| `GET` | Завантажити дані | — |
| `POST` | Зберегти (debounce ~1.5 с) | `{ data, clientUpdatedAt }` |
| `OPTIONS` | CORS preflight | — |

### Заголовки
- `Origin: https://*.human.ua` (браузер)
- `x-sync-secret: <SYNC_SECRET>`
- `Content-Type: application/json` (для POST)

### Відповіді
- `GET` 200: `{ userId, data, updatedAt }` (`data: {}`, `updatedAt: null` якщо порожньо)
- `POST` 200: `{ success: true, updatedAt }`
- `401` — невірний secret; `403` — Origin не з human.ua

### CORS
- `Access-Control-Allow-Origin`: дзеркало валідного Origin
- `Access-Control-Allow-Headers`: `Content-Type, x-sync-secret`
- `Access-Control-Allow-Methods`: `GET, POST, OPTIONS`

## Сховище (приклад)

```sql
CREATE TABLE human_boost_sync (
  user_id VARCHAR(64) PRIMARY KEY,
  data JSON NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Клієнт

`.env.local` (не в git):

```env
VITE_SYNC_API_URL=https://api.vdovareize.me/human
VITE_SYNC_SECRET=your_secret_key_here
```

Після `npm run build` значення потрапляють у бандл. Shared secret у розширенні **не є сильною захистом** — на бекенді обовʼязкові Origin-check, rate limit і ротація ключа за потреби.

Якщо змінні порожні — remote sync вимкнений; лишається лише `chrome.storage.local` / `sync`.
