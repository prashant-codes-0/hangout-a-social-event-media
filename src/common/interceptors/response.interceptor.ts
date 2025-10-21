import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponseDto } from '../dto/api-response.dto';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponseDto<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponseDto<T>> {
    const response = context.switchToHttp().getResponse();
    
    return next.handle().pipe(
      map((data) => {
        const statusCode = response.statusCode;
        let message = 'Operation completed successfully';

        // Customize messages based on HTTP method and status code
        const request = context.switchToHttp().getRequest();
        const method = request.method;
        
        switch (method) {
          case 'POST':
            if (statusCode === 201) {
              message = 'Resource created successfully';
            }
            break;
          case 'PUT':
          case 'PATCH':
            message = 'Resource updated successfully';
            break;
          case 'DELETE':
            message = 'Resource deleted successfully';
            break;
          case 'GET':
            message = 'Data retrieved successfully';
            break;
        }

        // If data already has a message property, use it
        if (data && typeof data === 'object' && 'message' in data) {
          message = data.message;
          // Remove the message from data to avoid duplication
          const { message: _, ...cleanData } = data;
          data = cleanData as T;
        }

        return ApiResponseDto.success(data, message, statusCode);
      }),
    );
  }
}