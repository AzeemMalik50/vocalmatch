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
          folder: 'vocalmatch/videos',
          eager: [
            {
              format: 'jpg',
              width: 720,
              crop: 'scale',
              start_offset: 'auto',
            },
          ],
        },
        (err, result) => {
          if (err || !result) {
            return reject(
              new InternalServerErrorException(
                err?.message ?? 'Cloudinary video upload failed',
              ),
            );
          }
          resolve(result);
        },
      );
      streamifier.createReadStream(buffer).pipe(stream);
    });
  }

  /**
   * Upload an image (e.g. avatar). Auto square-crops with face detection
   * and serves at 512x512 — perfect for circular avatars.
   */
  uploadImage(
    buffer: Buffer,
    subfolder: string = 'images',
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'image',
          folder: `vocalmatch/${subfolder}`,
          transformation: [
            {
              width: 512,
              height: 512,
              crop: 'fill',
              gravity: 'face',
            },
            { quality: 'auto', fetch_format: 'auto' },
          ],
        },
        (err, result) => {
          if (err || !result) {
            return reject(
              new InternalServerErrorException(
                err?.message ?? 'Cloudinary image upload failed',
              ),
            );
          }
          resolve(result);
        },
      );
      streamifier.createReadStream(buffer).pipe(stream);
    });
  }

  deleteVideo(publicId: string) {
    return cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
  }

  deleteImage(publicId: string) {
    return cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  }
}
