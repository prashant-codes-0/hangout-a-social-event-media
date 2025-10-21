import { ApiProperty } from '@nestjs/swagger';

export class ApiResponseDto<T = any> {
  @ApiProperty({
    description: 'Indicates if the request was successful',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'HTTP status code',
    example: 200,
  })
  statusCode: number;

  @ApiProperty({
    description: 'Response message',
    example: 'Operation completed successfully',
  })
  message: string;

  @ApiProperty({
    description: 'Response data',
    required: false,
  })
  data?: T;

  @ApiProperty({
    description: 'Error details (only present when success is false)',
    required: false,
  })
  error?: string;

  @ApiProperty({
    description: 'Timestamp of the response',
    example: '2024-12-20T10:00:00.000Z',
  })
  timestamp: string;

  constructor(
    success: boolean,
    statusCode: number,
    message: string,
    data?: T,
    error?: string,
  ) {
    this.success = success;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
    this.error = error;
    this.timestamp = new Date().toISOString();
  }

  static success<T>(data: T, message = 'Operation completed successfully', statusCode = 200): ApiResponseDto<T> {
    return new ApiResponseDto(true, statusCode, message, data);
  }

  static error(message: string, statusCode = 500, error?: string): ApiResponseDto {
    return new ApiResponseDto(false, statusCode, message, undefined, error);
  }
}