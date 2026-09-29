# antigravity-plugin-codex

Вызывайте Antigravity из локального чата Codex: получите второе мнение, ревью diff или результат отдельной задачи, оставаясь в одном чате. Плагин связывает Codex с Antigravity CLI (`agy`); изменения кода возвращаются для вашей проверки.

[English](README.md) · [Проверенная совместимость](docs/compatibility.md) · [Архитектура](docs/architecture.md) · [Безопасность](SECURITY.md)

## Быстрый старт

Нужны Node.js **22+**, Git, локальный Codex с поддержкой плагинов и [установленный Antigravity CLI](https://www.antigravity.google/docs/cli/install/) со входом в аккаунт. Плагин устанавливается из исходников; релиза npm пока нет.

```powershell
git clone https://github.com/irrumi/antigravity-plugin-codex.git
cd antigravity-plugin-codex
codex.cmd plugin marketplace add .
codex.cmd plugin add antigravity-plugin-codex@antigravity-local
node plugins/antigravity-plugin-codex/src/cli.mjs doctor
```

Для Linux/macOS используйте `codex` вместо `codex.cmd`. В PowerShell при необходимости сначала войдите через интерактивный запуск `agy`. Команда `doctor` проверяет наличие CLI, но без `--probe-auth` не проверяет авторизацию.

Откройте новый чат Codex, разрешите нужные MCP-вызовы по своей обычной политике и напишите:

> Попроси Antigravity объяснить, что такое Git worktree. Не используй инструменты и не меняй файлы.

Codex запустит локальную задачу Antigravity и вернёт ответ в чат. В реальной проверке путь `Codex → MCP → agy → result` завершился состоянием `succeeded`, кодом `0` и запрошенным ответом `AGY_CODEX_E2E_OK`.

## Зачем использовать

Когда нужен взгляд второго агента, обычно приходится переносить контекст в другой CLI и вручную сопоставлять ответы или изменения. Этот плагин делает запрос из чата Codex, запускает Antigravity в отдельном каталоге и возвращает результат. Codex остаётся координатором; изменения не применяются автоматически.

Если встроенные субагенты доступны, skill запускает Antigravity через видимого субагента Codex. Внешний `agy` остаётся отдельным процессом. Это обычные запросы к skill, а не новые slash-команды.

В проект входят Codex plugin/skill, Node.js-адаптер без runtime-зависимостей и локальный MCP stdio-сервер. Используется штатная авторизация Antigravity. Облачного сервера, веб-интерфейса и собственной системы ключей нет. Подробности по платформам и проверкам — в [документе совместимости](docs/compatibility.md).

Для разработки: `npm.cmd ci --ignore-scripts`, затем `npm.cmd run check` и `npm.cmd test`. См. [CONTRIBUTING.md](CONTRIBUTING.md).

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

## Работа через видимого субагента

Встроенный skill по умолчанию задаёт такую связку:

`Координатор Codex → встроенный субагент Codex → Antigravity MCP/CLI → результат → независимая проверка`

Пример запроса: **«Запусти Antigravity через субагента Codex для ревью этих двух файлов. Дождись результата и проверь замечания».** В клиентах с поддержкой субагентов появится запись о работе посредника Codex. Внешний процесс `agy` не становится встроенным агентом или выбираемой моделью Codex.

Координатор создаёт одного субагента и передаёт задачу, абсолютный путь проекта, выбранный контекст, разрешения и лимиты. Субагент читает skill, вызывает Antigravity, ждёт конечного результата и проверяет выводы. Ещё одного посредника он не создаёт. MCP task ID принадлежат его сессии, поэтому запрос отмены также передаётся этому субагенту. Большое ревью делится на ограниченные части с явным указанием охваченных файлов.

Если субагенты недоступны или вы просите прямой запуск, задача выполняется в текущем агенте без отдельной карточки. Прямой вызов MCP/CLI сам по себе не создаёт субагента. Это инструкция skill, а не новый MCP-инструмент; требования изоляции, разрешений и согласия на review сохраняются. Для загрузки новой инструкции переустановите обновлённый плагин и откройте новый чат — см. [Обновление и удаление](#обновление-и-удаление).

Связка проверена в Windows-чате Codex app: встроенный субагент вызвал bundled CLI для небольшого ревью, получил `succeeded` / exit `0` и независимо воспроизвёл замечание. [Подробности и ограничения проверки](docs/compatibility.md).

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

Проверены Windows, локальный Codex CLI и небольшое ревью через встроенного субагента Codex app → Antigravity CLI. CI сейчас запускается на Ubuntu с Node 22 и 24; проверки Windows/macOS приостановлены после известной ошибки сравнения путей в тесте. Точные границы проверки и оставшиеся замечания к адаптеру — в [compatibility](docs/compatibility.md). Интерфейс Linux/macOS не проверялся. WSL требует установки обоих CLI внутри WSL. Облачный Codex не получает доступ к вашему компьютеру автоматически. Изоляция копии не является защитой от вредоносного кода; дерево процессов, намеренно отделившееся от родителя, выходит за пределы механизма отмены. Подробности: [SECURITY.md](SECURITY.md).

Лицензия MIT. Источник идеи: [simplybychris/antigravity-plugin-cc](https://github.com/simplybychris/antigravity-plugin-cc). Код адаптера написан независимо; [attribution](NOTICE.md).
