# CRITICAL DEPLOYMENT RULES

⚠️ **READ THIS BEFORE ANY DEPLOYMENT** ⚠️

## Deployment Environment

**ALL deployments MUST go to PRODUCTION environment.**

```bash
# CORRECT - Always use this:
forge deploy --environment production --no-verify

# WRONG - Never use development:
forge deploy --environment development  # ❌ NEVER DO THIS
forge deploy                             # ❌ Defaults to development
```

## Why Production Only?

- Development environment is not connected to the live Confluence instance
- Users cannot see changes deployed to development
- All testing happens in production with live users

## Deployment Checklist

Before every `forge deploy`:
1. ✅ Verify command includes `--environment production`
2. ✅ Run `forge deploy --environment production --no-verify`
3. ✅ Wait for deployment to complete
4. ✅ Ask user to hard refresh (Cmd+Shift+R) to clear cache
5. ✅ Verify changes in browser

## Common Mistakes to Avoid

- ❌ Deploying to development by default
- ❌ Forgetting `--environment production` flag
- ❌ Assuming user's browser will auto-update (requires hard refresh)
- ❌ Not verifying which environment is active before testing
