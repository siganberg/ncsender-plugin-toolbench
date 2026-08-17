Warning: no stdin data received in 3s, proceeding without it. If piping from a slow command, redirect stdin explicitly: < /dev/null to skip, or wait longer.
## What's Changed

### 🐛 Bug Fixes
- Planer now generates correct safe-Z moves when working in imperial units
- Planer respects the safe Z height configured in ncSender settings instead of using its own value
