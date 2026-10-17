# Pitfall registry

The authoritative source is this file. Rule: a bug that happens **twice** must
ship with a guard, and a guard is a check that fails when the bug comes back.
Validate with `npm run guard`; run every guard with `npm run guard:run`.

## 守卫命令 / Guard commands

| 命令 | 覆盖 |
|---|---|
| `npm test` | every tool's unit tests |
| `npm run build` | the two algorithm packages compile |

## Tools

| ID | 症状 | 根因 | 规则 | 守卫 | 来源 |
|---|---|---|---|---|---|
| TOOL-01 | 校验器把 `manual` 当成可执行命令，报「未知命令 manual」 | 守卫单元格里写的是 `` `manual` ``，被当成反引号命令去命令表里查 | `manual` 守卫没有可执行命令，不参与命令校验 | `✅` `npm test`（`pitfall-guardrails/test/registry.test.mjs`） | 本次 |
| TOOL-02 | 明确列进 skipDirs 的顶层目录仍被扫描 | walk 只对子目录做跳过判断，没有判断传进来的顶层目录 | 顶层目录也要过 skipDirs | `✅` `npm test`（`compliance-kit/test/compliance.test.mjs`） | 本次 |
| TOOL-03 | 在 Windows 上 `node --test <目录>` 把目录当入口，报 MODULE_NOT_FOUND | Node 的测试运行器按路径解析，不总是展开目录 | 传具体测试文件，或在仓库根直接跑 `npm test`（自动发现） | `manual`：跑测试时按此执行 | 本次 |
