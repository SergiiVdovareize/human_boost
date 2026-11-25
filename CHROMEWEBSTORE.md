# Chrome Web Store Listing — Human Boost

> Last Updated: 2026-10-17

## Store Listing

**Extension Name** [REQUIRED]
Human Boost

**Short Description** [REQUIRED]
An unofficial boost for teachers on human.ua — faster grades, statuses, and journal workflows.

**Detailed Description** [REQUIRED]
Human Boost — це розширення для оптимізації роботи вчителів та викладачів з електронним журналом платформи human.ua.

Основні можливості:

- Швидке копіювання оцінок: перенесення виставлених оцінок з поля «Завдання» в поле «Заняття» в один клік.
- Автоматичне виставлення оцінок: гнучке заповнення оцінок у заданому діапазоні (від мін. до макс.) та за обраним відсотком заповнення для обраних учнів.
- Імпорт оцінок із файлів: завантаження оцінок з файлів Excel (.xlsx, .xls) та CSV.
- Масове видалення оцінок: швидке очищення виставлених оцінок (всіх або певного бала) для вибраних учнів.
- Статистика та аналітика: наочний підрахунок кількості кожної оцінки в класі.
- Синхронізація дедлайнів: виставлення однакової дати здачі для всіх створених завдань у розкладі.
- Кастомні списки учнів: створення та збереження груп учнів безпосередньо у розширенні.

Як користуватися:

1. Перейдіть на сторінку журналу в human.ua для потрібного класу.
2. Натисніть на віджет плагіна у правому нижньому кутку екрана.
3. Оберіть необхідну дію в меню та підтвердіть виконання.

Конфіденційність:
Налаштування та статуси зберігаються в Chrome Storage. Опційно можлива синхронізація між пристроями через API розробника. Паролі human.ua не збираються. Деталі: privacy-policy.md.

Підтримка:
З будь-яких питань або пропозицій звертайтеся на сторінку Issues репозиторію проєкту.

**Category** [REQUIRED]
Productivity / Education

**Single Purpose** [REQUIRED]
Automates routine gradebook management and enhances productivity on the human.ua educational platform.

**Primary Language** [REQUIRED]
uk (українська)

## Graphics & Assets

| Asset                   | Dimensions          | Status       | Filename      |
| ----------------------- | ------------------- | ------------ | ------------- |
| Store Icon [REQUIRED]   | 128×128 PNG         | ✅ Ready     | icons/128.png |
| Extension Icon 16       | 16×16 PNG           | ✅ Ready     | icons/16.png  |
| Extension Icon 48       | 48×48 PNG           | ✅ Ready     | icons/48.png  |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | ⬜ To create |               |

## Permissions Justification

| Permission       | Type             | Justification                                                                                                                       |
| ---------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| storage                    | permissions      | Settings, student statuses, and lists in chrome.storage. |
| *://*.human.ua/*           | host_permissions | Content scripts and automations on human.ua. |
| https://api.vdovareize.me/* | host_permissions | Optional cross-device sync API. |

## Privacy & Data Use

### Data Collection

Processes gradebook/lesson page content in the active human.ua tab. Stores settings and teacher-defined student statuses in chrome.storage. Optional sync API may store the same under the teacher human.ua userId.

### Data Use Certification

- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's single purpose
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL**
https://github.com/SergiiVdovareize/human_boost/blob/main/privacy-policy.md

## Distribution

**Visibility**: Public
**Pricing**: Free

## Developer Info

**Support URL**: https://github.com/SergiiVdovareize/human_boost/issues
**Homepage URL**: https://github.com/SergiiVdovareize/human_boost

(Contact email for the Chrome Web Store publisher account is configured only in the Developer Dashboard, not in this repo.)

## Version History

| Version | Date       | Changes                                                                                     | Status |
| ------- | ---------- | ------------------------------------------------------------------------------------------- | ------ |
| 1.19.0  | 2026-11-25 | Human Boost listing for Chrome Web Store                                                  | Ready  |
