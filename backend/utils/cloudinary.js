const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');

const getCloudinaryClient = () => {
  const configuration = {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  };
  const missingConfiguration = [
    !configuration.cloud_name && 'CLOUDINARY_CLOUD_NAME',
    !configuration.api_key && 'CLOUDINARY_API_KEY',
    !configuration.api_secret && 'CLOUDINARY_API_SECRET'
  ].filter(Boolean);

  if (missingConfiguration.length) {
    throw new Error(`Cloudinary configuration is missing: ${missingConfiguration.join(', ')}`);
  }

  cloudinary.config(configuration);
  return cloudinary;
};

const uploadMeterPhoto = async ({ buffer, fileName }) => {
  const client = getCloudinaryClient();

  return new Promise((resolve, reject) => {
    const uploadStream = client.uploader.upload_stream({
      public_id: fileName,
      asset_folder: process.env.CLOUDINARY_METER_IMAGE_FOLDER || 'meter-photos',
      resource_type: 'image',
      type: 'authenticated'
    }, (error, result) => {
      if (error) {
        return reject(error);
      }
      if (!result?.public_id) {
        return reject(new Error('Cloudinary did not return an uploaded image ID.'));
      }
      resolve(result.public_id);
    });

    Readable.from([buffer]).pipe(uploadStream);
  });
};

const downloadMeterPhoto = async (publicId) => {
  const client = getCloudinaryClient();
  const imageUrl = client.url(publicId, {
    secure: true,
    type: 'authenticated',
    sign_url: true,
    resource_type: 'image'
  });
  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(`Cloudinary image download failed with status ${response.status}.`);
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type')
  };
};

const deleteMeterPhoto = async (publicId) => {
  const client = getCloudinaryClient();
  const result = await client.uploader.destroy(publicId, {
    resource_type: 'image',
    type: 'authenticated'
  });

  if (result.result !== 'ok' && result.result !== 'not found') {
    throw new Error(`Cloudinary image deletion failed: ${result.result}.`);
  }
};

module.exports = { uploadMeterPhoto, downloadMeterPhoto, deleteMeterPhoto };