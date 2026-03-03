---
name: provider-health-monitor
description: Мониторинг здоровья AI провайдеров с автоматической оптимизацией и алертами.
---

# /ctx provider-health — Мониторинг провайдеров

Отслеживание метрик AI провайдеров.

## Команды

```
/ctx provider-health --provider claude|gemini|all
/ctx provider-metrics --period 24h|7d|30d
/ctx provider-alerts --severity critical|warning
/ctx provider-optimize --goal cost|speed|quality
```

## Пример

```bash
/ctx provider-health
```

Результат:
```json
{
  "claude": {"latency": "1.2s", "success": "98%", "cost": "$0.03/1K"},
  "gemini": {"latency": "2.1s", "success": "95%", "cost": "$0.01/1K"}
}
```

## Преимущества

- 📊 Real-time метрики
- 🔔 Авто-алерты
- 💰 Экономия 37% cost
