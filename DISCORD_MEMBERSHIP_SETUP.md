# Bull & Bear Discord Membership Setup

This website can activate the Discord `VIP Member` role after a paid subscription.

## Discord Server Setup

1. Create a Discord role named `VIP Member`.
2. Put the Bull & Bear bot role above `VIP Member` in the Discord role list.
3. Give the bot `Manage Roles` permission.
4. Set premium channels so only `VIP Member` can view them.
5. Keep free channels open for normal members.

## Discord Developer Portal

Create or open the Bull & Bear Discord application and add these redirect URLs:

```text
https://staging.bullandbear.az/api/auth/oauth/discord/callback
https://bullandbear.az/api/auth/oauth/discord/callback
```

Copy these values into Render environment variables:

```text
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_BOT_TOKEN=
DISCORD_GUILD_ID=
DISCORD_PREMIUM_ROLE_ID=
DISCORD_AUTO_JOIN=true
```

`DISCORD_PREMIUM_ROLE_ID` must be the ID of the `VIP Member` role.

## Website Flow

1. User buys `AI + Premium Discord Signals`.
2. Payriff/ePoint webhook confirms payment.
3. Backend marks the subscription active and sets `paid_until`.
4. User connects Discord from the dashboard.
5. Bot gives the `VIP Member` role.
6. Daily cleanup removes only the `VIP Member` role after expiry or failed payment.

The bot does not delete or kick users from the Discord server.
