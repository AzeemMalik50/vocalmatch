import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import * as streamifier from 'streamifier';

@Injectable()
export class CloudinaryService {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  uploadVideo(buffer: Buffer): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'video',
          folder: 'video-vote-app',
          eager: [{ format: 'jpg', width: 640, crop: 'scale' }], // auto thumbnail
        },
        (err, result) => {
          if (err || !result)
            return reject(
              new InternalServerErrorException(
                err?.message ?? 'Cloudinary upload failed',
              ),
            );
          resolve(result);
        },
      );
      streamifier.createReadStream(buffer).pipe(stream);
    });
  }

  async deleteVideo(publicId: string) {
    return cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
  }
}
