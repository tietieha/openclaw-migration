# OpenClaw Windows 迁移包

## 使用步骤

1. **复制配置文件**
   将 `openclaw.json` 复制到：
   `C:\Users\你的用户名\.openclaw\openclaw.json`

2. **复制工作空间**
   将 `workspace\` 目录整个复制到：
   `C:\openclaw\workspace\`

3. **启动 Gateway**
   ```powershell
   openclaw gateway start
   ```

4. **验证连接**
   浏览器打开 http://127.0.0.1:18789

完成！飞书里发消息就能用了。
