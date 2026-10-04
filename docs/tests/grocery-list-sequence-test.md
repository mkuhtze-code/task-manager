# Persistent Collections — test record

File: `lib/collections/__tests__/collections.test.ts`

| Scenario | Covered |
|----------|--------|
| A Basic grocery create + append | Yes |
| B Multi-capture continuation | Yes |
| C Resume by name | Yes |
| D Active implicit | Yes |
| E Ambiguity | Yes |
| F Site snag | Yes |
| G Completion | Yes |
| H Remove | Yes |
| I Reopen no duplicate | Yes |
| Duplicate + client_op_id | Yes |
| Active hard TTL | Yes |

```bash
npx vitest run lib/collections
```
