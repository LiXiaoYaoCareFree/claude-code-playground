# 将 `bun dist/cli.js` 配置为本地全局命令（`myclaude`）指南

## 目标

让团队成员在各自电脑上都可以直接执行：

```bash
myclaude --version
myclaude
```

并且在任意项目目录都可用。

## 适用前提

- 已安装 Bun（`bun --version` 可用）
- 本机已有本项目源码，并能访问：

```text
<你的项目路径>/dist/cli.js
```

- `dist/cli.js` 第一行是 Bun shebang：

```text
#!/usr/bin/env bun
```

## 推荐方案（macOS / Linux）

### 1) 创建全局命令脚本

先把 `<PROJECT_DIR>` 替换成你自己的项目绝对路径。

```bash
mkdir -p "$HOME/.local/bin"
cat > "$HOME/.local/bin/myclaude" <<'EOF'
#!/usr/bin/env bash
exec bun <PROJECT_DIR>/dist/cli.js "$@"
EOF
chmod +x "$HOME/.local/bin/myclaude"
```

示例：

```bash
exec bun /Users/alice/work/claude-code-playground/dist/cli.js "$@"
```

### 2) 将 `~/.local/bin` 加入 PATH

如果你使用 zsh：

```bash
grep -q 'export PATH="$HOME/.local/bin:$PATH"' ~/.zshrc || \
printf '\nexport PATH="$HOME/.local/bin:$PATH"\n' >> ~/.zshrc
source ~/.zshrc
```

如果你使用 bash：

```bash
grep -q 'export PATH="$HOME/.local/bin:$PATH"' ~/.bashrc || \
printf '\nexport PATH="$HOME/.local/bin:$PATH"\n' >> ~/.bashrc
source ~/.bashrc
```

### 3) 验证

```bash
which myclaude
myclaude --version
cd /tmp && myclaude --version
```

预期：

- `which myclaude` 指向 `~/.local/bin/myclaude`
- 版本号正常输出
- 在其他目录（如 `/tmp`）也能执行

## Windows 方案（PowerShell）

### 1) 创建命令脚本

将 `<PROJECT_DIR>` 改为自己的路径，例如 `D:\work\claude-code-playground`。

```powershell
New-Item -ItemType Directory -Force "$HOME\bin" | Out-Null
@'
@echo off
bun <PROJECT_DIR>\dist\cli.js %*
'@ | Set-Content -Encoding ASCII "$HOME\bin\myclaude.cmd"
```

### 2) 配置 PATH

将 `%USERPROFILE%\bin` 添加到用户级 PATH，然后重开终端。

### 3) 验证

```powershell
where myclaude
myclaude --version
```

## 团队统一建议

- 统一命令名：`myclaude`
- 脚本统一放在：
  - macOS/Linux: `~/.local/bin/myclaude`
  - Windows: `%USERPROFILE%\bin\myclaude.cmd`
- 在团队 README 里固定一段“本地命令初始化”步骤，便于新成员一键配置

## 常见问题

### 1) `myclaude: command not found`

- 检查 `~/.local/bin` 是否在 PATH
- 重新打开终端或执行 `source ~/.zshrc`
- 确认脚本有执行权限：`chmod +x ~/.local/bin/myclaude`

### 2) `bun: command not found`

- 说明 Bun 没装好或不在 PATH
- 先修复 Bun，再执行 `myclaude`

### 3) 移动了项目目录后命令失效

- 因为脚本里写的是绝对路径
- 更新 `myclaude` 脚本中的 `<PROJECT_DIR>` 为新路径即可

## 卸载方式

macOS / Linux：

```bash
rm -f "$HOME/.local/bin/myclaude"
```

Windows：

```powershell
Remove-Item "$HOME\bin\myclaude.cmd"
```
