# Contact form setup

The `/contact` page now contains a form. Submissions are sent server-side through Resend to `CONTACT_EMAIL`.

Environment variables:

```env
RESEND_API_KEY=
CONTACT_EMAIL=your-email@example.com
RESEND_FROM_EMAIL=Warreeni <onboarding@resend.dev>
```

For production, use a `RESEND_FROM_EMAIL` address on a domain verified in Resend. The API key stays server-side and is never exposed as `NEXT_PUBLIC_*`.
