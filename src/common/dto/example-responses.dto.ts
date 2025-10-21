import { ApiProperty } from '@nestjs/swagger';

export class SuccessResponseExample {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 200 })
  statusCode: number;

  @ApiProperty({ example: 'Operation completed successfully' })
  message: string;

  @ApiProperty({
    example: {
      id: '507f1f77bcf86cd799439011',
      name: 'John Doe',
      email: 'john@example.com'
    }
  })
  data: any;

  @ApiProperty({ example: '2024-12-20T10:00:00.000Z' })
  timestamp: string;
}

export class ErrorResponseExample {
  @ApiProperty({ example: false })
  success: boolean;

  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: 'Validation failed' })
  message: string;

  @ApiProperty({ example: 'Bad Request', required: false })
  error?: string;

  @ApiProperty({ example: '2024-12-20T10:00:00.000Z' })
  timestamp: string;
}