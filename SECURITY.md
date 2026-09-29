# Security and privacy

Report vulnerabilities through the repository's private GitHub security advisory flow if enabled. If unavailable, open an issue asking for a private reporting channel without disclosing exploit details or secrets. Do not paste credentials or raw provider logs into public issues.

The adapter invokes a trusted local executable without a shell and sends prompt data through stdin. Configuration is administrator-controlled executable code: do not load an untrusted config or set `executableArgs` from model output. MCP task arguments cannot change executable, environment or permission flags.

Each delegate gets an independent clone of committed HEAD, with separate Git objects, index and configuration, no hardlinks, no origin remote and no automatic submodule initialization. This avoids ordinary collisions and shared-index corruption. It is **not an OS security boundary**: the CLI can still access other locations or configured MCP servers if its own permissions allow that. The source repository is never used as the agent process's working directory. Ask/review use fresh scratch directories. Review refuses a nonempty diff unless writable snapshot execution is explicitly accepted. There is no verified full read-only guarantee, including for `--mode plan`.

`--sandbox` is always requested; existing Antigravity permissions still apply. The bridge never passes permission bypass flags or changes Antigravity settings. The CLI itself may persist sessions, logs, caches and normal application state; users must review its own privacy and retention settings. Code and prompts go to the provider configured in Antigravity.

No adapter transcript logging is enabled. Results are held in bounded memory for the server session, and known secret-valued environment variables plus bearer/OAuth patterns are redacted. This is not a comprehensive secret scanner. Do not select secret files as context. Clone workspaces and CLI-owned logs may contain private data; inspect and delete exact owned directories when no longer needed. `forget` does not delete files. No telemetry is added by this project.

Cancellation uses a POSIX process group or Windows `taskkill /T /F`. If termination fails, new tasks are refused. A process that deliberately escapes its process group, or a Windows descendant orphaned before cancellation, is outside this containment mechanism. Abrupt host termination (SIGKILL, power loss) cannot run cleanup. For hostile code use an independently provisioned OS/container sandbox; do not treat this bridge as malware containment.

Source repositories may contain Antigravity instructions and executable build scripts. Review them before delegating. Tool output cannot authorize new access, changes to policy, installation, merging, pushing or publication. Review returned code and independently run appropriate checks before adopting it.
