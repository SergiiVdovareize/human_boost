# AGENTS.md — Інструкції та контекст для AI-агентів

## 1. Про проєкт

- **Назва:** Human Boost (Chrome Extension Manifest V3).
- **Призначення:** Автоматизація та підсвічування на [human.ua](https://human.ua) (журнал, розклад, перевірка робіт, статуси учнів).
- **Стек:** React 19, TypeScript, Vite 7, Zustand 5, SCSS, Lucide Icons.

---

## 2. Критичні правила розробки (Strict Rules)

1. **Обов'язковий `npm run build` після змін:**
   - Після внесення будь-яких змін у код обов'язково запускай `npm run build` для оновлення `dist/` та валідації типів TypeScript.

2. **Заборона автоматичних комітів та пушів:**
   - НІКОЛИ не викликай `git commit` чи `git push` автоматично. Роби це **виключно за прямим запитом користувача**.

3. **Manifest V3 та Chrome API:**
   - Тільки `async/await` (жодних `.then()` чейнів).
   - Жодного `eval()` або інлайн-скриптів.
   - Дані персистяться в `chrome.storage` під legacy-ключем `humanAutomator` (не перейменовувати).
   - Усі файли іконок та ресурсів з `manifest.json` мають фізично існувати з точними розмірами.

4. **Взаємодія з DOM `human.ua`:**
   - **Затримки обов'язкові:** Використовуй константи `TIMING` (`src/constants/config.ts`) при кліках та введенні оцінок, щоб не перевантажувати платформу.
   - **Захист відсутності («Н»):** Перед зміною комірки перевіряти `cellAbsent(cell)` — комірки з «Н» чіпати заборонено.
   - Скрол до активної комірки: `cell.scrollIntoView({ behavior: 'smooth', block: 'center' })`.

5. **UI та локалізація:**
   - Мова інтерфейсу — **українська** (`uk`).
   - Плаваюча кнопка відкриття (`#human-automator svg`) має фіксований розмір `48x48px`.

6. **Безпека на продакшені (Суворий Read-Only режим при тестуванні):**
   - При тестуванні та дебагінгу на живому сайті `human.ua` **КАТЕГОРИЧНО ЗАБОРОНЕНО** вносити зміни, вводити оцінки в поля, змінювати дедлайни чи відправляти форми.
   - Дозволено **ВИКЛЮЧНО ЧИТАННЯ ДАНИХ (Read-Only)** та інспекція DOM.
   - Це реальний продакшен з бойовими даними, справжніми класами та живими учнями!

---

## 3. Архітектурна карта

- `src/content.tsx` — точка входу content-script: створює `#human-automator`, завантажує `icons/logo.svg` і монтує React-додаток у DOM.
- `src/App.tsx` — головний бічний слайдер (SidePanel): автоматизація дій та глобальні налаштування.
- `src/stores/` — модульні Zustand-стори:
  - `useSettingsStore`: перемикачі підсвічувань і статусів.
  - `useStudentStatusesStore`: статуси учнів (`standard`, `withdrawn`, `family`, `abroad`).
  - `useMandatoryGradeModalStore`: модалка оцінок обовʼязкових робіт.
  - `useModalStore`: бічна панель.
- `src/utils/gradebook.ts` / `gradebookAutomation.ts` / `mandatoryGradeAutomation.ts` — журнал і оцінки.
- `src/utils/studentStatusDOM.ts` — бейджі статусів, mismatch «Заняття»/«Завдання», today-dot.
- `src/utils/lessonHomeworkReview.ts` — кнопка «Не видно роботи».
- `src/utils/syncStorage.ts` — `getStoredExtensionData` / `updateStoredExtensionData` (ключ `humanAutomator`).
- `src/utils/serverSync.ts` — опційний remote sync (`VITE_SYNC_API_URL` / `VITE_SYNC_SECRET`).
- Тип payload: `StoredExtensionData` у `src/types`.
- Специфікація API: `BACKEND_SYNC_SPEC.md`.

---

## 4. Команди

- `npm run build` — збірка в `dist/`.
- `npm run pack:store` — збірка + ZIP для Chrome Web Store (без `key` у manifest).
- `npm run watch:build` — збірка зі спостереженням за файлами.
- `npm run check` — Biome (lint + format + organize imports).
- `npm run bump` — підняти версію та CHANGELOG.
