import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Hangout } from './schemas/hangout.schema';
import { JoinRequest, JoinRequestStatus } from './schemas/join-request.schema';
import { User, UserRole } from '../auth/schemas/user.schema';
import { CreateHangoutDto, UpdateHangoutDto } from './dto/hangout.dto';

@Injectable()
export class HangoutsService {
  constructor(
    @InjectModel(Hangout.name)
    private hangoutModel: Model<Hangout>,
    @InjectModel(JoinRequest.name)
    private joinRequestModel: Model<JoinRequest>,
    @InjectModel(User.name)
    private userModel: Model<User>,
  ) { }

  async create(createHangoutDto: CreateHangoutDto, userId: string) {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Only verified users, admins, and sponsors can create hangouts
    if (!user.verified && user.role === UserRole.USER) {
      throw new ForbiddenException('Only verified users, admins, and sponsors can create hangouts');
    }

    const hangout = new this.hangoutModel({
      ...createHangoutDto,
      time: new Date(createHangoutDto.time),
      createdBy: userId,
    });

    return hangout.save();
  }

  async findAll(filters?: { purpose?: string; place?: string; date?: string }, userId?: string) {
    const query: any = { isPublic: true };

    if (filters?.purpose) {
      query.purpose = { $regex: filters.purpose, $options: 'i' };
    }

    if (filters?.place) {
      query.place = { $regex: filters.place, $options: 'i' };
    }

    if (filters?.date) {
      const startDate = new Date(filters.date);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);

      query.time = {
        $gte: startDate,
        $lt: endDate,
      };
    }

    const hangouts = await this.hangoutModel
      .find(query)
      .populate('createdBy', 'name email')
      .populate('blastedBy', 'name email')
      .exec();

    // Add userHasBlasted field for authenticated users
    if (userId) {
      return hangouts.map(hangout => {
        const hangoutObj = hangout.toObject();
        const userHasBlasted = hangout.blastedBy.some(
          (blastedUser: any) => blastedUser._id.toString() === userId
        );
        return {
          ...hangoutObj,
          userHasBlasted,
        };
      });
    }

    return hangouts;
  }

  async findOne(id: string, userId?: string) {
    const hangout = await this.hangoutModel
      .findById(id)
      .populate('createdBy', 'name email')
      .populate('attendees', 'name email')
      .populate('blastedBy', 'name email')
      .exec();

    if (!hangout) {
      throw new NotFoundException('Hangout not found');
    }

    // Get join requests for this hangout
    const joinRequests = await this.joinRequestModel
      .find({ hangoutId: id })
      .populate('userId', 'name email')
      .exec();

    const hangoutObj = hangout.toObject();
    
    // Check if current user has blasted this hangout
    let userHasBlasted = false;
    if (userId) {
      userHasBlasted = hangout.blastedBy.some(
        (blastedUser: any) => blastedUser._id.toString() === userId
      );
    }

    return {
      ...hangoutObj,
      joinRequests,
      userHasBlasted,
    };
  }

  async update(id: string, updateHangoutDto: UpdateHangoutDto, userId: string) {
    const hangout = await this.hangoutModel.findById(id);

    if (!hangout) {
      throw new NotFoundException('Hangout not found');
    }

    if (hangout.createdBy.toString() !== userId) {
      throw new ForbiddenException('You can only update your own hangouts');
    }

    const updateData = { ...updateHangoutDto };
    if (updateHangoutDto.time) {
      updateData.time = new Date(updateHangoutDto.time) as any;
    }

    await this.hangoutModel.findByIdAndUpdate(id, updateData);
    return this.findOne(id);
  }

  async remove(id: string, userId: string) {
    const hangout = await this.hangoutModel.findById(id);

    if (!hangout) {
      throw new NotFoundException('Hangout not found');
    }

    if (hangout.createdBy.toString() !== userId) {
      throw new ForbiddenException('You can only delete your own hangouts');
    }

    await this.hangoutModel.findByIdAndDelete(id);
    await this.joinRequestModel.deleteMany({ hangoutId: id });
    return { message: 'Hangout deleted successfully' };
  }

  async requestToJoin(hangoutId: string, userId: string) {
    const hangout = await this.hangoutModel.findById(hangoutId);

    if (!hangout) {
      throw new NotFoundException('Hangout not found');
    }

    // Check if user already has a request
    const existingRequest = await this.joinRequestModel.findOne({
      hangoutId,
      userId,
    });

    if (existingRequest) {
      throw new BadRequestException('You already have a request for this hangout');
    }

    // Check if hangout is full
    if (hangout.attendees.length >= hangout.capacity) {
      throw new BadRequestException('This hangout is full');
    }

    const joinRequest = new this.joinRequestModel({
      hangoutId,
      userId,
    });

    return joinRequest.save();
  }

  async handleJoinRequest(requestId: string, status: JoinRequestStatus, userId: string) {
    const joinRequest = await this.joinRequestModel
      .findById(requestId)
      .populate('hangoutId')
      .exec();

    if (!joinRequest) {
      throw new NotFoundException('Join request not found');
    }

    const hangout = await this.hangoutModel.findById(joinRequest.hangoutId);
    if (!hangout) {
      throw new NotFoundException('Hangout not found');
    }

    if (hangout.createdBy.toString() !== userId) {
      throw new ForbiddenException('You can only handle requests for your own hangouts');
    }

    joinRequest.status = status;
    await joinRequest.save();

    // If approved, add user to attendees
    if (status === JoinRequestStatus.APPROVED) {
      if (!hangout.attendees.includes(joinRequest.userId)) {
        hangout.attendees.push(joinRequest.userId);
        await hangout.save();
      }
    }

    return joinRequest;
  }

  async toggleBlast(hangoutId: string, userId: string) {
    const hangout = await this.hangoutModel.findById(hangoutId);

    if (!hangout) {
      throw new NotFoundException('Hangout not found');
    }

    const userObjectId = userId as any;
    const hasBlasted = hangout.blastedBy.includes(userObjectId);

    if (hasBlasted) {
      // Remove blast (downvote)
      hangout.blastedBy = hangout.blastedBy.filter(
        id => id.toString() !== userId
      );
      hangout.blasts = Math.max(0, hangout.blasts - 1);
    } else {
      // Add blast (upvote)
      hangout.blastedBy.push(userObjectId);
      hangout.blasts += 1;
    }

    await hangout.save();

    return {
      hangoutId,
      blasts: hangout.blasts,
      userBlasted: !hasBlasted,
      action: hasBlasted ? 'removed' : 'added',
    };
  }

  async getMyHangouts(userId: string) {
    return this.hangoutModel
      .find({ createdBy: userId })
      .populate('createdBy', 'name email')
      .populate('attendees', 'name email')
      .sort({ createdAt: -1 })
      .exec();
  }

  async getHangoutsByUser(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.hangoutModel
      .find({ createdBy: userId })
      .populate('createdBy', 'name email')
      .populate('attendees', 'name email')
      .sort({ createdAt: -1 })
      .exec();
  }

  async leaveHangout(hangoutId: string, userId: string) {
    const hangout = await this.hangoutModel.findById(hangoutId);

    if (!hangout) {
      throw new NotFoundException('Hangout not found');
    }

    // Check if user is actually in the hangout
    const isAttendee = hangout.attendees.some(
      attendeeId => attendeeId.toString() === userId
    );

    if (!isAttendee) {
      throw new BadRequestException('You are not an attendee of this hangout');
    }

    // Remove user from attendees array
    hangout.attendees = hangout.attendees.filter(
      attendeeId => attendeeId.toString() !== userId
    );

    // Update any approved join request to "rejected" or remove it
    await this.joinRequestModel.deleteMany({
      hangoutId,
      userId,
    });

    await hangout.save();

    return {
      message: 'Successfully left the hangout',
      hangoutId,
      hangoutTitle: hangout.title,
      remainingAttendees: hangout.attendees.length,
    };
  }

  async getJoinedHangouts(userId: string) {
    return this.hangoutModel
      .find({ 
        attendees: userId,
        createdBy: { $ne: userId } // Exclude hangouts created by the user
      })
      .populate('createdBy', 'name email')
      .populate('attendees', 'name email')
      .sort({ time: 1 }) // Sort by upcoming events first
      .exec();
  }

  async getStats() {
    const totalHangouts = await this.hangoutModel.countDocuments();
    const publicHangouts = await this.hangoutModel.countDocuments({ isPublic: true });
    const privateHangouts = await this.hangoutModel.countDocuments({ isPublic: false });
    const sponsoredHangouts = await this.hangoutModel.countDocuments({ sponsored: true });
    const totalUsers = await this.userModel.countDocuments();
    const totalJoinRequests = await this.joinRequestModel.countDocuments();

    return {
      hangouts: {
        total: totalHangouts,
        public: publicHangouts,
        private: privateHangouts,
        sponsored: sponsoredHangouts,
      },
      users: {
        total: totalUsers,
      },
      joinRequests: {
        total: totalJoinRequests,
      },
    };
  }
}