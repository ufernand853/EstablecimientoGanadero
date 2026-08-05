## Summary
- enable immediate self-service trial access during account registration
- auto-login new accounts into the app instead of blocking on billing webhooks
- surface active trial status and activation CTAs in dashboard and license views

## Testing
- `npm --workspace apps/web run build`

## Notes
- includes only application code changes
- does not modify `.env`, server-specific settings, deploy files, or infrastructure configuration
- backend runtime could not be exercised end-to-end locally because MongoDB at `127.0.0.1:27017` was unavailable
