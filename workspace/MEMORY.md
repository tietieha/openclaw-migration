# MEMORY.md - 你的长期记忆

每次醒来都会读这个文件。惜字如金，只留真正重要的。

## 索引

> `memory/` 下的文件索引。新建文件时在此添加条目。需要详情时再读取对应文件。

- YYYY-MM-DD.md: 每日日志
- learnings/：自我改进日志
  - LEARNINGS.md: 教训和发现（纠正、知识盲区、最佳实践）
  - ERRORS.md: 操作失败和异常记录
  - FEATURE_REQUESTS.md: 用户请求的缺失能力

## 用户画像

（在对话中逐步了解，在此记录。）

## 事件日志

- 2026-10-20：用户已要求停用无实际产出的 `heartbeat-main`；应保持禁用，除非用户另行要求恢复。<!-- project: github.com/tietieha/openclaw-migration -->
- 2026-10-22：`AI 网关客户端 Key 每日用量汇总` 自动化已按用户要求调整为每日 09:45（Asia/Shanghai）执行；日报飞书机器人 Webhook 卡片发送曾间歇性遭遇 `frequency limited` / `internal error`，但手动触发成功。<!-- project: github.com/tietieha/openclaw-migration -->

## 记忆

> 沉淀过的认知。决策、教训、重要偏好、关键上下文。memory/ 是笔记，这里是定稿。

- AI 网关额度日报使用独立的飞书机器人 Webhook 卡片链路，不等同于 OpenClaw 的飞书会话消息；异常应按机器人接口的频控/短暂故障处理。脚本 `automation/ai-gateway-daily-report.mjs` 目前只对 `frequency limited` 重试（0、2、5 秒）。<!-- project: github.com/tietieha/openclaw-migration -->
- OpenClaw 飞书会话渠道与上述日报 Webhook 相互独立；当前飞书插件/渠道被禁用，导致 `Unsupported channel: feishu`，与停用 Heartbeat 无关。恢复该渠道需要显式启用/安装适配器与重新连接。<!-- project: github.com/tietieha/openclaw-migration -->
