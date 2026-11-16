const { google } = require('googleapis');
const { Readable } = require('stream');

const getDriveClient = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  const folderId = process.env.DRIVE_FOLDER_ID;
  const missingConfiguration = [
    !clientId && 'GOOGLE_CLIENT_ID',
    !clientSecret && 'GOOGLE_CLIENT_SECRET',
    !refreshToken && 'GOOGLE_DRIVE_REFRESH_TOKEN',
    !folderId && 'DRIVE_FOLDER_ID'
  ].filter(Boolean);

  if (missingConfiguration.length) {
    throw new Error(`Google Drive configuration is missing: ${missingConfiguration.join(', ')}`);
  }

  const auth = new google.auth.OAuth2(
    clientId,
    clientSecret,
    process.env.GOOGLE_REDIRECT_URI
  );
  auth.setCredentials({ refresh_token: refreshToken });

  return google.drive({ version: 'v3', auth });
};

const uploadMeterPhoto = async ({ buffer, contentType, fileName }) => {
  const drive = getDriveClient();
  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      mimeType: contentType,
      parents: [process.env.DRIVE_FOLDER_ID]
    },
    media: {
      mimeType: contentType,
      body: Readable.from([buffer])
    },
    fields: 'id',
    supportsAllDrives: true
  });

  if (!response.data.id) {
    throw new Error('Google Drive did not return an uploaded file ID.');
  }

  return response.data.id;
};

const downloadMeterPhoto = async (fileId) => {
  const drive = getDriveClient();
  const response = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(response.data);
};

const deleteMeterPhoto = async (fileId) => {
  const drive = getDriveClient();
  await drive.files.delete({ fileId, supportsAllDrives: true });
};

module.exports = { uploadMeterPhoto, downloadMeterPhoto, deleteMeterPhoto };
