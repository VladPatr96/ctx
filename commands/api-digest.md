---
name: api-digest
description: Use when user asks for digest ("digest", "summary", "what's new") - fetches data via API and generates detailed analysis
---

# API Data Digest

Generate detailed digest from your API.

## API Access

Fetch data using curl (available in Git Bash):

```bash
# Replace with your values
API_URL="https://your-api.com"
RESOURCE_ID="123"
USER="your-username"
PASS="your-password"
LIMIT=400

curl -s -u "$USER:$PASS" "$API_URL/api/resource/$RESOURCE_ID/items?limit=$LIMIT"
```

For JSON parsing, pipe through jq:

```bash
curl -s -u "$USER:$PASS" "$API_URL/api/resource/$RESOURCE_ID/items?limit=$LIMIT" | jq '.'
```

## Output Format

Use this template:

```markdown
## Digest: [DATE_FROM] — [DATE_TO]
**[N] items**

### Main Topics
**1. [Topic]**
[Details, who discussed, conclusions]

### Notable Quotes
> "[quote]" — @username

### Useful Links
- [Name](URL) — description

### Open Questions
- [Unanswered question]

### Active Contributors
@username, @username, @username
```

## What to Extract

- **Topics**: tools, discussions, problems, recommendations
- **Quotes**: funny, insightful, emotional with @username
- **Links**: grep http/https in content
- **Questions**: unanswered
- **Contributors**: most active authors

## Analysis Guidelines

1. Be comprehensive — extract more detail than a typical summary
2. Preserve context — don't strip nuance from quotes
3. Identify patterns — group related discussions into topics
4. Note sentiment — flag heated debates or consensus moments
5. Extract value — prioritize actionable info over noise

## Language

Output in the same language as the source data.
