# antigravity-plugin-codex

Передавайте задачи из локального Codex агентному CLI Antigravity (`agy`) и получайте ответ, статус и изменения для проверки. Codex остаётся координатором.

[English](README.md) · [Проверенная совместимость](docs/compatibility.md) · [Архитектура](docs/architecture.md) · [Безопасность](SECURITY.md)

В проект входят Codex plugin/skill, Node.js-адаптер без runtime-зависимостей и локальный MCP stdio-сервер. Используется штатная авторизация Antigravity. Облачного сервера, веб-интерфейса и собственной системы ключей нет.

## Что проверено

Windows, Codex CLI **0.155.1**, Antigravity **1.2.13**, Node **26.5.0**: настоящий путь `Codex → MCP → agy → result` вернул `AGY_CODEX_E2E_OK`, состояние `succeeded`, exit code `0`. Это проверка простого запроса; она не подтверждает все модели и сценарии редактирования. Ошибки, лимиты, изоляция и отмена покрыты воспроизводимыми fake-тестами.

## Установка

Нужны Node.js **22+**, Git, локальный Codex с командой `plugin add` и авторизованный Antigravity CLI. Установите его по [официальной инструкции Google](https://www.antigravity.google/docs/cli/install/), при необходимости один раз запустите `agy` в терминале для входа. Проект не устанавливает CLI автоматически и не меняет его настройки.

```powershell
git clone https://github.com/irrumi/antigravity-plugin-codex.git
cd antigravity-plugin-codex
npm.cmd ci --ignore-scripts
npm.cmd run check
npm.cmd test
node plugins/antigravity-plugin-codex/src/cli.mjs doctor
codex.cmd plugin marketplace add .
codex.cmd plugin add antigravity-plugin-codex@antigravity-local
codex.cmd mcp list
```

Для Linux/macOS команды называются `npm` и `codex`. Стандартный пользовательский каталог `agy` определяется автоматически, затем используется PATH. IDE launcher не считается агентным CLI.

Откройте новый чат Codex, разрешите нужные MCP-вызовы по своей обычной политике и напишите:

> Попроси Antigravity объяснить, что такое Git worktree. Не используй инструменты и не меняй файлы.

> Передай Antigravity задачу: исправить обработку пустого ввода. Рабочий каталог — C:/projects/example.

> Получи второе мнение Antigravity по этим двум файлам.

Это обычные запросы, а не новые slash-команды Codex. Skill `antigravity` также доступен через выбор навыков. Установка использует штатные команды Codex и не заменяет пользовательский конфиг целиком. Тестовая установка проверялась в отдельном `CODEX_HOME`; для обычной работы менять его не нужно.

## Возможности

| Инструмент MCP | Действие |
| --- | --- |
| `antigravity_doctor` | Проверяет executable, версию и help. `probeAuth: true` делает настоящий платный в рамках вашего тарифа запрос. |
| `antigravity_ask` | Запрос в новом временном каталоге. |
| `antigravity_delegate` | Задача в независимой Git-копии committed HEAD. |
| `antigravity_review` | Проверка staged/unstaged diff или относительно base. |
| `antigravity_status` / `result` | Статус и структурированный результат по task ID. |
| `antigravity_cancel` | Запрос завершения дерева процессов. Нужно дождаться конечного статуса. |
| `antigravity_forget` | Удаляет завершённый результат из памяти, сохраняя рабочие файлы. |

Для каждой задачи нужен явный абсолютный `cwd`. Старт возвращает ID, последующие вызовы принимают `taskId`. ID действуют только в текущем процессе MCP. После его перезапуска метаданные теряются, рабочие каталоги сохраняются.

Пример входа для delegate:

```json
{
  "cwd": "C:/projects/example",
  "prompt": "Исправь обработку пустого ввода и запусти соответствующие тесты.",
  "contextFiles": ["src/parser.ts"],
  "timeoutMs": 120000
}
```

В копию попадает только committed HEAD. Незакоммиченные, staged и untracked изменения исходного репозитория не копируются и сохраняются нетронутыми. `contextFiles` передаются текстом, а не накладываются поверх файлов копии. Результат содержит diff отслеживаемых файлов и отдельный список новых untracked файлов; их содержимое остаётся в возвращённом каталоге. Автоматического применения, merge, push или публикации нет. Отчёты о проверках от Antigravity нужно независимо проверять.

### Ограничение review

Подтверждённого полного запрета записи у проверенного CLI нет. Поэтому непустой diff по умолчанию возвращает `READ_ONLY_UNAVAILABLE`. Режим plan не считается гарантией безопасности.

Если вы явно согласны на проверку во **временном каталоге с возможностью записи**, используйте:

```json
{"cwd":"C:/projects/example","mode":"staged","allowSnapshotWrites":true}
```

Diff передаётся текстом; исходный репозиторий не используется как рабочая директория агента. Это предотвращает обычные конфликты, но не изолирует злонамеренный процесс средствами ОС. Для сравнения с веткой: `mode: "base", base: "main"` — это `git diff main`, не merge-base. Пустой diff возвращает `no_changes` без запуска CLI.

## Настройки и прямой запуск

По умолчанию: 5 минут, 1 MiB входа, 1 MiB общего stdout/stderr, 2 одновременные задачи, 100 сохранённых результатов. Пример: [examples/config.json](examples/config.json). Передайте абсолютный путь через `AGY_CODEX_CONFIG` окружения Codex или `--config FILE` адаптера. Не записывайте секреты в JSON. Windows `.cmd/.bat/.ps1` не запускаются: укажите настоящий `.exe` или `node` с абсолютным JS entrypoint в `executableArgs`.

`model` передаётся только через обнаруженный `--model`; таблицы псевдонимов и подмены глобальных настроек нет. Авторизация считается подтверждённой лишь после настоящего ответа, не по существованию папки. `--sandbox` всегда включён, обход разрешений не применяется. Интерактивные запросы авторизации останавливаются и сообщаются как ошибка.

```powershell
node plugins/antigravity-plugin-codex/src/cli.mjs doctor --probe-auth
node plugins/antigravity-plugin-codex/src/cli.mjs ask --request request.json
node plugins/antigravity-plugin-codex/src/cli.mjs delegate --request request.json
node plugins/antigravity-plugin-codex/src/cli.mjs review --request review.json
```

Прямой CLI синхронный; длительные задачи с ID обслуживает MCP. Успех требует финального `SUCCESS` и exit 0. Запрет инструментов, ошибочный формат, тайм-аут или переполнение вывода не превращаются в успех. Автоматических повторов нет.

Если версия Codex не поддерживает plugin add, подключите MCP отдельно:

```powershell
codex.cmd mcp add antigravity -- node C:/absolute/repo/plugins/antigravity-plugin-codex/src/cli.mjs serve
```

Для своего конфига добавьте `--config C:/absolute/config.json` после `serve`. Не подключайте этот вариант одновременно с одноимённым сервером плагина. Skill можно отдельно скопировать в `.agents/skills/antigravity/SKILL.md` проекта, только если такого файла ещё нет, либо обращаться к MCP напрямую.

## Обновление и удаление

Сначала завершите или отмените активные задачи. Сохраните каталог исходников: локальный marketplace ссылается на него.

```powershell
git pull --ff-only
npm.cmd ci --ignore-scripts
npm.cmd run check
npm.cmd test
codex.cmd plugin remove antigravity-plugin-codex@antigravity-local
codex.cmd plugin add antigravity-plugin-codex@antigravity-local
```

Откройте новый чат. Для Git-backed marketplace сначала выполните `codex.cmd plugin marketplace upgrade antigravity-local`. Изменения исходников сами не обновляют установленную копию.

Удаление:

```powershell
codex.cmd plugin remove antigravity-plugin-codex@antigravity-local
codex.cmd plugin marketplace remove antigravity-local
```

Если подключали только MCP: `codex.cmd mcp remove antigravity`. Удаляйте только собственную копию skill. Antigravity, его авторизация и рабочие каталоги не удаляются. После проверки сохраните нужные изменения и удалите только точные каталоги `agy-codex-*` из результатов; не очищайте весь temp.

## Проверки и границы поддержки

`npm.cmd run check` и `npm.cmd test` не обращаются к провайдерам. `node scripts/codex-smoke.mjs` — отдельная настоящая проверка, использующая ваши аккаунты и квоту. Она сохраняет read-only shell sandbox Codex и разрешает только ask/status/result на один запуск. В Windows при нестандартной установке укажите `CODEX_EXECUTABLE` — путь к настоящему `codex.exe`.

Проверены Windows и локальный Codex CLI. Linux/macOS предусмотрены в CI, но здесь не запускались. WSL требует установки обоих CLI внутри WSL. Интерфейс Codex app не проверялся, хотя локальные MCP поддерживаются. Облачный Codex не получает доступ к вашему компьютеру автоматически. Изоляция копии не является защитой от вредоносного кода; дерево процессов, намеренно отделившееся от родителя, выходит за пределы механизма отмены. Подробности: [SECURITY.md](SECURITY.md).

Лицензия MIT. Источник идеи: [simplybychris/antigravity-plugin-cc](https://github.com/simplybychris/antigravity-plugin-cc). Код адаптера написан независимо; [attribution](NOTICE.md).
