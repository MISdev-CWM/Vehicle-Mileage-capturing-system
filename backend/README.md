# Backend configuration

## Local environment

Copy `.env.example` to `.env` in this directory and fill in the values for your
machine. `.env` files are ignored by Git; commit only the blank `.env.example`
template. The backend reads `AUTH_TOKEN_SECRET` for signing tokens. Keep all
backend secrets on the server and configure production values using your hosting
provider's environment-variable settings.

## Google Drive meter photos

Meter photos are uploaded to a private Google Drive folder. The database stores
the Drive file ID; image requests are served by the backend only to admin and
superadmin accounts. Uploaded image filenames contain the vehicle number,
authenticated username, and UTC date/time (for example,
`ABC-123_jane_doe_2026-11-10_09-19-52-622Z.jpg`).

1. Enable the Google Drive API in the Google Cloud project associated with the
   existing OAuth client.
2. Obtain a refresh token for the Google account that owns or has edit access
   to the private Drive folder. The OAuth grant must include the
   `https://www.googleapis.com/auth/drive` scope.
3. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `GOOGLE_DRIVE_REFRESH_TOKEN`, and `DRIVE_FOLDER_ID` in the backend
   environment. See `.env.example`. `GOOGLE_REDIRECT_URI` is optional and is
   only needed if it was part of the OAuth refresh-token flow.

Keep the Drive folder private. The backend returns a clear upload error if the
OAuth credentials are missing or the account cannot access the folder. Keep
OAuth secrets in the backend environment only; do not expose them to the
frontend or commit them to source control.

## Monthly mileage reminder emails

All users who own personal and company vehicles have to submit a mileage reading within the first two days of a month. If no reading has been submitted, the user gets a reminder email via Nodemailer. For this to work, SMTP needs to be configured.

Configure SMTP in the backend environment (`backend/.env`):

| Variable      | What it holds                                                                     | Example                                                                                 |
| ------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `SMTP_HOST`   | The address of the mail server that sends the email.                              | `smtp.gmail.com` (if you're using Gmail or Google Workspace)                            |
| `MAIL_FROM`   | The sender shown on the email                                                     | `janedoe@gmail.com`                                                                     |
| `APP_URL`     | The link to be put in the email.                                                  | `http://localhost:5173/`                                                                |
| `SMTP_USER`   | The account you log in with (often the full email address of the sending account) | `janedoe@gmail.com` (for Gmail, `MAIL_FROM` should use the same address as `SMTP_USER`) |
| `SMTP_PASS`   | That account's password (for Gmail, an app password)                              | `vowbwoojinxjozes`                                                                      |
| `SMTP_PORT`   | The port number on the mail server                                                | `587` (the default)                                                                     |
| `SMTP_SECURE` | Decides whether the connection is encrypted from the start, or uses STARTTLS      | `true` only on port 465, otherwise `false`                                              |
