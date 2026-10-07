import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Response } from 'express';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { ApiResponseDto } from '../common/dto/api-response.dto';

// multer rejects an oversized (or otherwise malformed) upload before any controller
// logic runs; map its LIMIT_* codes to a friendly 400 and pass everything else
// through the app-wide handler.
@Catch()
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const code = (exception as { code?: unknown })?.code;
    if (typeof code === 'string' && code.startsWith('LIMIT_')) {
      const response = host.switchToHttp().getResponse<Response>();
      const message =
        code === 'LIMIT_FILE_SIZE' ? 'Files must be 2 MB or smaller' : `Upload failed (${code})`;
      response.status(400).json(ApiResponseDto.error(message, 400, 'Bad Request'));
      return;
    }
    new HttpExceptionFilter().catch(exception, host);
  }
}
