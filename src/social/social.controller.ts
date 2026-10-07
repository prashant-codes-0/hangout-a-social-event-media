import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { OptionalJwtGuard } from '../common/guards/optional-jwt.guard';
import { SocialService } from './social.service';

// OptionalJwtGuard leaves `true` (not a user) on anonymous requests
const viewerOf = (req: { user?: { id?: string } | boolean }) =>
  typeof req.user === 'object' ? req.user?.id : undefined;

@ApiTags('People')
@Controller()
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Get('feed')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Activity from the people you follow, newest first',
  })
  @ApiQuery({
    name: 'before',
    required: false,
    description: 'nextBefore from the previous page',
  })
  feed(@Request() req, @Query('before') before?: string) {
    return this.social.feed(req.user.id, before);
  }

  // Fixed paths before people/:id
  @Get('people/search')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Find people by name (at least 2 characters)' })
  @ApiQuery({ name: 'q', required: true })
  search(@Request() req, @Query('q') q: string) {
    return this.social.search(req.user.id, q);
  }

  @Get('people/suggestions')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      "People to follow: your followers you don't follow back, and people from your hangouts",
  })
  suggestions(@Request() req) {
    return this.social.suggestions(req.user.id);
  }

  @Get('people/:id')
  @UseGuards(OptionalJwtGuard)
  @ApiOperation({
    summary:
      "Someone's public profile: follower counts and their public upcoming hangouts",
  })
  @ApiParam({ name: 'id', description: 'User ID' })
  profile(@Param('id') id: string, @Request() req) {
    return this.social.profile(id, viewerOf(req));
  }

  @Get('people/:id/followers')
  @UseGuards(OptionalJwtGuard)
  @ApiQuery({ name: 'before', required: false })
  followers(
    @Param('id') id: string,
    @Request() req,
    @Query('before') before?: string,
  ) {
    return this.social.followers(id, viewerOf(req), before);
  }

  @Get('people/:id/following')
  @UseGuards(OptionalJwtGuard)
  @ApiQuery({ name: 'before', required: false })
  following(
    @Param('id') id: string,
    @Request() req,
    @Query('before') before?: string,
  ) {
    return this.social.following(id, viewerOf(req), before);
  }

  @Get('people/:id/relationship')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Whether you follow them and they follow you' })
  relationship(@Param('id') id: string, @Request() req) {
    return this.social.relationshipWith(req.user.id, id);
  }

  @Post('people/:id/follow')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Follow someone (they get an alert)' })
  follow(@Param('id') id: string, @Request() req) {
    return this.social.follow(req.user.id, id);
  }

  @Delete('people/:id/follow')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Unfollow someone' })
  unfollow(@Param('id') id: string, @Request() req) {
    return this.social.unfollow(req.user.id, id);
  }
}
