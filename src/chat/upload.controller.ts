import {
  Controller,
  Post,
  Request,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UploadService } from './upload.service';
import { MulterExceptionFilter } from './multer-exception.filter';
import { MAX_ATTACHMENT_BYTES } from './media.util';

@ApiTags('Upload')
@ApiBearerAuth('JWT-auth')
@Controller('upload')
@UseGuards(AuthGuard('jwt'))
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @ApiOperation({
    summary: 'Upload a chat attachment (image, file, or voice note), max 2 MB',
    description:
      'Returns the Cloudinary URL and public id to send along with a chat message (group or private).',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Image, audio, or document up to 2 MB',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Attachment stored on Cloudinary' })
  @ApiResponse({
    status: 400,
    description: 'No file, or file larger than 2 MB',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 415, description: 'Unsupported file type' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_ATTACHMENT_BYTES },
    }),
  )
  @UseFilters(MulterExceptionFilter)
  uploadFile(@UploadedFile() file: Express.Multer.File, @Request() req) {
    return this.uploadService.uploadChatAttachment(file, req.user.id);
  }
}
