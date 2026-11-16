# Backend configuration

## Local environment

Copy `.env.example` to `.env` in this directory and fill in the values for your
machine. `.env` files are ignored by Git; commit only the blank `.env.example`
template. The backend reads `AUTH_TOKEN_SECRET` for signing tokens. Keep all
backend secrets on the server and configure production values using your hosting
provider's environment-variable settings.

## Cloudinary meter photos

Meter photos are uploaded to Cloudinary as authenticated images. The database
stores the Cloudinary public ID; image requests are served by the backend only
to admin and superadmin accounts. Uploaded image filenames contain the vehicle
number, authenticated username, and UTC date/time.

Configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and
`CLOUDINARY_API_SECRET` in the backend environment. Set
`CLOUDINARY_METER_IMAGE_FOLDER` to choose the Cloudinary Media Library folder;
it defaults to `meter-photos`. See `.env.example`. Keep these credentials on
the server and do not expose them to the frontend.

Images previously stored in Google Drive are not migrated automatically; their
photos need to be uploaded again to become available from Cloudinary.

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
