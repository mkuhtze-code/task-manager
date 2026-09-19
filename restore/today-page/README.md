# Restore Today (`app/page.tsx`)

The full page (with `lib/today` extraction applied) is split across `part0.txt`…`part4.txt` so it can be recovered without relying on a single oversized API write.

```bash
cd /path/to/task-manager
cat restore/today-page/part*.txt > app/page.tsx
git add app/page.tsx
git commit -m "Restore full Today page"
git push
```

Or from history before the truncate:

```bash
git checkout a00c02ff -- app/page.tsx
```

Then optionally re-apply the extraction imports from `lib/today/geolocation.ts` and `lib/today/constants.ts`.
